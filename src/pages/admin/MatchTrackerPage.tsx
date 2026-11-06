import { useState, useRef } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAdminPath, useFeature, useLeague } from '../../contexts/LeagueContext'
import { useMatchData } from '../../hooks/useMatchData'
import { useMatchTimer } from '../../hooks/useMatchTimer'
import { useEndAlert } from '../../hooks/useEndAlert'
import { useWakeLock } from '../../hooks/useWakeLock'
import { primeAlertAudio } from '../../utils/matchAlert'
import { resolveMatch, decideResult, drawGoesToPenalties, waitingQueue } from '../../utils/matchRotation'
import { NextUp } from '../../components/NextUp'
import { BetweenPeriods } from '../../components/BetweenPeriods'
import { findLastUndoable, undoAllowed } from '../../utils/matchEdit'
import { describeOutcome, type MatchOutcome } from '../../utils/matchOutcome'
import { totalSeconds, DEFAULT_FORMAT, periodAfter, periodLabelKey } from '../../utils/matchFormat'
import { matchScreen } from '../../utils/matchScreen'
import { canRecordEvents, finishedMatchFields } from '../../utils/matchClock'
import { GoalDialog } from '../../components/GoalDialog'
import { CardDialog } from '../../components/CardDialog'
import { InterceptionDialog } from '../../components/InterceptionDialog'
import { SwapDialog } from '../../components/SwapDialog'
import { SuspensionCountdown } from '../../components/SuspensionCountdown'
import { MatchResultDialog } from '../../components/MatchResultDialog'
import { MatchTimeline } from '../../components/MatchTimeline'
import { SessionMatchList } from '../../components/SessionMatchList'
import { SessionStandings } from '../../components/SessionStandings'
import { SessionTopPlayers } from '../../components/SessionTopPlayers'
import { SyncStatus } from '../../components/SyncStatus'
import { MatchClock } from '../../components/MatchClock'
import { MatchScoreboard } from '../../components/MatchScoreboard'
import { MatchConfirmDialog } from '../../components/MatchConfirmDialog'
import { PenaltyShootout } from '../../components/PenaltyShootout'
import { outbox, newId } from '../../lib/pitchOutbox'
import { serverNowIso } from '../../lib/serverClock'
import { goalOps, cardOps, interceptionOps, swapOps, undoOps } from '../../utils/pitchOps'
import type { Match, Team } from '../../lib/types'
import PageSkeleton from '../../components/PageSkeleton'
import LoadFailed from '../../components/LoadFailed'

export default function MatchTrackerPage() {
  const { sessionId, matchId } = useParams<{ sessionId: string; matchId: string }>()
  const navigate = useNavigate()
  const adminPath = useAdminPath()
  const league = useLeague()
  const cards = useFeature('cards')
  const swaps = useFeature('swaps')
  const { t } = useTranslation()

  const {
    match, setMatch, session, teams, teamPlayers, players, events, sessionMatches, sessionEvents,
    load, apply, endBlocked, setEndBlocked, staleRef, missing, loadFailed,
  } = useMatchData(sessionId, matchId, league.id)
  const [dialog, setDialog] = useState<'goal' | 'card' | 'interception' | 'swap' | null>(null)
  const [confirmEarlyEnd, setConfirmEarlyEnd] = useState(false)
  const [confirmUndo, setConfirmUndo] = useState(false)
  const [result, setResult] = useState<{
    outcome: MatchOutcome
    nextMatchId: string
    next: { team1Id: string; team2Id: string; queue: string[] }
  } | null>(null)
  // Clock reading captured when Goal/Card is tapped, not after the scorer is picked
  const [eventClock, setEventClock] = useState(0)
  const [view, setView] = useState<'match' | 'session'>('match')
  // Only one decision about the final score can be in progress at a time.
  const finishingRef = useRef(false)
  const [finishing, setFinishing] = useState(false)
  // The last try to save the result failed (no signal, or the server refused it)
  const [finishFailed, setFinishFailed] = useState(false)

  const timer = useMatchTimer(match, apply)

  const format = session ?? DEFAULT_FORMAT
  const screen = match ? matchScreen(format, match, timer) : null
  useEndAlert(match?.id, screen?.reachedEnd ?? false)
  useWakeLock(timer.timerStatus === 'running')

  const handleStart = () => {
    primeAlertAudio()
    timer.start()
  }

  if (missing) return <Navigate to={adminPath('/history')} replace />
  if (!match && loadFailed) return <LoadFailed onRetry={load} />
  if (!match || !screen) return <PageSkeleton />

  const team1 = teams.find((tm) => tm.id === match.team1_id)
  const team2 = teams.find((tm) => tm.id === match.team2_id)

  if (!team1 || !team2) return <PageSkeleton />

  const { step, reachedEnd, matchOver, showPenalties, between, endsMatch, endsPeriodOnly, periodSeconds } = screen

  const playingTeams = [team1, team2].map((team) => ({
    team,
    players: teamPlayers
      .filter((tp) => tp.team_id === team.id)
      .map((tp) => players.find((p) => p.id === tp.player_id)!)
      .filter(Boolean),
  }))

  const activeSuspensions = events.filter(
    (e) => e.event_type === 'red_card' && !e.suspension_ended_at
  )

  const inProgress = canRecordEvents(match.status, timer.timerStatus)

  const openEventDialog = (kind: 'goal' | 'card' | 'interception') => {
    if (!inProgress) return
    setEventClock(timer.elapsed)
    setDialog(kind)
  }
  const clockFields = { elapsed_seconds: eventClock, minute: Math.floor(eventClock / 60) }

  const handleGoalConfirm = async ({ scorerId, assisterId }: { scorerId: string; assisterId: string | null }) => {
    setDialog(null)
    const scorerTeamId = teamPlayers.find((tp) => tp.player_id === scorerId)?.team_id
    if (!scorerTeamId || !inProgress) return
    const assisterTeamId = assisterId ? teamPlayers.find((tp) => tp.player_id === assisterId)?.team_id : null
    await apply(goalOps({
      match, scorerId, scorerTeamId, assisterId, assisterTeamId, clock: clockFields, newId, now: serverNowIso(),
    }))
  }

  const handleCardConfirm = async ({ playerId, cardType, suspensionMinutes }: {
    playerId: string; cardType: 'yellow_card' | 'red_card'; suspensionMinutes: 2 | 3 | null
  }) => {
    setDialog(null)
    const teamId = teamPlayers.find((tp) => tp.player_id === playerId)?.team_id
    if (!inProgress || !teamId) return
    await apply(cardOps({ match, playerId, teamId, cardType, suspensionMinutes, clock: clockFields, newId, now: serverNowIso() }))
  }

  const handleInterceptionConfirm = async (playerId: string) => {
    setDialog(null)
    const teamId = teamPlayers.find((tp) => tp.player_id === playerId)?.team_id
    if (!inProgress || !teamId) return
    await apply(interceptionOps({ match, playerId, teamId, clock: clockFields, newId, now: serverNowIso() }))
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
      : t(lastEventIsGoal ? 'match.undoGoal'
        : lastEvent.event_type === 'interception' ? 'match.undoInterception'
        : lastEvent.event_type === 'red_card' ? 'match.undoRed' : 'match.undoYellow',
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
      match, p1: { id: p1Id, teamId: p1TeamId }, p2: { id: p2Id, teamId: p2TeamId }, clock, newId, now: serverNowIso(),
    }))
  }

  const level = match.team1_score === match.team2_score
  const periodName = (period: number) => t(periodLabelKey(period, format))

  const stepLabel = (() => {
    switch (step.kind) {
      case 'endPeriod': return endsMatch ? t('match.endMatch') : t('match.endPeriod', { period: periodName(step.period) })
      case 'startPeriod': return t('match.startPeriod', { period: periodName(step.period) })
      case 'penalties': return t('match.goToPenalties')
      case 'draw': return t('match.drawEnd')
      default: return t('match.endMatch')
    }
  })()

  const banner = showPenalties || between ? null
    : step.kind === 'endPeriod' && step.timeUp
      ? periodAfter(format, step.period, level) === null ? t('match.timeUp') : t('match.periodTimeUp', { period: periodName(step.period) })
      : step.kind === 'endMatch' && step.reason === 'goalLimit' ? t('match.goalLimitReached') : null

  const runStep = async () => {
    switch (step.kind) {
      case 'endPeriod': return endsMatch ? doEndMatch() : timer.endPeriod()
      case 'startPeriod':
        primeAlertAudio()
        return timer.startPeriod(step.period)
      case 'penalties': return goToPenalties()
      case 'draw': return endAsDraw()
      default: return doEndMatch()
    }
  }

  // Ending a period (or the match) before its time is up asks first
  const handleStep = async () => {
    if (step.kind === 'play' || (step.kind === 'endPeriod' && !step.timeUp)) {
      setConfirmEarlyEnd(true)
      return
    }
    await runStep()
  }

  const doEndMatch = async () => {
    const update = decideResult(match, format)

    // Level with no winner: a shoot-out when the session settles draws that way, else the draw stands
    if (update.is_draw && !update.winner_team_id && drawGoesToPenalties(format, match.match_number)) {
      await goToPenalties()
      return
    }

    // A winner after extra time (periods 3 and 4)
    await finishMatch(!update.is_draw && match.period >= 3 ? { ...update, draw_resolved_by: 'extra_time' } : update)
  }

  const goToPenalties = () => withSettledScore(async () => {
    // Straight from a period still on the clock (a level match 1 of a one-period session): keep its length
    const unrecorded = match.period <= 4 && match.period_seconds.length < match.period
    const changes = {
      period: 5, timer_status: 'stopped' as const, timer_started_at: null,
      ...(unrecorded ? { timer_elapsed_seconds: timer.elapsed, period_seconds: [...match.period_seconds, timer.elapsed] } : {}),
    }
    const outcome = await outbox.runOrQueue({
      id: newId(), kind: 'update', table: 'matches', match: { id: match.id }, values: changes,
    })
    // A settled tie can enter penalties offline. If the queued update is later refused,
    // the normal reload restores the server's period and the regulation controls.
    if (outcome !== 'failed') setMatch((m) => m && { ...m, ...changes })
  })

  // The draw stands (draw rule 'draw'): no winner, and resolveMatch sends the next teams on
  const endAsDraw = () => finishMatch({ is_draw: true, winner_team_id: null, draw_resolved_by: null })

  const handlePenaltyDecide = async (penaltyT1: number, penaltyT2: number) => {
    const winnerId = penaltyT1 > penaltyT2 ? match.team1_id : match.team2_id
    await finishMatch({
      is_draw: true, draw_resolved_by: 'penalties', winner_team_id: winnerId, penalties_team1: penaltyT1, penalties_team2: penaltyT2,
    }, { team1: penaltyT1, team2: penaltyT2 })
  }

  // Both a shoot-out and the final result depend on the score being settled.
  const withSettledScore = async (action: () => Promise<void>) => {
    if (finishingRef.current) return
    finishingRef.current = true
    setFinishing(true)
    try {
      if (!(await outbox.flush())) {
        // Pending edits need another attempt. A permanent refusal has its own warning;
        // the outbox reloads the corrected score before the referee tries again.
        setEndBlocked(outbox.pending().length > 0)
        return
      }
      // Give the referee the corrected score before asking for the decision again.
      if (staleRef.current) {
        await load()
        setFinishFailed(staleRef.current)
        return
      }
      setFinishFailed(false)
      await action()
    } finally {
      finishingRef.current = false
      setFinishing(false)
    }
  }

  // update carries the winner, or none for a draw that stands
  const finishMatch = (update: Partial<Match>, penalties?: { team1: number; team2: number }) =>
    withSettledScore(async () => {
      const finished = finishedMatchFields(match, timer.elapsed)
      const completedMatch = { ...match, ...update } as Match
      const next = resolveMatch(completedMatch)

      // The result and the next match are saved together or not at all (public.finish_match);
      // a second call returns the next match the first one set up
      const { data: nextMatchId, error } = await supabase.rpc('finish_match', {
        p_match_id: match.id,
        p_is_draw: completedMatch.is_draw,
        p_winner_team_id: completedMatch.winner_team_id ?? null,
        p_draw_resolved_by: completedMatch.draw_resolved_by ?? null,
        p_penalties_team1: completedMatch.penalties_team1 ?? null,
        p_penalties_team2: completedMatch.penalties_team2 ?? null,
        p_elapsed_seconds: finished.timer_elapsed_seconds,
        p_period_seconds: finished.period_seconds,
        p_next_team1: next.team1Id,
        p_next_team2: next.team2Id,
        p_next_queue: next.queue,
      })
      if (error || !nextMatchId) {
        setFinishFailed(true)
        return
      }

      setResult({
        outcome: describeOutcome({ ...completedMatch, format, totalSeconds: totalSeconds(finished, 0), penalties }),
        nextMatchId: nextMatchId as string,
        next,
      })
    })

  // Same component instance is reused for the next match, so per-match UI state must be reset
  // (the shoot-out's counts are keyed by the match and start again by themselves)
  // (a session is finished from History, so there is always a next match to go on to)
  const continueAfterResult = () => {
    if (!result) return
    setResult(null)
    setView('match')
    navigate(adminPath(`/sessions/${sessionId}/match/${result.nextMatchId}`))
  }

  const hasSessionSoFar = sessionMatches.some((m) => m.status === 'completed')
  const tile = 'min-h-[60px] rounded-xl font-bold text-base disabled:opacity-40 shadow-sm'

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
      {/* Live match mode: the match controls, and the session's table and scorers in a tab of their own */}
      {hasSessionSoFar && (
        <div role="tablist" aria-label={t('match.views')} className="grid grid-cols-2 gap-1 p-1 mb-5 rounded-xl bg-gray-800">
          {(['match', 'session'] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className={`min-h-[40px] rounded-lg text-sm font-semibold ${view === v ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-white'}`}>
              {v === 'match' ? t('match.tabMatch') : t('timeline.sessionProgress')}
            </button>
          ))}
        </div>
      )}

      <fieldset hidden={view !== 'match'} disabled={finishing} aria-label={t('match.tabMatch')} className="min-w-0">
      {/* Timer */}
      <div className="text-center mb-6">
        <div className="text-xs uppercase text-gray-400 mb-1">{periodName(match.period)}</div>
        {between ? (
          <BetweenPeriods
            finished={t('match.betweenPeriods', { period: periodName(match.period) })}
            team1Score={match.team1_score}
            team2Score={match.team2_score}
            actionLabel={stepLabel}
            onAction={handleStep}
          />
        ) : !showPenalties && (
          <MatchClock
            elapsed={timer.elapsed}
            periodSeconds={periodSeconds}
            showButtons={!matchOver}
            running={timer.timerStatus === 'running'}
            onStart={handleStart}
            onPause={timer.pause}
          />
        )}
      </div>

      <SyncStatus outbox={outbox} />

      {/* End-condition banner */}
      {banner && (
        <div className="mb-4 rounded-xl px-4 py-3 bg-red-600/20 border border-red-500 text-red-300 font-semibold text-sm text-center animate-pulse">
          {banner}
        </div>
      )}

      <MatchScoreboard team1={team1} team2={team2} score1={match.team1_score} score2={match.team2_score} />

      <NextUp queue={waitingQueue(match)} teams={teams} className="text-center text-sm text-gray-400 mb-6" />

      {/* Suspensions */}
      {cards && activeSuspensions.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs uppercase text-gray-400 mb-2">{t('match.suspended')}</h3>
          <div className="space-y-2">
            {activeSuspensions.map((e) => (
              <SuspensionCountdown key={e.id} event={e} name={nameOf(e.player_id)} onReturn={load} />
            ))}
          </div>
        </div>
      )}

      {/* Action buttons: big tiles in two columns, Goal (the most used) the widest and first */}
      {!showPenalties && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <button onClick={() => openEventDialog('goal')} disabled={!inProgress} className={`${tile} col-span-2 min-h-[72px] text-xl bg-green-600 hover:bg-green-500`}>{t('match.goal')}</button>
          {cards && <button onClick={() => openEventDialog('card')} disabled={!inProgress} className={`${tile} bg-yellow-600 hover:bg-yellow-500`}>{t('match.card')}</button>}
          <button onClick={() => openEventDialog('interception')} disabled={!inProgress} className={`${tile} bg-sky-700 hover:bg-sky-600`}>{t('match.interception')}</button>
          {swaps && <button onClick={() => setDialog('swap')} className={`${tile} bg-gray-700 hover:bg-gray-600 ${cards ? 'col-span-2' : ''}`}>{t('match.swap')}</button>}
        </div>
      )}

      {!showPenalties && !between && !inProgress && (
        <p className="text-xs text-gray-400 text-center -mt-2 mb-4">{t('match.startFirst')}</p>
      )}

      {!showPenalties && lastEvent && undoAllowed(lastEvent.event_type, { cards, swaps }) && (
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
        <MatchTimeline events={events} teams={teams} players={players} format={session ?? undefined} />
      </section>
      </fieldset>

      {confirmUndo && lastEvent && (
        <MatchConfirmDialog
          title={t('match.undoTitle')}
          body={lastEventLabel || ''}
          confirmLabel={t('match.undoConfirm')}
          onConfirm={handleUndo}
          onCancel={() => setConfirmUndo(false)}
        />
      )}

      {showPenalties && <PenaltyShootout key={match.id} team1={team1} team2={team2} busy={finishing} onDecide={handlePenaltyDecide} />}


      {hasSessionSoFar && view === 'session' && (
        <div>
          <div className="mb-5"><SessionStandings teams={teams} matches={sessionMatches} /></div>
          <div className="mb-5"><SessionTopPlayers players={players} events={sessionEvents} matches={sessionMatches} /></div>
          <SessionMatchList matches={sessionMatches} events={sessionEvents} teams={teams} players={players} format={session ?? undefined} />
        </div>
      )}


      {/* Between periods the break card holds the button; the shoot-out has its own. Pinned to the
          bottom of the screen, so it never moves down as goals fill the timeline. */}
      {view === 'match' && (endBlocked || finishFailed || (!between && !showPenalties && !matchOver)) && (
        <div className="action-bar">
          {!between && !showPenalties && !matchOver && (
            <button
              onClick={handleStep}
              disabled={finishing}
              className={`w-full min-h-[56px] rounded-xl font-bold text-lg disabled:opacity-50 ${
                reachedEnd
                  ? 'bg-red-500 hover:bg-red-400 animate-pulse shadow-lg shadow-red-700/50'
                  : 'bg-red-700 hover:bg-red-600'
              }`}
            >
              {stepLabel}
            </button>
          )}
          {endBlocked && <p role="alert" className="mt-2 text-sm text-orange-300 text-center">{t('offline.endBlocked')}</p>}
          {finishFailed && !endBlocked && <p role="alert" className="mt-2 text-sm text-orange-300 text-center">{t('match.finishFailed')}</p>}
        </div>
      )}

      {/* Early-end confirmation */}
      {confirmEarlyEnd && (
        <MatchConfirmDialog
          warning
          title={endsPeriodOnly && step.kind === 'endPeriod' ? t('match.earlyEndPeriodTitle', { period: periodName(step.period) }) : t('match.earlyEndTitle')}
          body={endsPeriodOnly ? t('match.earlyEndPeriodBody') : t('match.earlyEndBody')}
          confirmLabel={t('match.earlyEndConfirm')}
          onConfirm={() => { setConfirmEarlyEnd(false); runStep() }}
          onCancel={() => setConfirmEarlyEnd(false)}
        />
      )}

      {result && (
        <MatchResultDialog
          outcome={result.outcome}
          team1={{ team: team1, score: match.team1_score }}
          team2={{ team: team2, score: match.team2_score }}
          next={{
            team1: teams.find((tm) => tm.id === result.next.team1Id),
            team2: teams.find((tm) => tm.id === result.next.team2Id),
            queue: result.next.queue.map((id) => teams.find((tm) => tm.id === id)).filter((tm): tm is Team => !!tm),
          }}
          format={format}
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
      {dialog === 'interception' && (
        <InterceptionDialog teams={playingTeams} onConfirm={handleInterceptionConfirm} onClose={() => setDialog(null)} />
      )}
      {swaps && dialog === 'swap' && (
        <SwapDialog teams={teamsWithPlayers} onSwap={handleSwap} onClose={() => setDialog(null)} />
      )}
    </div>
  )
}
