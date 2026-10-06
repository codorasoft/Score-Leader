import type { AwardVote, Match, Session } from '../lib/types'

export type LiveState =
  | { kind: 'match'; session: Session; match: Match }
  | { kind: 'open'; session: Session }
  | { kind: 'setup'; session: Session }
  | { kind: 'idle'; lastPlayed: string | null }

const newestFirst = (a: Session, b: Session) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)

// What the "Live now / Start" block shows: the newest unfinished session (its running or next
// match when there is one), otherwise when the league last played.
export function liveState(sessions: Session[], matchesOfOpenSessions: Match[]): LiveState {
  const open = sessions.filter((s) => s.status !== 'completed').sort(newestFirst)[0]
  if (!open) {
    const last = sessions.filter((s) => s.status === 'completed').sort(newestFirst)[0]
    return { kind: 'idle', lastPlayed: last?.date ?? null }
  }
  if (open.status === 'draft') return { kind: 'setup', session: open }
  const own = matchesOfOpenSessions.filter((m) => m.session_id === open.id)
  const running = own.find((m) => m.status === 'active')
  const next = own.filter((m) => m.status === 'pending').sort((a, b) => a.match_number - b.match_number)[0]
  const match = running ?? next
  return match ? { kind: 'match', session: open, match } : { kind: 'open', session: open }
}

// Sessions from an earlier day that were never finished
export function staleSessions(sessions: Session[], today: string): Session[] {
  return sessions.filter((s) => s.status !== 'completed' && s.date < today).sort(newestFirst)
}

export interface OpenVote {
  id: string
  sessionId: string
  sessionDate: string
  awardType: AwardVote['award_type']
  votes: number
}

export type TodoItem =
  | { kind: 'vote'; vote: OpenVote }
  | { kind: 'stale'; session: Session }
  | { kind: 'photos'; count: number }

export function todoItems(input: { votes: OpenVote[]; stale: Session[]; missingPhotos: number; voting: boolean; photos: boolean }): TodoItem[] {
  return [
    ...(input.voting ? input.votes.map((vote) => ({ kind: 'vote' as const, vote })) : []),
    ...input.stale.map((session) => ({ kind: 'stale' as const, session })),
    ...(input.photos && input.missingPhotos > 0 ? [{ kind: 'photos' as const, count: input.missingPhotos }] : []),
  ]
}

// Seconds on the match clock at `now` (pauses excluded)
export function matchElapsed(match: Pick<Match, 'timer_status' | 'timer_started_at' | 'timer_elapsed_seconds'>, now: number): number {
  if (match.timer_status !== 'running' || !match.timer_started_at) return match.timer_elapsed_seconds
  return match.timer_elapsed_seconds + Math.max(0, Math.floor((now - Date.parse(match.timer_started_at)) / 1000))
}
