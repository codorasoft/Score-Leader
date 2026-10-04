import type { Match, MatchEvent, MatchStatus, TimerStatus } from '../lib/types'

export const MATCH_DURATION_SECONDS = 7 * 60
export const GOAL_LIMIT = 2

const mmss = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

export function formatMatchClock(seconds: number) {
  if (seconds <= MATCH_DURATION_SECONDS) return mmss(seconds)
  return `${mmss(MATCH_DURATION_SECONDS)} +${mmss(seconds - MATCH_DURATION_SECONDS)}`
}

export function eventClockSeconds(event: Pick<MatchEvent, 'elapsed_seconds' | 'minute'>) {
  if (event.elapsed_seconds != null) return event.elapsed_seconds
  return event.minute != null ? event.minute * 60 : null
}

// A paused clock is still mid-match (e.g. a stoppage), so events may be recorded then.
export function canRecordEvents(matchStatus: MatchStatus, timerStatus: TimerStatus) {
  return matchStatus !== 'completed' && timerStatus !== 'stopped'
}

// Ending a match stops its clock and keeps the final match time.
export function finishedMatchFields(elapsedSeconds: number): Pick<Match, 'status' | 'timer_status' | 'timer_elapsed_seconds' | 'timer_started_at'> {
  return { status: 'completed', timer_status: 'stopped', timer_elapsed_seconds: elapsedSeconds, timer_started_at: null }
}
