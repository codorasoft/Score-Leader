import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useMatchTimer } from '../../hooks/useMatchTimer'
import { useEndAlert } from '../../hooks/useEndAlert'
import { useWakeLock } from '../../hooks/useWakeLock'
import { primeAlertAudio } from '../../utils/matchAlert'
import { resolveMatch } from '../../utils/matchRotation'
import { findLastUndoable } from '../../utils/matchEdit'
import { MATCH_DURATION_SECONDS, GOAL_LIMIT, canRecordEvents, formatMatchClock, eventClockSeconds } from '../../utils/matchClock'
import { GoalDialog } from '../../components/GoalDialog'
import { CardDialog } from '../../components/CardDialog'
import { SwapDialog } from '../../components/SwapDialog'
import { SuspensionCountdown } from '../../components/SuspensionCountdown'
import type { Match, Team, Player, MatchEvent, TeamPlayer } from '../../lib/types'

// Helper to derive match update when scores are equal (draw detection)
export function buildMatchUpdate(params: {
  team1_score: number
  team2_score: number
  match_number: number
  waiting_team_id: string
  team1_id: string
  team2_id: string
}): Partial<Match> {
  const { team1_score, team2_score, match_number, waiting_team_id } = params
  if (team1_score !== team2_score) {
    return {
      is_draw: false,
      winner_team_id: team1_score > team2_score ? params.team1_id : params.team2_id,
    }
  }
  if (match_number === 1) {
    return { is_draw: true, winner_team_id: null, draw_resolved_by: null }
  }
  // team1_id is always the previous match's winner — they keep their spot on a draw
  return {
    is_draw: true,
    draw_resolved_by: 'late_team',
    winner_team_id: params.team1_id,
  }
}


const colorDot: Record<string, string> = { red: 'bg-red-500', blue: 'bg-blue-500', yellow: 'bg-yellow-400' }
const EVENT_ICON: Partial<Record<MatchEvent['event_type'], string>> = {
  goal: '⚽', penalty_goal: '⚽', yellow_card: '🟨', red_card: '🟥',
}

const colorBg: Record<string, string> = {
  red: 'bg-red-900/40 border-red-600',
  blue: 'bg-blue-900/40 border-blue-600',
  yellow: 'bg-yellow-900/40 border-yellow-600',
}

export default function MatchTrackerPage() {
  const { sessionId, matchId } = useParams<{ sessionId: string; matchId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [match, setMatch] = useState<Match | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [teamPlayers, setTeamPlayers] = useState<TeamPlayer[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [events, setEvents] = useState<MatchEvent[]>([])
  const [dialog, setDialog] = useState<'goal' | 'card' | 'swap' | null>(null)
  const [confirmEarlyEnd, setConfirmEarlyEnd] = useState(false)
  const [confirmUndo, setConfirmUndo] = useState(false)
  // Clock reading captured when Goal/Card is tapped, not after the scorer is picked
  const [eventClock, setEventClock] = useState(0)
  const [penaltyMode, setPenaltyMode] = useState(false)
  const [penaltyT1, setPenaltyT1] = useState(0)
  const [penaltyT2, setPenaltyT2] = useState(0)

  const timer = useMatchTimer(match ?? ({} as Match))

  const load = async () => {
    // Step 1: match + teams (teams needed to filter team_players correctly)
    const [{ data: m }, { data: teamsData }] = await Promise.all([
      supabase.from('matches').select('*').eq('id', matchId).single(),
      supabase.from('teams').select('*').eq('session_id', sessionId),
    ])
    if (m) setMatch(m as Match)
    if (teamsData) setTeams(teamsData as Team[])
    if (!m || !teamsData) return

    const teamIds = (teamsData as Team[]).map((t) => t.id)

    // Step 2: team_players (filtered to this session) + events
    const [{ data: tpData }, { data: evData }] = await Promise.all([
      supabase.from('team_players').select('*').in('team_id', teamIds),
      supabase.from('match_events').select('*').eq('match_id', m.id),
    ])
    if (tpData) setTeamPlayers(tpData as TeamPlayer[])
    if (evData) setEvents(evData as MatchEvent[])

    // Step 3: player details
    if (tpData) {
      const pIds = [...new Set((tpData as TeamPlayer[]).map((tp) => tp.player_id))]
      if (pIds.length > 0) {
        const { data: pData } = await supabase.from('players').select('*').in('id', pIds)
        if (pData) setPlayers(pData as Player[])
      }
    }
  }

  useEffect(() => { load() }, [matchId])

  const reachedEnd = !!match && (
    match.team1_score >= GOAL_LIMIT || match.team2_score >= GOAL_LIMIT || timer.elapsed >= MATCH_DURATION_SECONDS
  )
  useEndAlert(match?.id, reachedEnd)
  useWakeLock(timer.timerStatus === 'running')

  const handleStart = () => {
    primeAlertAudio()
    timer.start()
  }

  if (!match) return <div className="p-4 text-gray-400">{t('common.loading')}</div>

  const team1 = teams.find((tm) => tm.id === match.team1_id)
  const team2 = teams.find((tm) => tm.id === match.team2_id)
  const waitingTeam = teams.find((tm) => tm.id === match.waiting_team_id)

  if (!team1 || !team2) return <div className="p-4 text-gray-400">{t('common.loading')}</div>

  const playingTeams = [team1, team2].map((team) => ({
    team,
    players: teamPlayers
      .filter((tp) => tp.team_id === team.id)
      .map((tp) => players.find((p) => p.id === tp.player_id)!)
      .filter(Boolean),
  }))

  const playingPlayers = playingTeams.flatMap((t) => t.players)

  const activeSuspensions = events.filter(
    (e) => e.event_type === 'red_card' && !e.suspension_ended_at
  )


  const isTimeUp = timer.elapsed >= MATCH_DURATION_SECONDS
  const shouldEndMatch = reachedEnd
  const inProgress = canRecordEvents(match.status, timer.timerStatus)

  const openEventDialog = (kind: 'goal' | 'card') => {
    if (!inProgress) return
    setEventClock(timer.elapsed)
    setDialog(kind)
  }
  const clockFields = { elapsed_seconds: eventClock, minute: Math.floor(eventClock / 60) }

  const handleGoalConfirm = async ({ scorerId, assisterId }: { scorerId: string; assisterId: string | null }) => {
    setDialog(null)
    const scorerTeamId = teamPlayers.find((tp) => tp.player_id === scorerId)?.team_id
    if (!scorerTeamId || !inProgress) return

    // Insert goal event
    const { data: goalEvent } = await supabase
      .from('match_events')
      .insert({ match_id: match.id, player_id: scorerId, team_id: scorerTeamId, event_type: 'goal', ...clockFields })
      .select().single()
    // Never bump the score for a goal that failed to save
    if (!goalEvent) return

    if (assisterId) {
      const assisterTeamId = teamPlayers.find((tp) => tp.player_id === assisterId)?.team_id
      await supabase.from('match_events').insert({
        match_id: match.id, player_id: assisterId, team_id: assisterTeamId,
        event_type: 'assist', related_event_id: (goalEvent as MatchEvent).id, ...clockFields,
      })
    }

    // Update score
    const isTeam1 = scorerTeamId === match.team1_id
    await supabase.from('matches').update(
      isTeam1 ? { team1_score: match.team1_score + 1 } : { team2_score: match.team2_score + 1 }
    ).eq('id', match.id)

    load()
  }

  const handleCardConfirm = async ({ playerId, cardType, suspensionMinutes }: {
    playerId: string; cardType: 'yellow_card' | 'red_card'; suspensionMinutes: 2 | 3 | null
  }) => {
    setDialog(null)
    if (!inProgress) return
    const playerTeamId = teamPlayers.find((tp) => tp.player_id === playerId)?.team_id
    await supabase.from('match_events').insert({
      match_id: match.id, player_id: playerId, team_id: playerTeamId, event_type: cardType,
      suspension_minutes: suspensionMinutes, suspension_started_at: suspensionMinutes ? new Date().toISOString() : null,
      ...clockFields,
    })
    load()
  }

  const playerName = (id: string) => players.find((p) => p.id === id)?.name ?? '?'
  const loggedEvents = events
    .filter((e) => e.event_type in EVENT_ICON)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))

  const lastEvent = findLastUndoable(events)
  const lastEventIsGoal = lastEvent?.event_type === 'goal' || lastEvent?.event_type === 'penalty_goal'
  const lastEventLabel = lastEvent && t(
    lastEventIsGoal ? 'match.undoGoal' : lastEvent.event_type === 'red_card' ? 'match.undoRed' : 'match.undoYellow',
    { name: players.find((p) => p.id === lastEvent.player_id)?.name ?? '?' },
  )

  const handleUndo = async () => {
    setConfirmUndo(false)
    if (!lastEvent) return
    if (lastEventIsGoal) {
      // assist references the goal without CASCADE, so it must be removed first
      const { error } = await supabase.from('match_events').delete().eq('related_event_id', lastEvent.id)
      if (error) return
    }
    const { error } = await supabase.from('match_events').delete().eq('id', lastEvent.id)
    if (error) return
    if (lastEventIsGoal) {
      await supabase.from('matches').update(
        lastEvent.team_id === match.team1_id
          ? { team1_score: Math.max(0, match.team1_score - 1) }
          : { team2_score: Math.max(0, match.team2_score - 1) },
      ).eq('id', match.id)
    }
    load()
  }

  const handleSwap = async (p1Id: string, p2Id: string) => {
    setDialog(null)
    const p1TeamId = teamPlayers.find((tp) => tp.player_id === p1Id)?.team_id
    const p2TeamId = teamPlayers.find((tp) => tp.player_id === p2Id)?.team_id
    if (!p1TeamId || !p2TeamId) return
    await Promise.all([
      supabase.from('team_players').update({ team_id: p2TeamId }).eq('player_id', p1Id).eq('team_id', p1TeamId),
      supabase.from('team_players').update({ team_id: p1TeamId }).eq('player_id', p2Id).eq('team_id', p2TeamId),
    ])
    load()
  }

  const handleEndMatch = async () => {
    if (!shouldEndMatch) {
      setConfirmEarlyEnd(true)
      return
    }
    await doEndMatch()
  }

  const doEndMatch = async () => {
    const update = buildMatchUpdate({
      team1_score: match.team1_score,
      team2_score: match.team2_score,
      match_number: match.match_number,
      waiting_team_id: match.waiting_team_id,
      team1_id: match.team1_id,
      team2_id: match.team2_id,
    })

    if (update.is_draw && match.match_number === 1 && !update.winner_team_id) {
      setPenaltyMode(true)
      return
    }

    await finishMatch(update)
  }

  const handlePenaltyDecide = async () => {
    const winnerId = penaltyT1 > penaltyT2 ? match.team1_id : match.team2_id
    await finishMatch({ is_draw: true, draw_resolved_by: 'penalties', winner_team_id: winnerId })
  }

  const finishMatch = async (update: Partial<Match>) => {
    if (!update.winner_team_id) return

    await supabase.from('matches').update({ ...update, status: 'completed' }).eq('id', match.id)

    const completedMatch = { ...match, ...update } as Match
    const { nextTeam1Id, nextTeam2Id, nextWaitingTeamId } = resolveMatch(completedMatch)

    // Create next match
    const { data: nextMatch } = await supabase.from('matches').insert({
      session_id: match.session_id,
      match_number: match.match_number + 1,
      team1_id: nextTeam1Id,
      team2_id: nextTeam2Id,
      waiting_team_id: nextWaitingTeamId,
      status: 'pending',
    }).select().single()

    if (nextMatch) {
      navigate(`/admin/sessions/${sessionId}/match/${(nextMatch as Match).id}`)
    } else {
      navigate(`/admin/sessions/${sessionId}/awards`)
    }
  }

  const teamsWithPlayers = teams
    .filter((t) => t.session_id === sessionId)
    .map((team) => ({
      team,
      players: teamPlayers
        .filter((tp) => tp.team_id === team.id)
        .map((tp) => players.find((p) => p.id === tp.player_id)!)
        .filter(Boolean),
    }))

  return (
    <div>
      {/* Timer */}
      <div className="text-center mb-6">
        <div className="text-5xl font-mono font-bold">
          {formatMatchClock(Math.min(timer.elapsed, MATCH_DURATION_SECONDS))}
          {timer.elapsed > MATCH_DURATION_SECONDS && (
            <span className="block text-2xl text-red-400 mt-1">+{formatMatchClock(timer.elapsed - MATCH_DURATION_SECONDS)}</span>
          )}
        </div>
        <div className="mt-2 flex justify-center gap-3">
          {timer.timerStatus !== 'running' ? (
            <button onClick={handleStart} className="px-4 py-2 bg-green-600 rounded font-semibold">{t('match.start')}</button>
          ) : (
            <button onClick={timer.pause} className="px-4 py-2 bg-yellow-600 rounded font-semibold">{t('match.pause')}</button>
          )}
        </div>
      </div>

      {/* End-condition banner */}
      {shouldEndMatch && !penaltyMode && (
        <div className="mb-4 rounded-xl px-4 py-3 bg-red-600/20 border border-red-500 text-red-300 font-semibold text-sm text-center animate-pulse">
          {isTimeUp ? t('match.timeUp') : t('match.goalLimitReached')}
        </div>
      )}

      {/* Score */}
      <div className="flex items-center justify-center gap-6 mb-6">
        <div className={`flex-1 text-center p-4 rounded-xl border ${colorBg[team1.color]}`}>
          <div className="text-xs uppercase text-gray-400 mb-1">{t('common.teamName', { color: t(`common.teamColor.${team1.color}`) })}</div>
          <div className="text-4xl font-bold">{match.team1_score}</div>
        </div>
        <div className="text-gray-500 font-bold">{t('common.vs')}</div>
        <div className={`flex-1 text-center p-4 rounded-xl border ${colorBg[team2.color]}`}>
          <div className="text-xs uppercase text-gray-400 mb-1">{t('common.teamName', { color: t(`common.teamColor.${team2.color}`) })}</div>
          <div className="text-4xl font-bold">{match.team2_score}</div>
        </div>
      </div>

      {waitingTeam && (
        <div className="text-center text-sm text-gray-400 mb-6">
          {t('common.waiting')}: <span className="font-semibold text-gray-300">{t('common.teamName', { color: t(`common.teamColor.${waitingTeam.color}`) })}</span>
        </div>
      )}

      {/* Suspensions */}
      {activeSuspensions.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs uppercase text-gray-400 mb-2">{t('match.suspended')}</h3>
          <div className="space-y-2">
            {activeSuspensions.map((e) => (
              <SuspensionCountdown key={e.id} event={e} onReturn={load} />
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!penaltyMode && (
        <div className="flex gap-3 mb-4">
          <button onClick={() => openEventDialog('goal')} disabled={!inProgress} className="flex-1 py-3 bg-green-700 rounded font-semibold disabled:opacity-40">{t('match.goal')}</button>
          <button onClick={() => openEventDialog('card')} disabled={!inProgress} className="flex-1 py-3 bg-yellow-700 rounded font-semibold disabled:opacity-40">{t('match.card')}</button>
          <button onClick={() => setDialog('swap')} className="flex-1 py-3 bg-gray-700 rounded font-semibold">{t('match.swap')}</button>
        </div>
      )}

      {!penaltyMode && !inProgress && (
        <p className="text-xs text-gray-400 text-center -mt-2 mb-4">{t('match.startFirst')}</p>
      )}

      {!penaltyMode && lastEvent && (
        <button
          onClick={() => setConfirmUndo(true)}
          className="w-full mb-4 py-2 rounded border border-gray-600 text-sm text-gray-300 hover:bg-gray-800 flex items-center justify-center gap-2"
        >
          <span className="font-semibold">{t('match.undo')}</span>
          <span className="text-gray-400 truncate">{lastEventLabel}</span>
        </button>
      )}

      {loggedEvents.length > 0 && (
        <div className="mb-4 bg-gray-800 rounded-xl p-3">
          <h3 className="text-xs uppercase text-gray-400 mb-2">{t('match.log')}</h3>
          {loggedEvents.map((e) => {
            const clock = eventClockSeconds(e)
            const assist = events.find((a) => a.event_type === 'assist' && a.related_event_id === e.id)
            const team = teams.find((tm) => tm.id === e.team_id)
            return (
              <div key={e.id} className="flex items-center gap-3 text-sm py-1">
                <span className="font-mono text-gray-400 w-24 shrink-0" dir="ltr">{clock != null ? formatMatchClock(clock) : '—'}</span>
                <span className={`w-2 h-2 rounded-full shrink-0 ${team ? colorDot[team.color] : 'bg-gray-500'}`} />
                <span className="truncate">
                  {EVENT_ICON[e.event_type]} {playerName(e.player_id)}
                  {assist && <span className="text-xs text-gray-400 ms-2">({playerName(assist.player_id)})</span>}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {confirmUndo && lastEvent && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setConfirmUndo(false)}>
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-xs text-center" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-2">{t('match.undoTitle')}</h2>
            <p className="text-sm text-gray-300 mb-5">{lastEventLabel}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmUndo(false)} className="flex-1 py-2 bg-gray-700 rounded font-semibold hover:bg-gray-600">
                {t('common.cancel')}
              </button>
              <button onClick={handleUndo} className="flex-1 py-2 bg-red-600 rounded font-semibold hover:bg-red-500">
                {t('match.undoConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Penalty mode */}
      {penaltyMode && (
        <div className="bg-gray-800 rounded-xl p-4 mb-4">
          <h3 className="font-bold mb-3">{t('match.penaltyTitle')}</h3>
          <div className="flex gap-4 items-center mb-4">
            <div className="flex-1">
              <div className="text-xs text-gray-400 mb-1">{t('common.teamName', { color: t(`common.teamColor.${team1.color}`) })}</div>
              <div className="flex items-center gap-2">
                <button onClick={() => setPenaltyT1((n) => Math.max(0, n - 1))} className="px-2 py-1 bg-gray-700 rounded">−</button>
                <span className="text-2xl font-bold w-8 text-center">{penaltyT1}</span>
                <button onClick={() => setPenaltyT1((n) => n + 1)} className="px-2 py-1 bg-gray-700 rounded">+</button>
              </div>
            </div>
            <div className="flex-1">
              <div className="text-xs text-gray-400 mb-1">{t('common.teamName', { color: t(`common.teamColor.${team2.color}`) })}</div>
              <div className="flex items-center gap-2">
                <button onClick={() => setPenaltyT2((n) => Math.max(0, n - 1))} className="px-2 py-1 bg-gray-700 rounded">−</button>
                <span className="text-2xl font-bold w-8 text-center">{penaltyT2}</span>
                <button onClick={() => setPenaltyT2((n) => n + 1)} className="px-2 py-1 bg-gray-700 rounded">+</button>
              </div>
            </div>
          </div>
          <button
            onClick={handlePenaltyDecide}
            disabled={penaltyT1 === penaltyT2}
            className="w-full py-2 bg-blue-600 rounded font-semibold disabled:opacity-50"
          >
            {t('match.penaltyConfirm')}
          </button>
        </div>
      )}

      <button
        onClick={handleEndMatch}
        className={`w-full py-3 rounded-xl font-bold transition-colors ${
          shouldEndMatch
            ? 'bg-red-500 hover:bg-red-400 animate-pulse shadow-lg shadow-red-700/50'
            : 'bg-red-700 hover:bg-red-600'
        }`}
      >
        {t('match.endMatch')}
      </button>

      {/* Early-end confirmation */}
      {confirmEarlyEnd && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setConfirmEarlyEnd(false)}>
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-xs text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-2xl mb-3">⚠️</div>
            <h2 className="text-lg font-bold mb-2">{t('match.earlyEndTitle')}</h2>
            <p className="text-sm text-gray-400 mb-5">{t('match.earlyEndBody')}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmEarlyEnd(false)}
                className="flex-1 py-2 bg-gray-700 rounded font-semibold hover:bg-gray-600"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => { setConfirmEarlyEnd(false); doEndMatch() }}
                className="flex-1 py-2 bg-red-600 rounded font-semibold hover:bg-red-500"
              >
                {t('match.earlyEndConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialogs */}
      {dialog === 'goal' && (
        <GoalDialog teams={playingTeams} onConfirm={handleGoalConfirm} onClose={() => setDialog(null)} />
      )}
      {dialog === 'card' && (
        <CardDialog teams={playingTeams} onConfirm={handleCardConfirm} onClose={() => setDialog(null)} />
      )}
      {dialog === 'swap' && (
        <SwapDialog teams={teamsWithPlayers} onSwap={handleSwap} onClose={() => setDialog(null)} />
      )}
    </div>
  )
}
