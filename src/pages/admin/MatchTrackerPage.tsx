import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAdminPath, useFeature } from '../../contexts/LeagueContext'
import { useMatchTimer } from '../../hooks/useMatchTimer'
import { useEndAlert } from '../../hooks/useEndAlert'
import { useWakeLock } from '../../hooks/useWakeLock'
import { primeAlertAudio } from '../../utils/matchAlert'
import { resolveMatch, decideResult, matchRowFields } from '../../utils/matchRotation'
import { findLastUndoable, undoAllowed } from '../../utils/matchEdit'
import { describeOutcome, type MatchOutcome } from '../../utils/matchOutcome'
import { MATCH_DURATION_SECONDS, GOAL_LIMIT, canRecordEvents, formatMatchClock, finishedMatchFields } from '../../utils/matchClock'
import { GoalDialog } from '../../components/GoalDialog'
import { CardDialog } from '../../components/CardDialog'
import { SwapDialog } from '../../components/SwapDialog'
import { SuspensionCountdown } from '../../components/SuspensionCountdown'
import { MatchResultDialog } from '../../components/MatchResultDialog'
import { MatchTimeline } from '../../components/MatchTimeline'
import { SessionMatchList } from '../../components/SessionMatchList'
import { SessionStandings } from '../../components/SessionStandings'
import { SessionTopPlayers } from '../../components/SessionTopPlayers'
import { SyncStatus } from '../../components/SyncStatus'
import { outbox, newId } from '../../lib/pitchOutbox'
import { overlayPending } from '../../lib/outboxOverlay'
import type { OutboxOp } from '../../lib/outbox'
import { goalOps, cardOps, swapOps, undoOps } from '../../utils/pitchOps'
import type { Match, Team, Player, MatchEvent, TeamPlayer } from '../../lib/types'
import { styleMap } from '../../lib/teamColors'

const colorBg = styleMap('card')

export default function MatchTrackerPage() {
  const { sessionId, matchId } = useParams<{ sessionId: string; matchId: string }>()
  const navigate = useNavigate()
  const adminPath = useAdminPath()
  const cards = useFeature('cards')
  const swaps = useFeature('swaps')
  const awards = useFeature('awards')
  const { t } = useTranslation()

  const [match, setMatch] = useState<Match | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [teamPlayers, setTeamPlayers] = useState<TeamPlayer[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [events, setEvents] = useState<MatchEvent[]>([])
  const [sessionMatches, setSessionMatches] = useState<Match[]>([])
  const [sessionEvents, setSessionEvents] = useState<MatchEvent[]>([])
  const [dialog, setDialog] = useState<'goal' | 'card' | 'swap' | null>(null)
  const [confirmEarlyEnd, setConfirmEarlyEnd] = useState(false)
  const [confirmUndo, setConfirmUndo] = useState(false)
  const [result, setResult] = useState<{
    outcome: MatchOutcome
    nextMatchId: string | null
    next: { team1Id: string; team2Id: string; waitingTeamId: string }
  } | null>(null)
  // Clock reading captured when Goal/Card is tapped, not after the scorer is picked
  const [eventClock, setEventClock] = useState(0)
  const [penaltyMode, setPenaltyMode] = useState(false)
  const [penaltyT1, setPenaltyT1] = useState(0)
  const [penaltyT2, setPenaltyT2] = useState(0)
  const [endBlocked, setEndBlocked] = useState(false)

  const timer = useMatchTimer(match ?? ({} as Match))

  const loadSessionMatches = async () => {
    const { data: mData } = await supabase.from('matches').select('*').eq('session_id', sessionId)
    const rows = (mData ?? []) as Match[]
    setSessionMatches(rows)
    const finishedIds = rows.filter((m) => m.status === 'completed').map((m) => m.id)
    if (finishedIds.length === 0) { setSessionEvents([]); return }
    const { data: evData } = await supabase.from('match_events').select('*').in('match_id', finishedIds)
    setSessionEvents((evData ?? []) as MatchEvent[])
  }

  const load = async () => {
    loadSessionMatches()
    const [{ data: m }, { data: teamsData }] = await Promise.all([
      supabase.from('matches').select('*').eq('id', matchId).single(),
      supabase.from('teams').select('*').eq('session_id', sessionId),
    ])
    // Offline: keep what is on screen rather than wiping it
    if (!m || !teamsData) return
    setTeams(teamsData as Team[])

    const teamIds = (teamsData as Team[]).map((t) => t.id)
    const [{ data: tpData }, { data: evData }] = await Promise.all([
      supabase.from('team_players').select('*').in('team_id', teamIds),
      supabase.from('match_events').select('*').eq('match_id', m.id),
    ])
    // Changes still waiting on this phone are shown on top of what the server has
    const shown = overlayPending(outbox.pending(), {
      match: m as Match,
      events: (evData ?? []) as MatchEvent[],
      teamPlayers: (tpData ?? []) as TeamPlayer[],
    })
    setMatch(shown.match)
    setEvents(shown.events)
    setTeamPlayers(shown.teamPlayers)

    const pIds = [...new Set(shown.teamPlayers.map((tp) => tp.player_id))]
    if (pIds.length > 0) {
      const { data: pData } = await supabase.from('players').select('*').in('id', pIds)
      if (pData) setPlayers(pData as Player[])
    }
  }

  useEffect(() => { load() }, [matchId])

  // Once every waiting change has been sent, reload so the screen shows the server's copy
  useEffect(() => outbox.subscribe(() => {
    if (outbox.pending().length === 0 && !outbox.isFlushing()) {
      setEndBlocked(false)
      load()
    }
  }), [matchId])

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

  // Show the change immediately, then send it (or keep it on the phone until there is signal)
  const apply = async (ops: OutboxOp[]) => {
    const shown = overlayPending(ops, { match, events, teamPlayers })
    setMatch(shown.match)
    setEvents(shown.events)
    setTeamPlayers(shown.teamPlayers)
    let allSent = true
    for (const op of ops) {
      const outcome = await outbox.runOrQueue(op)
      if (outcome === 'failed') { load(); return }
      if (outcome === 'queued') allSent = false
    }
    if (allSent) load()
  }

  const handleGoalConfirm = async ({ scorerId, assisterId }: { scorerId: string; assisterId: string | null }) => {
    setDialog(null)
    const scorerTeamId = teamPlayers.find((tp) => tp.player_id === scorerId)?.team_id
    if (!scorerTeamId || !inProgress) return
    const assisterTeamId = assisterId ? teamPlayers.find((tp) => tp.player_id === assisterId)?.team_id : null
    await apply(goalOps({
      match, scorerId, scorerTeamId, assisterId, assisterTeamId, clock: clockFields, newId, now: new Date().toISOString(),
    }))
  }

  const handleCardConfirm = async ({ playerId, cardType, suspensionMinutes }: {
    playerId: string; cardType: 'yellow_card' | 'red_card'; suspensionMinutes: 2 | 3 | null
  }) => {
    setDialog(null)
    const teamId = teamPlayers.find((tp) => tp.player_id === playerId)?.team_id
    if (!inProgress || !teamId) return
    await apply(cardOps({ match, playerId, teamId, cardType, suspensionMinutes, clock: clockFields, newId, now: new Date().toISOString() }))
  }

  const lastEvent = findLastUndoable(events)
  const lastEventIsGoal = lastEvent?.event_type === 'goal' || lastEvent?.event_type === 'penalty_goal'
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? '?'
  const swapPartner = lastEvent?.event_type === 'swap'
    ? events.find((e) => e.event_type === 'swap' && e.related_event_id === lastEvent.id)
    : undefined
  const lastEventLabel = lastEvent && (
    lastEvent.event_type === 'swap'
      ? t('match.undoSwap', { a: nameOf(lastEvent.player_id), b: swapPartner ? nameOf(swapPartner.player_id) : '?' })
      : t(lastEventIsGoal ? 'match.undoGoal' : lastEvent.event_type === 'red_card' ? 'match.undoRed' : 'match.undoYellow',
        { name: nameOf(lastEvent.player_id) })
  )

  const handleUndo = async () => {
    setConfirmUndo(false)
    if (!lastEvent) return
    await apply(undoOps({ match, event: lastEvent, events, newId }))
  }

  const handleSwap = async (p1Id: string, p2Id: string) => {
    setDialog(null)
    const p1TeamId = teamPlayers.find((tp) => tp.player_id === p1Id)?.team_id
    const p2TeamId = teamPlayers.find((tp) => tp.player_id === p2Id)?.team_id
    if (!p1TeamId || !p2TeamId) return
    const clock = timer.timerStatus === 'stopped'
      ? { elapsed_seconds: null, minute: null }
      : { elapsed_seconds: timer.elapsed, minute: Math.floor(timer.elapsed / 60) }
    await apply(swapOps({
      match, p1: { id: p1Id, teamId: p1TeamId }, p2: { id: p2Id, teamId: p2TeamId }, clock, newId, now: new Date().toISOString(),
    }))
  }

  const handleEndMatch = async () => {
    if (!shouldEndMatch) {
      setConfirmEarlyEnd(true)
      return
    }
    await doEndMatch()
  }

  const doEndMatch = async () => {
    const update = decideResult(match)

    if (update.is_draw && match.match_number === 1 && !update.winner_team_id) {
      setPenaltyMode(true)
      return
    }

    await finishMatch(update)
  }

  const handlePenaltyDecide = async () => {
    const winnerId = penaltyT1 > penaltyT2 ? match.team1_id : match.team2_id
    await finishMatch({ is_draw: true, draw_resolved_by: 'penalties', winner_team_id: winnerId }, { team1: penaltyT1, team2: penaltyT2 })
  }

  const finishMatch = async (update: Partial<Match>, penalties?: { team1: number; team2: number }) => {
    if (!update.winner_team_id) return
    // Ending creates the next match on the server, so everything recorded must be sent first
    if (outbox.pending().length > 0 && !(await outbox.flush())) {
      setEndBlocked(true)
      return
    }

    const { error } = await supabase.from('matches').update({ ...update, ...finishedMatchFields(timer.elapsed) }).eq('id', match.id)
    // Don't start the next match if this result was not saved
    if (error) return

    const completedMatch = { ...match, ...update } as Match
    const next = resolveMatch(completedMatch)

    // Create next match
    const { data: nextMatch } = await supabase.from('matches').insert({
      session_id: match.session_id,
      match_number: match.match_number + 1,
      ...matchRowFields(next),
      status: 'pending',
    }).select().single()

    setResult({
      outcome: describeOutcome({ ...completedMatch, winner_team_id: update.winner_team_id, elapsedSeconds: timer.elapsed, penalties }),
      nextMatchId: nextMatch ? (nextMatch as Match).id : null,
      next: { team1Id: next.team1Id, team2Id: next.team2Id, waitingTeamId: next.queue[0] ?? '' },
    })
  }

  // Same component instance is reused for the next match, so per-match UI state must be reset
  const continueAfterResult = () => {
    const nextId = result?.nextMatchId
    setResult(null)
    setPenaltyMode(false)
    setPenaltyT1(0)
    setPenaltyT2(0)
    if (nextId) { navigate(adminPath(`/sessions/${sessionId}/match/${nextId}`)); return }
    if (awards) { navigate(adminPath(`/sessions/${sessionId}/awards`)); return }
    // No awards step: close the session here, as AwardsPage would
    supabase.from('sessions').update({ status: 'completed' }).eq('id', sessionId).then(({ error }) => {
      // On failure stay put; History offers Finish session to retry
      if (!error) navigate(adminPath(`/sessions/${sessionId}`))
    })
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

      <SyncStatus outbox={outbox} />

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
      {cards && activeSuspensions.length > 0 && (
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
          {cards && <button onClick={() => openEventDialog('card')} disabled={!inProgress} className="flex-1 py-3 bg-yellow-700 rounded font-semibold disabled:opacity-40">{t('match.card')}</button>}
          {swaps && <button onClick={() => setDialog('swap')} className="flex-1 py-3 bg-gray-700 rounded font-semibold">{t('match.swap')}</button>}
        </div>
      )}

      {!penaltyMode && !inProgress && (
        <p className="text-xs text-gray-400 text-center -mt-2 mb-4">{t('match.startFirst')}</p>
      )}

      {!penaltyMode && lastEvent && undoAllowed(lastEvent.event_type, { cards, swaps }) && (
        <button
          onClick={() => setConfirmUndo(true)}
          className="w-full mb-4 py-2 rounded border border-gray-600 text-sm text-gray-300 hover:bg-gray-800 flex items-center justify-center gap-2"
        >
          <span className="font-semibold">{t('match.undo')}</span>
          <span className="text-gray-400 truncate">{lastEventLabel}</span>
        </button>
      )}

      <section className="mb-4 bg-gray-800 rounded-xl p-3">
        <h3 className="text-xs uppercase text-gray-400 mb-2">{t('timeline.title')}</h3>
        <MatchTimeline events={events} teams={teams} players={players} />
      </section>

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
      {endBlocked && <p role="alert" className="mt-2 text-sm text-orange-300 text-center">{t('offline.endBlocked')}</p>}

      {sessionMatches.some((m) => m.status === 'completed') && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold mb-3">{t('timeline.sessionProgress')}</h2>
          <div className="mb-5"><SessionStandings teams={teams} matches={sessionMatches} /></div>
          <div className="mb-5"><SessionTopPlayers players={players} events={sessionEvents} matches={sessionMatches} /></div>
          <SessionMatchList matches={sessionMatches} events={sessionEvents} teams={teams} players={players} />
        </div>
      )}

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

      {result && (
        <MatchResultDialog
          outcome={result.outcome}
          team1={{ team: team1, score: match.team1_score }}
          team2={{ team: team2, score: match.team2_score }}
          next={{
            team1: teams.find((tm) => tm.id === result.next.team1Id),
            team2: teams.find((tm) => tm.id === result.next.team2Id),
            waiting: teams.find((tm) => tm.id === result.next.waitingTeamId),
          }}
          onContinue={continueAfterResult}
        />
      )}

      {/* Dialogs */}
      {dialog === 'goal' && (
        <GoalDialog teams={playingTeams} onConfirm={handleGoalConfirm} onClose={() => setDialog(null)} />
      )}
      {cards && dialog === 'card' && (
        <CardDialog teams={playingTeams} onConfirm={handleCardConfirm} onClose={() => setDialog(null)} />
      )}
      {swaps && dialog === 'swap' && (
        <SwapDialog teams={teamsWithPlayers} onSwap={handleSwap} onClose={() => setDialog(null)} />
      )}
    </div>
  )
}
