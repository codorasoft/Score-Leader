import { overlayPending } from './outboxOverlay'
import type { OutboxOp } from './outbox'
import type { Match, MatchEvent, TeamPlayer } from './types'

const match = { id: 'm1', team1_score: 0, team2_score: 0, timer_status: 'paused' } as Match
const ev = (id: string, extra: Partial<MatchEvent> = {}) => ({ id, match_id: 'm1', event_type: 'goal', related_event_id: null, ...extra }) as MatchEvent

it('adds queued events, applies queued score and clock updates, and team moves', () => {
  const ops: OutboxOp[] = [
    { id: '1', kind: 'insert', table: 'match_events', row: ev('g1') as never },
    { id: '2', kind: 'update', table: 'matches', values: { team1_score: 1 }, match: { id: 'm1' } },
    { id: '3', kind: 'update', table: 'matches', values: { timer_status: 'running' }, match: { id: 'm1' } },
    { id: '4', kind: 'update', table: 'team_players', values: { team_id: 'B' }, match: { player_id: 'p1', team_id: 'A' } },
    { id: '5', kind: 'update', table: 'matches', values: { team1_score: 9 }, match: { id: 'other' } },
  ]
  const out = overlayPending(ops, { match, events: [], teamPlayers: [{ team_id: 'A', player_id: 'p1' }] as TeamPlayer[] })
  expect(out.events.map((e) => e.id)).toEqual(['g1'])
  expect(out.match).toMatchObject({ team1_score: 1, timer_status: 'running' })
  expect(out.teamPlayers).toEqual([{ team_id: 'B', player_id: 'p1' }])
})

it('does not duplicate an event the server already has, and removes queued deletions', () => {
  const ops: OutboxOp[] = [
    { id: '1', kind: 'insert', table: 'match_events', row: ev('g1') as never },
    { id: '2', kind: 'delete', table: 'match_events', match: { related_event_id: 'g2' } },
    { id: '3', kind: 'delete', table: 'match_events', match: { id: 'g2' } },
  ]
  const events = [ev('g1'), ev('g2'), ev('a2', { event_type: 'assist', related_event_id: 'g2' })]
  const out = overlayPending(ops, { match, events, teamPlayers: [] })
  expect(out.events.map((e) => e.id)).toEqual(['g1'])
})
