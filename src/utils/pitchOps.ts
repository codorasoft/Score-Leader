import type { OutboxOp } from '../lib/outbox'
import type { Match, MatchEvent } from '../lib/types'

// Builds the database changes for each match-screen action. The same list is sent to the server
// (or kept on the phone) and applied to the screen, so what you see is what will be saved.

interface Clock { elapsed_seconds: number | null; minute: number | null }

interface Common {
  match: Pick<Match, 'id' | 'team1_id' | 'team1_score' | 'team2_score'>
  clock: Clock
  newId: () => string
  now: string
}

const eventRow = (p: Common, fields: Partial<MatchEvent> & Pick<MatchEvent, 'id' | 'player_id' | 'team_id' | 'event_type'>): MatchEvent => ({
  match_id: p.match.id,
  related_event_id: null,
  suspension_minutes: null,
  suspension_started_at: null,
  suspension_ended_at: null,
  created_at: p.now,
  ...p.clock,
  ...fields,
} as MatchEvent)

const insert = (p: Common, row: MatchEvent): OutboxOp =>
  ({ id: p.newId(), kind: 'insert', table: 'match_events', row: row as unknown as Record<string, unknown> })

const scoreUpdate = (p: Pick<Common, 'match' | 'newId'>, teamId: string, delta: 1 | -1): OutboxOp => {
  const isTeam1 = teamId === p.match.team1_id
  const current = isTeam1 ? p.match.team1_score : p.match.team2_score
  // Absolute value, so re-sending the same change can't count a goal twice
  return {
    id: p.newId(), kind: 'update', table: 'matches', match: { id: p.match.id },
    values: { [isTeam1 ? 'team1_score' : 'team2_score']: Math.max(0, current + delta) },
  }
}

export function goalOps(p: Common & { scorerId: string; scorerTeamId: string; assisterId?: string | null; assisterTeamId?: string | null }): OutboxOp[] {
  const goal = eventRow(p, { id: p.newId(), player_id: p.scorerId, team_id: p.scorerTeamId, event_type: 'goal' })
  const ops = [insert(p, goal)]
  if (p.assisterId) {
    ops.push(insert(p, eventRow(p, {
      id: p.newId(), player_id: p.assisterId, team_id: p.assisterTeamId ?? p.scorerTeamId, event_type: 'assist', related_event_id: goal.id,
    })))
  }
  ops.push(scoreUpdate(p, p.scorerTeamId, 1))
  return ops
}

export function cardOps(p: Common & { playerId: string; teamId: string; cardType: 'yellow_card' | 'red_card'; suspensionMinutes: 2 | 3 | null }): OutboxOp[] {
  return [insert(p, eventRow(p, {
    id: p.newId(), player_id: p.playerId, team_id: p.teamId, event_type: p.cardType,
    suspension_minutes: p.suspensionMinutes, suspension_started_at: p.suspensionMinutes ? p.now : null,
  }))]
}

// Each swap row's team_id is the team that player moved to; the second row points at the first.
export function swapOps(p: Common & { p1: { id: string; teamId: string }; p2: { id: string; teamId: string } }): OutboxOp[] {
  const first = eventRow(p, { id: p.newId(), player_id: p.p1.id, team_id: p.p2.teamId, event_type: 'swap' })
  return [
    { id: p.newId(), kind: 'update', table: 'team_players', values: { team_id: p.p2.teamId }, match: { player_id: p.p1.id, team_id: p.p1.teamId } },
    { id: p.newId(), kind: 'update', table: 'team_players', values: { team_id: p.p1.teamId }, match: { player_id: p.p2.id, team_id: p.p2.teamId } },
    insert(p, first),
    insert(p, eventRow(p, { id: p.newId(), player_id: p.p2.id, team_id: p.p1.teamId, event_type: 'swap', related_event_id: first.id })),
  ]
}

export function undoOps(p: { match: Common['match']; event: MatchEvent; events: MatchEvent[]; newId?: () => string }): OutboxOp[] {
  const newId = p.newId ?? (() => crypto.randomUUID())
  const { event } = p
  // Linked rows (assist, second swap row) point at this event without CASCADE, so they go first
  const removeLinked: OutboxOp = { id: newId(), kind: 'delete', table: 'match_events', match: { related_event_id: event.id } }
  const removeEvent: OutboxOp = { id: newId(), kind: 'delete', table: 'match_events', match: { id: event.id } }

  if (event.event_type === 'goal' || event.event_type === 'penalty_goal') {
    return [removeLinked, removeEvent, scoreUpdate({ match: p.match, newId }, event.team_id, -1)]
  }
  if (event.event_type === 'swap') {
    const partner = p.events.find((e) => e.event_type === 'swap' && e.related_event_id === event.id)
    if (!partner) return [removeEvent]
    // Move both players back: each row records the team they moved to, i.e. where they are now
    return [
      { id: newId(), kind: 'update', table: 'team_players', values: { team_id: partner.team_id }, match: { player_id: event.player_id, team_id: event.team_id } },
      { id: newId(), kind: 'update', table: 'team_players', values: { team_id: event.team_id }, match: { player_id: partner.player_id, team_id: partner.team_id } },
      removeLinked,
      removeEvent,
    ]
  }
  return [removeEvent]
}
