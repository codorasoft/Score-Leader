import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { MatchSheet, TeamPlayerGrid, type TeamWithPlayers } from './PlayerSheet'
import { listenOnce, speechLang, type Listening, type SpeechError } from '../lib/speech'
import { understandVoice, type VoiceCommand, type VoicePlayer } from '../lib/voiceApi'
import { understandLocally } from '../../supabase/functions/_shared/voiceLocal.ts'

export type VoiceAction = VoiceCommand['action']

// What the referee confirmed: everything needed to record it
export interface ConfirmedVoice {
  action: Exclude<VoiceAction, 'unknown'>
  playerId: string | null
  otherId: string | null
  suspensionMinutes: 2 | 3 | null
}

type Stage =
  | { kind: 'listening'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'result'; text: string; command: VoiceCommand }
  | { kind: 'error'; error: SpeechError | 'network' | 'failed' }

const PLAYER_ACTIONS: VoiceAction[] = ['goal', 'own_goal', 'yellow_card', 'red_card', 'interception', 'swap']

// The mic is tapped, the referee says what happened, and the action shows here to confirm.
// Nothing is saved until Confirm; Edit opens the usual dialog for that action instead.
export function VoiceSheet({ leagueId, playingTeams, allTeams, cards, swaps, clockRunning, undoLabel, onConfirm, onEdit, onClose }: {
  leagueId: string
  playingTeams: TeamWithPlayers[]
  // Every team of the session, for a swap with a waiting team
  allTeams: TeamWithPlayers[]
  cards: boolean
  swaps: boolean
  clockRunning: boolean
  // The event Undo would take back, or null when there is nothing to undo
  undoLabel: string | null
  onConfirm: (c: ConfirmedVoice) => void
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

  useEffect(() => {
    let live = true
    const l = listenOnce(speechLang(lang), (text) => { if (live) setStage({ kind: 'listening', text }) })
    listening.current = l
    l.done.then(async ({ text, alternatives }) => {
      if (!live) return
      if (!text) { setStage({ kind: 'error', error: 'no-speech' }); return }
      // "وقّف" or "هدف العجل" with one clear player: no need to ask Claude
      const local = understandLocally(text, rosterRef.current)
      if (local) { setStage({ kind: 'result', text, command: local }); return }
      setStage({ kind: 'thinking', text })
      const res = await understandVoice({ leagueId, text, alternatives, lang, players: rosterRef.current })
      if (!live) return
      setStage(res.ok ? { kind: 'result', text, command: res.command } : { kind: 'error', error: res.error })
    }, (error: SpeechError) => { if (live) setStage({ kind: 'error', error }) })
    return () => { live = false; l.cancel() }
  }, [attempt, lang, leagueId])

  // Back to listening at once, so the tap is seen to work before anything is heard
  const retry = () => {
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
          <button type="button" onClick={() => listening.current?.stop()} className={primary}>{t('voice.done')}</button>
        )}
      >
        <div className="flex flex-col items-center gap-3 py-4">
          <span className={`text-4xl ${stage.kind === 'listening' ? 'animate-pulse' : ''}`} aria-hidden="true">🎙️</span>
          <p className="min-h-[3rem] text-center text-lg" dir="auto">{stage.text || t('voice.hint')}</p>
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
      playingTeams={playingTeams}
      allTeams={allTeams}
      cards={cards}
      swaps={swaps}
      clockRunning={clockRunning}
      undoLabel={undoLabel}
      nameOf={nameOf}
      teamOf={teamOf}
      retryButton={retryButton}
      onConfirm={onConfirm}
      onEdit={onEdit}
      onClose={onClose}
    />
  )
}

function VoiceResult({ text, command, playingTeams, allTeams, cards, swaps, clockRunning, undoLabel, nameOf, teamOf, retryButton, onConfirm, onEdit, onClose }: {
  text: string
  command: VoiceCommand
  playingTeams: TeamWithPlayers[]
  allTeams: TeamWithPlayers[]
  cards: boolean
  swaps: boolean
  clockRunning: boolean
  undoLabel: string | null
  nameOf: (id: string | null) => string
  teamOf: (id: string | null) => string | null
  retryButton: ReactNode
  onConfirm: (c: ConfirmedVoice) => void
  onEdit: (action: 'goal' | 'card' | 'interception' | 'swap') => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { action } = command
  // A list of one is no question: that player is taken, and the referee still confirms
  const onlyOne = (ids: string[], teams: TeamWithPlayers[], not: string | null) => {
    const ok = [...new Set(ids)].filter((id) => id !== not && teams.some((tm) => tm.players.some((p) => p.id === id)))
    return ok.length === 1 ? ok[0] : null
  }
  const firstPlayer = command.playerId ?? onlyOne(command.candidates, action === 'swap' ? allTeams : playingTeams, command.otherId)
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
  const heard = <p className="text-sm text-gray-400 mb-3" dir="auto">«{text}»</p>
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
    : only(playingTeams, widened ? [] : command.otherCandidates)
  const pickOther = (id: string) => { if (id !== playerId) setOtherId(id) }
  // Asked only when the referee named an assister Claude could not place
  const askAssist = action === 'goal' && !!playerId && !otherId && command.otherCandidates.length > 0

  const confirm = () => onConfirm({ action, playerId, otherId: action === 'goal' || swap ? otherId : null, suspensionMinutes: action === 'red_card' ? minutes : null })

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
