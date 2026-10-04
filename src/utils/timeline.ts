import type { MatchEvent } from '../lib/types'
import { eventClockSeconds } from './matchClock'

interface SwapSide { playerId: string; from: string; to: string }

export type TimelineEntry =
  | { id: string; kind: 'goal'; clock: number | null; teamId: string; playerId: string; assistPlayerId?: string }
  | { id: string; kind: 'yellow_card'; clock: number | null; teamId: string; playerId: string }
  | { id: string; kind: 'red_card'; clock: number | null; teamId: string; playerId: string; suspensionMinutes: number | null }
  | { id: string; kind: 'swap'; clock: number | null; teamId: string; swap: { a: SwapSide; b: SwapSide } }

// Assists and the second half of a swap pair are folded into the entry they belong to.
export function buildTimeline(events: MatchEvent[]): TimelineEntry[] {
  const sorted = [...events].sort((x, y) => x.created_at.localeCompare(y.created_at))
  const linked = (e: MatchEvent, type: MatchEvent['event_type']) =>
    sorted.find((o) => o.event_type === type && o.related_event_id === e.id)

  const entries: TimelineEntry[] = []
  for (const e of sorted) {
    const base = { id: e.id, clock: eventClockSeconds(e), teamId: e.team_id }
    if (e.event_type === 'goal' || e.event_type === 'penalty_goal') {
      const assist = linked(e, 'assist')
      entries.push({ ...base, kind: 'goal', playerId: e.player_id, ...(assist && { assistPlayerId: assist.player_id }) })
    } else if (e.event_type === 'yellow_card') {
      entries.push({ ...base, kind: 'yellow_card', playerId: e.player_id })
    } else if (e.event_type === 'red_card') {
      entries.push({ ...base, kind: 'red_card', playerId: e.player_id, suspensionMinutes: e.suspension_minutes })
    } else if (e.event_type === 'swap' && !e.related_event_id) {
      const partner = linked(e, 'swap')
      if (!partner) continue
      entries.push({
        ...base,
        kind: 'swap',
        swap: {
          a: { playerId: e.player_id, from: partner.team_id, to: e.team_id },
          b: { playerId: partner.player_id, from: e.team_id, to: partner.team_id },
        },
      })
    }
  }
  return entries
}
