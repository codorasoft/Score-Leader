import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { MatchSheet, TeamPlayerGrid, type TeamWithPlayers } from './PlayerSheet'
import { listenOnce, speechLang, type Listening, type SpeechError } from '../lib/speech'
import { understandVoice, type VoiceCommand, type VoicePlayer } from '../lib/voiceApi'

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

  useEffect(() => {
    let live = true
    const l = listenOnce(speechLang(lang), (text) => { if (live) setStage({ kind: 'listening', text }) })
    listening.current = l
    l.done.then(async ({ text, alternatives }) => {
      if (!live) return
      if (!text) { setStage({ kind: 'error', error: 'no-speech' }); return }
      setStage({ kind: 'thinking', text })
      const res = await understandVoice({ leagueId, text, alternatives, lang, players: rosterRef.current })
      if (!live) return
      setStage(res.ok ? { kind: 'result', text, command: res.command } : { kind: 'error', error: res.error })
    }, (error: SpeechError) => { if (live) setStage({ kind: 'error', error }) })
    return () => { live = false; l.cancel() }
  }, [attempt, lang, leagueId])

  const retry = () => setAttempt((n) => n + 1)
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
      cards={cards}
      swaps={swaps}
      clockRunning={clockRunning}
      undoLabel={undoLabel}
      nameOf={nameOf}
      retryButton={retryButton}
      onConfirm={onConfirm}
      onEdit={onEdit}
      onClose={onClose}
    />
  )
}

function VoiceResult({ text, command, playingTeams, cards, swaps, clockRunning, undoLabel, nameOf, retryButton, onConfirm, onEdit, onClose }: {
  text: string
  command: VoiceCommand
  playingTeams: TeamWithPlayers[]
  cards: boolean
  swaps: boolean
  clockRunning: boolean
  undoLabel: string | null
  nameOf: (id: string | null) => string
  retryButton: ReactNode
  onConfirm: (c: ConfirmedVoice) => void
  onEdit: (action: 'goal' | 'card' | 'interception' | 'swap') => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { action } = command
  const [playerId, setPlayerId] = useState(command.playerId)
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
  const otherId = command.otherId
  const complete = (!needsPlayer || !!playerId) && (!swap || !!otherId) && (action !== 'red_card' || !!minutes)
  const editTarget = action === 'goal' || action === 'own_goal' ? 'goal'
    : action === 'yellow_card' || action === 'red_card' ? 'card'
    : action === 'interception' || action === 'swap' ? action : null

  // Who it could be: Claude's candidates, or everyone on the pitch
  const pickFrom = command.candidates.length > 0
    ? playingTeams.map((tm) => ({ ...tm, players: tm.players.filter((p) => command.candidates.includes(p.id)) }))
    : playingTeams

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
          {!swap && <button type="button" onClick={() => setPlayerId(null)} className="text-sm text-blue-300 underline">{t('voice.changePlayer')}</button>}
        </div>
      )}
      {needsPlayer && !playerId && !swap && (
        <>
          <p className="text-sm text-gray-300 mb-2">{t('voice.whichPlayer')}</p>
          <TeamPlayerGrid teams={pickFrom} onPick={setPlayerId} />
        </>
      )}
      {swap && (!playerId || !otherId) && <p className="text-orange-300">{t('voice.swapBoth')}</p>}
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
