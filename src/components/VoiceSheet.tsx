import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { MatchSheet, TeamPlayerGrid, type TeamWithPlayers } from './PlayerSheet'
import { heardInFull, listenOnce, speechLang, type Heard, type Listening, type SpeechError } from '../lib/speech'
import { understandVoice, type VoiceCommand, type VoicePlayer } from '../lib/voiceApi'
import { startVoiceAttempt, type VoiceAttemptTracker } from '../lib/voiceMetrics'
import { understandLocally } from '../../supabase/functions/_shared/voiceLocal.ts'
import { goalParts, hasCorrection, mentionsAssist } from '../../supabase/functions/_shared/voiceCommand.ts'

export type VoiceAction = VoiceCommand['action']

// What the referee confirmed: everything needed to record it
export interface ConfirmedVoice {
  action: Exclude<VoiceAction, 'unknown'>
  playerId: string | null
  otherId: string | null
  suspensionMinutes: 2 | 3 | null
}

// How the sentence was heard: whether listening ended normally and the words were final
export type Capture = Pick<Heard, 'end' | 'final'>
const IN_FULL: Capture = { end: 'done', final: true }

type Stage =
  | { kind: 'listening'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'result'; text: string; command: VoiceCommand; capture: Capture }
  | { kind: 'error'; error: SpeechError | 'network' | 'failed' | 'timeout' }

const PLAYER_ACTIONS: VoiceAction[] = ['goal', 'own_goal', 'yellow_card', 'red_card', 'interception', 'swap']

// The mic is tapped, the referee says what happened, and the action shows here to confirm.
// Nothing is saved until Confirm; Edit opens the usual dialog for that action instead.
export function VoiceSheet({ leagueId, playingTeams, allTeams, cards, swaps, clockRunning, undoLabel, holding = false, letGo = 0, holdCut = 0, autoSave = false, onConfirm, onEdit, onClose }: {
  leagueId: string
  playingTeams: TeamWithPlayers[]
  // Every team of the session, for a swap with a waiting team
  allTeams: TeamWithPlayers[]
  cards: boolean
  swaps: boolean
  clockRunning: boolean
  // The event Undo would take back, or null when there is nothing to undo
  undoLabel: string | null
  // Push to talk: the mic button is held down; letGo counts each release after a hold, and holdCut
  // each hold taken away before the referee let go (a cancelled touch, the app hidden)
  holding?: boolean
  letGo?: number
  holdCut?: number
  // Save a clear command on its own, without Confirm
  autoSave?: boolean
  // auto: saved without Confirm, because autoSave is on and the command was clear
  onConfirm: (c: ConfirmedVoice, auto?: boolean) => void
  onEdit: (action: 'goal' | 'card' | 'interception' | 'swap') => void
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const [stage, setStage] = useState<Stage>({ kind: 'listening', text: '' })
  const [attempt, setAttempt] = useState(0)
  const listening = useRef<Listening | null>(null)
  const lang: 'ar' | 'en' = i18n.language.startsWith('ar') ? 'ar' : 'en'

  const playingIds = new Set(playingTeams.flatMap((tm) => tm.players.map((p) => p.id)))
  const roster: VoicePlayer[] = (swaps ? allTeams : playingTeams).flatMap(({ team, players }) =>
    players.map((p) => ({ id: p.id, name: p.name, team: team.color, playing: playingIds.has(p.id) })))
  const rosterRef = useRef(roster)
  rosterRef.current = roster
  const allPlayers = allTeams.flatMap((tm) => tm.players)
  const nameOf = (id: string | null) => allPlayers.find((p) => p.id === id)?.name ?? '?'
  const teamOf = (id: string | null) => allTeams.find((tm) => tm.players.some((p) => p.id === id))?.team.id ?? null

  // The mic takes a moment to start: words before it is ready are lost, so the referee is told when.
  // It is also off for a moment between the rounds of a held mic, and from Done on.
  const [ready, setReady] = useState(false)
  const [micOn, setMicOn] = useState(false)
  const holdingRef = useRef(holding)
  holdingRef.current = holding
  // This try's timings and outcome (no words or names are kept)
  const metric = useRef<VoiceAttemptTracker | null>(null)

  useEffect(() => {
    // Everything below belongs to this try only: once it is over (closed, or tried again), a late
    // word, mic event or answer changes nothing, and the request to Claude is cancelled
    let live = true
    const request = new AbortController()
    // A press opens the sheet before anyone knows whether it is a tap or a hold: it counts as a
    // tap until it is let go, or taken away, as a hold
    const m = startVoiceAttempt('tap')
    metric.current = m
    let firstWords = true
    let buzzed = false
    const l = listenOnce(speechLang(lang), (text) => {
      if (!live) return
      if (firstWords) { firstWords = false; m.firstWords() }
      setStage({ kind: 'listening', text })
    }, {
      onLive: (on) => {
        if (!live) return
        setMicOn(on)
        if (!on || buzzed) return
        buzzed = true
        m.micOn()
        setReady(true)
        // A short buzz says "speak now" without looking at the screen (Android; iPhone has none)
        if (holdingRef.current) navigator.vibrate?.(40)
      },
      // A pause while the mic is still held does not end the sentence
      keepListening: () => holdingRef.current,
    })
    listening.current = l
    l.done.then(async (heard) => {
      if (!live) return
      m.heard(heard)
      const { text, alternatives } = heard
      if (!text) { setStage({ kind: 'error', error: 'no-speech' }); return }
      // A cut-off sentence is still understood, but never saved without Confirm
      const capture: Capture = { end: heard.end, final: heard.final }
      // "وقّف", "هدف العجل", "قطع ليث" with every player clear: no need to ask Claude
      const local = understandLocally(text, rosterRef.current, alternatives)
      if (local) {
        m.interpreted('local')
        m.shown()
        setStage({ kind: 'result', text, command: local, capture })
        return
      }
      setStage({ kind: 'thinking', text })
      m.asking()
      const res = await understandVoice({ leagueId, text, alternatives, lang, players: rosterRef.current }, { signal: request.signal })
      if (!live) return
      m.interpreted('server', res.ok ? { modelMs: res.modelMs } : { error: res.error })
      m.shown()
      if (res.ok) setStage({ kind: 'result', text, command: res.command, capture })
      else setStage({ kind: 'error', error: res.error === 'cancelled' ? 'failed' : res.error })
    }, (error: SpeechError) => {
      if (!live) return
      m.heard(error)
      setStage({ kind: 'error', error })
    })
    return () => {
      live = false
      request.abort()
      l.cancel()
      m.finish('closed')
    }
  }, [attempt, lang, leagueId])

  // Done, or letting go of a held mic: the sentence ends there, and what was heard goes on
  const endSpeech = () => {
    metric.current?.speechEnded()
    listening.current?.stop()
  }
  // Both come only after a press long enough to be a hold
  const firstLetGo = useRef(letGo)
  useEffect(() => {
    if (letGo === firstLetGo.current) return
    metric.current?.held()
    endSpeech()
  }, [letGo])
  // A hold taken away: what was heard goes on, marked as cut off, so it is never saved on its own
  const firstCut = useRef(holdCut)
  useEffect(() => {
    if (holdCut === firstCut.current) return
    metric.current?.held()
    metric.current?.speechEnded()
    listening.current?.interrupt()
  }, [holdCut])

  // Back to listening at once, so the tap is seen to work before anything is heard
  const retry = () => {
    metric.current?.finish('retried')
    setReady(false)
    setMicOn(false)
    setStage({ kind: 'listening', text: '' })
    setAttempt((n) => n + 1)
  }
  const secondary = 'flex-1 min-h-[48px] rounded-xl bg-gray-700 hover:bg-gray-600 font-semibold'
  const primary = 'flex-1 min-h-[48px] rounded-xl bg-green-600 hover:bg-green-500 font-bold disabled:opacity-40'
  const retryButton = <button type="button" onClick={retry} className={secondary}>{t('voice.again')}</button>

  if (stage.kind === 'listening' || stage.kind === 'thinking') {
    return (
      <MatchSheet
        title={stage.kind === 'listening' ? t('voice.listening') : t('voice.thinking')}
        onClose={onClose}
        footer={stage.kind === 'listening' && (
          <button type="button" onClick={endSpeech} className={primary}>{t('voice.done')}</button>
        )}
      >
        <div className="flex flex-col items-center gap-3 py-4">
          {/* Pulses only while the mic really takes words */}
          <span className={`text-4xl ${stage.kind === 'listening' && micOn ? 'animate-pulse' : 'opacity-50'}`} aria-hidden="true">🎙️</span>
          {stage.kind === 'listening' && !ready && !stage.text
            ? <p className="min-h-[3rem] text-center text-lg text-gray-400">{t('voice.starting')}</p>
            : <p className="min-h-[3rem] text-center text-lg" dir="auto">{stage.text || t('voice.hint')}</p>}
          {stage.kind === 'listening' && micOn && holding && <p className="text-sm font-semibold text-green-300">{t('voice.letGo')}</p>}
        </div>
      </MatchSheet>
    )
  }

  if (stage.kind === 'error') {
    return (
      <MatchSheet title={t('voice.notUnderstood')} onClose={onClose} footer={retryButton}>
        <p role="alert" className="py-2 text-orange-300">{t(`voice.error.${stage.error}`)}</p>
      </MatchSheet>
    )
  }

  return (
    <VoiceResult
      key={attempt}
      text={stage.text}
      command={stage.command}
      capture={stage.capture}
      players={roster}
      playingTeams={playingTeams}
      allTeams={allTeams}
      cards={cards}
      swaps={swaps}
      clockRunning={clockRunning}
      undoLabel={undoLabel}
      nameOf={nameOf}
      teamOf={teamOf}
      retryButton={retryButton}
      autoSave={autoSave}
      onConfirm={(c, auto, corrected) => {
        metric.current?.finish(auto ? 'auto-saved' : 'confirmed', corrected)
        onConfirm(c, auto)
      }}
      onEdit={(target) => {
        metric.current?.finish('edited')
        onEdit(target)
      }}
      onClose={onClose}
    />
  )
}

// Clear enough to save without Confirm: the whole sentence was heard (nothing cut it off and every
// word was final), the referee did not correct himself, every player was named outright (not picked
// from guesses), nothing is missing, and it can be done now. Undo is never saved this way: it takes
// an event away. A goal whose assist was spoken but not placed («هدف ليث من دجل») is missing its
// assister, and one whose words leave the roles open («هدف حلو من ليث») is for the referee to check.
export function clearCommand(c: VoiceCommand, { cards, swaps, clockRunning, teamOf, players, heard = '', capture = IN_FULL }: {
  cards: boolean
  swaps: boolean
  clockRunning: boolean
  teamOf: (id: string | null) => string | null
  // Who could be named: the roster tells a player's name from any other word
  players: readonly VoicePlayer[]
  // What the referee said
  heard?: string
  // How it was heard
  capture?: Capture
}): boolean {
  if (!heardInFull(capture) || hasCorrection(heard)) return false
  switch (c.action) {
    case 'pause': return clockRunning
    case 'resume': return !clockRunning
    case 'goal': {
      const said = goalParts(heard, players)
      return said.clear && !!c.playerId && c.otherId !== c.playerId
        && (!!c.otherId || (c.otherCandidates.length === 0 && !said.assistSpoken))
    }
    case 'own_goal':
    case 'interception': return !!c.playerId
    case 'yellow_card': return cards && !!c.playerId
    case 'red_card': return cards && !!c.playerId && !!c.suspensionMinutes
    case 'swap': return swaps && !!c.playerId && !!c.otherId && teamOf(c.playerId) !== teamOf(c.otherId)
    default: return false
  }
}

function VoiceResult({ text, command, capture, players, playingTeams, allTeams, cards, swaps, clockRunning, undoLabel, nameOf, teamOf, retryButton, autoSave, onConfirm, onEdit, onClose }: {
  text: string
  command: VoiceCommand
  capture: Capture
  // The roster the words were read against
  players: readonly VoicePlayer[]
  playingTeams: TeamWithPlayers[]
  allTeams: TeamWithPlayers[]
  cards: boolean
  swaps: boolean
  clockRunning: boolean
  undoLabel: string | null
  nameOf: (id: string | null) => string
  teamOf: (id: string | null) => string | null
  retryButton: ReactNode
  autoSave: boolean
  // corrected: the referee changed a player or the minutes that were put forward
  onConfirm: (c: ConfirmedVoice, auto: boolean, corrected: boolean) => void
  onEdit: (action: 'goal' | 'card' | 'interception' | 'swap') => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { action } = command

  // Saved on its own (when the referee chose that) only when nothing about it was a guess
  const sure = autoSave && clearCommand(command, { cards, swaps, clockRunning, teamOf, players, heard: text, capture })
  const autoSaved = useRef(false)
  useEffect(() => {
    if (!sure || autoSaved.current) return
    autoSaved.current = true
    const swapOrGoal = command.action === 'goal' || command.action === 'swap'
    onConfirm({
      action: command.action as ConfirmedVoice['action'],
      playerId: command.playerId,
      otherId: swapOrGoal ? command.otherId : null,
      suspensionMinutes: command.action === 'red_card' ? command.suspensionMinutes : null,
    }, true, false)
  }, [sure, command, onConfirm])
  // A list of one is no question: that player is taken, and the referee still confirms
  const onlyOne = (ids: string[], teams: TeamWithPlayers[], not: string | null) => {
    const ok = [...new Set(ids)].filter((id) => id !== not && teams.some((tm) => tm.players.some((p) => p.id === id)))
    return ok.length === 1 ? ok[0] : null
  }
  // A guess that was also offered for the other role is not taken for this one: the assister must
  // never show up as the scorer
  const firstPlayer = command.playerId ?? onlyOne(
    command.candidates.filter((id) => !command.otherCandidates.includes(id)),
    action === 'swap' ? allTeams : playingTeams, command.otherId)
  const secondPlayer = command.otherId ?? ((action === 'goal' || action === 'swap') && firstPlayer
    ? onlyOne(command.otherCandidates, action === 'swap'
      ? allTeams.filter((tm) => tm.team.id !== teamOf(firstPlayer))
      : playingTeams, firstPlayer)
    : null)
  const [playerId, setPlayerId] = useState(firstPlayer)
  const [otherId, setOtherId] = useState(secondPlayer)
  // After "not this player" the whole list is offered, not just the guesses
  const [widened, setWidened] = useState(false)
  const [minutes, setMinutes] = useState(command.suspensionMinutes)
  // Being saved on its own: the page closes this and says what was saved
  if (sure) return null
  const heard = <>
    <p className="text-sm text-gray-400 mb-3" dir="auto">«{text}»</p>
    {/* The mic failed, something took it away, time ran out or the app went to the background before the referee finished */}
    {capture.end !== 'done' && <p className="text-sm font-semibold text-orange-300 mb-3">{t('voice.cutOff')}</p>}
  </>
  const primary = 'flex-1 min-h-[48px] rounded-xl bg-green-600 hover:bg-green-500 font-bold disabled:opacity-40'
  const secondary = 'flex-1 min-h-[48px] rounded-xl bg-gray-700 hover:bg-gray-600 font-semibold'

  const off = ((action === 'yellow_card' || action === 'red_card') && !cards) || (action === 'swap' && !swaps)
  const nothingToDo = (action === 'pause' && !clockRunning) || (action === 'resume' && clockRunning) || (action === 'undo' && !undoLabel)
  if (action === 'unknown' || off || nothingToDo) {
    return (
      <MatchSheet title={t('voice.notUnderstood')} onClose={onClose} footer={retryButton}>
        {heard}
        <p className="text-orange-300">{t(off ? 'voice.off' : nothingToDo ? `voice.nothing.${action}` : 'voice.unknownHint')}</p>
      </MatchSheet>
    )
  }

  const needsPlayer = PLAYER_ACTIONS.includes(action)
  const swap = action === 'swap'
  // A swap is between two teams; nobody assists their own goal
  const sameTeamSwap = swap && !!playerId && !!otherId && teamOf(playerId) === teamOf(otherId)
  const complete = (!needsPlayer || !!playerId) && (!swap || (!!otherId && !sameTeamSwap))
    && (!playerId || playerId !== otherId) && (action !== 'red_card' || !!minutes)
  // Picking the assister as the scorer leaves the goal with no assist
  const pickPlayer = (id: string) => {
    setPlayerId(id)
    if (id === otherId) setOtherId(null)
  }
  const editTarget = action === 'goal' || action === 'own_goal' ? 'goal'
    : action === 'yellow_card' || action === 'red_card' ? 'card'
    : action === 'interception' || action === 'swap' ? action : null

  // Who it could be: Claude's candidates, or everyone who can take part
  const only = (teams: TeamWithPlayers[], ids: string[]) => ids.length > 0
    ? teams.map((tm) => ({ ...tm, players: tm.players.filter((p) => ids.includes(p.id)) }))
    : teams
  const pickFrom = only(swap ? allTeams : playingTeams, widened ? [] : command.candidates)
  // A swap's second player comes from another team; a goal's assister from the pitch
  const otherFrom = swap
    ? only(allTeams.filter((tm) => tm.team.id !== teamOf(playerId)), widened ? [] : command.otherCandidates)
    // (never the scorer: nobody assists their own goal)
    : only(playingTeams, widened ? [] : command.otherCandidates)
      .map((tm) => ({ ...tm, players: tm.players.filter((p) => p.id !== playerId) }))
  const pickOther = (id: string) => { if (id !== playerId) setOtherId(id) }
  // Asked only when the referee spoke of an assist that could not be placed: from the guesses, or
  // from everyone on the pitch when there were none
  const askAssist = action === 'goal' && !!playerId && !otherId && (command.otherCandidates.length > 0 || mentionsAssist(text, players))

  // Filling in what was missing is not a correction; changing what was put forward is
  const changed = <T,>(proposed: T | null, final: T | null) => proposed !== null && final !== proposed
  const corrected = changed(firstPlayer, playerId) || changed(secondPlayer, otherId) || changed(command.suspensionMinutes, minutes)
  const confirm = () => onConfirm({ action, playerId, otherId: action === 'goal' || swap ? otherId : null, suspensionMinutes: action === 'red_card' ? minutes : null }, false, corrected)

  return (
    <MatchSheet
      title={t(`voice.action.${action}`)}
      onClose={onClose}
      footer={<>
        {editTarget && <button type="button" onClick={() => onEdit(editTarget)} className={secondary}>{t('common.edit')}</button>}
        <button type="button" onClick={confirm} disabled={!complete} className={primary}>{t('common.confirm')}</button>
      </>}
    >
      {heard}
      {action === 'undo' && <p className="text-lg font-semibold">{undoLabel}</p>}
      {needsPlayer && playerId && (
        <div className="rounded-xl bg-gray-700 p-3 mb-3 space-y-1">
          <p className="text-xl font-bold" dir="auto">{nameOf(playerId)}</p>
          {action === 'goal' && <p className="text-sm text-gray-300" dir="auto">{otherId ? t('voice.assist', { name: nameOf(otherId) }) : t('goal.noAssist')}</p>}
          {swap && <p className="text-sm text-gray-300" dir="auto">⇄ {otherId ? nameOf(otherId) : '?'}</p>}
          <button type="button" onClick={() => { setPlayerId(null); setWidened(true); if (swap) setOtherId(null) }} className="text-sm text-blue-300 underline">
            {t(swap ? 'voice.changeSwap' : 'voice.changePlayer')}
          </button>
        </div>
      )}
      {askAssist && (
        <>
          <p className="text-sm text-gray-300 mb-2">{t('voice.whoAssisted')}</p>
          <TeamPlayerGrid teams={otherFrom} onPick={pickOther} />
        </>
      )}
      {swap && !playerId && (
        <>
          <p className="text-sm text-gray-300 mb-2">{t('swap.selectFirst')}</p>
          <TeamPlayerGrid teams={pickFrom} onPick={setPlayerId} />
        </>
      )}
      {swap && playerId && !otherId && (
        <>
          <p className="text-sm text-gray-300 mb-2" dir="auto">{t('voice.swapWith', { name: nameOf(playerId) })}</p>
          <TeamPlayerGrid teams={otherFrom} onPick={pickOther} />
        </>
      )}
      {needsPlayer && !playerId && !swap && (
        <>
          {action === 'goal' && otherId && (
            <div className="rounded-xl bg-gray-700 p-3 mb-3 space-y-2">
              <p className="text-sm text-gray-300" dir="auto">{t('voice.assist', { name: nameOf(otherId) })}</p>
              {/* "هدف من ليث" can come back as an assist: one tap makes ليث the scorer, with no assist */}
              <button type="button" onClick={() => pickPlayer(otherId)} className="text-sm text-blue-300 underline" dir="auto">
                {t('voice.assisterScored', { name: nameOf(otherId) })}
              </button>
            </div>
          )}
          <p className="text-sm text-gray-300 mb-2">{action === 'goal' ? t('goal.whoScored') : t('voice.whichPlayer')}</p>
          <TeamPlayerGrid teams={pickFrom} onPick={pickPlayer} />
        </>
      )}
      {sameTeamSwap && <p role="alert" className="text-orange-300">{t('voice.swapSameTeam')}</p>}
      {action === 'red_card' && playerId && (
        <div className="flex gap-3 mt-2">
          {([2, 3] as const).map((m) => (
            <button key={m} type="button" aria-pressed={minutes === m} onClick={() => setMinutes(m)}
              className={`flex-1 min-h-[52px] rounded-xl font-bold ${minutes === m ? 'bg-red-500' : 'bg-red-800 hover:bg-red-700'}`}>
              {t('card.min', { count: m })}
            </button>
          ))}
        </div>
      )}
    </MatchSheet>
  )
}
