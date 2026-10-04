import type { OutboxOp } from './outbox'
import type { Match, MatchEvent, TeamPlayer } from './types'

interface TrackerState {
  match: Match
  events: MatchEvent[]
  teamPlayers: TeamPlayer[]
}

const matches = (row: Record<string, unknown>, filter: Record<string, unknown>) =>
  Object.entries(filter).every(([k, v]) => row[k] === v)

// Changes still waiting on this phone are applied on top of what the server returned,
// so a reload while offline doesn't make recorded goals or cards disappear.
export function overlayPending(ops: OutboxOp[], state: TrackerState): TrackerState {
  let { match, events, teamPlayers } = state
  for (const op of ops) {
    if (op.table === 'match_events') {
      if (op.kind === 'insert') {
        const row = op.row as unknown as MatchEvent
        if (row.match_id === match.id && !events.some((e) => e.id === row.id)) events = [...events, row]
      } else if (op.kind === 'delete') {
        events = events.filter((e) => !matches(e as unknown as Record<string, unknown>, op.match))
      }
    } else if (op.table === 'matches' && op.kind === 'update' && op.match.id === match.id) {
      match = { ...match, ...(op.values as Partial<Match>) }
    } else if (op.table === 'team_players' && op.kind === 'update') {
      teamPlayers = teamPlayers.map((tp) =>
        matches(tp as unknown as Record<string, unknown>, op.match) ? { ...tp, ...(op.values as Partial<TeamPlayer>) } : tp)
    }
  }
  return { match, events, teamPlayers }
}
