import type { Match, TimerStatus } from '../lib/types'
import { nextStep, periodLength, type MatchFormat, type Step } from './matchFormat'

export type ScreenMatch = Pick<Match, 'period' | 'period_seconds' | 'team1_score' | 'team2_score' | 'timer_status' | 'status'>

// What the match screen offers now. The clock state on this phone wins over the match row,
// which catches up after the next load.
export function matchScreen(
  format: MatchFormat,
  match: ScreenMatch,
  clock: { elapsed: number; timerStatus?: TimerStatus },
  penaltyMode: boolean,
) {
  const timerStatus = clock.timerStatus ?? match.timer_status
  const step: Step = nextStep(format, { ...match, timer_status: timerStatus }, clock.elapsed)
  // Sounds at the end of each period as well as at the end of the match
  const reachedEnd = (step.kind === 'endPeriod' && step.timeUp) || step.kind === 'endMatch'
  const matchOver = match.status === 'completed'
  // Penalties are period 5, so a reload during the shoot-out comes back to it (not once the match is over)
  const showPenalties = (penaltyMode || match.period === 5) && !matchOver
  // The clock stopped on a period that is already recorded: the break before the next step
  const between = !showPenalties && step.kind !== 'play' && step.kind !== 'endPeriod'
    && timerStatus === 'stopped' && match.period_seconds.length >= match.period
  // Ending this period ends the match itself when the step after it would be End Match (a draw that
  // stands, extra time or penalties are reached through the break instead)
  const endsMatch = step.kind === 'endPeriod' && nextStep(format, {
    ...match, timer_status: 'stopped', period_seconds: [...match.period_seconds, clock.elapsed],
  }, clock.elapsed).kind === 'endMatch'
  // The pending step ends a period (a half or extra-time period), not the match
  const endsPeriodOnly = step.kind === 'endPeriod' && !endsMatch
  return { step, reachedEnd, matchOver, showPenalties, between, endsMatch, endsPeriodOnly, periodSeconds: periodLength(match.period, format) ?? 0 }
}
