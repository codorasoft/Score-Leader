import { buildTimeline } from './timeline'
import type { MatchEvent } from '../lib/types'

const ev = (o: Partial<MatchEvent> & Pick<MatchEvent, 'id' | 'event_type' | 'created_at'>): MatchEvent => ({
  match_id: 'm1', player_id: 'p', team_id: 'red', related_event_id: null, minute: null, elapsed_seconds: null,
  suspension_minutes: null, suspension_started_at: null, suspension_ended_at: null, ...o,
})

it('orders entries by when they were recorded and attaches assists to their goal', () => {
  const entries = buildTimeline([
    ev({ id: 'c1', event_type: 'yellow_card', player_id: 'p3', team_id: 'blue', created_at: '2026-10-04T10:05:00Z', elapsed_seconds: 300 }),
    ev({ id: 'g1', event_type: 'goal', player_id: 'p1', created_at: '2026-10-04T10:01:00Z', elapsed_seconds: 60 }),
    ev({ id: 'a1', event_type: 'assist', player_id: 'p2', related_event_id: 'g1', created_at: '2026-10-04T10:01:01Z' }),
  ])
  expect(entries).toEqual([
    { id: 'g1', kind: 'goal', clock: 60, teamId: 'red', playerId: 'p1', assistPlayerId: 'p2' },
    { id: 'c1', kind: 'yellow_card', clock: 300, teamId: 'blue', playerId: 'p3' },
  ])
})

it('merges a swap pair into one entry with each player\'s from and to team', () => {
  const entries = buildTimeline([
    ev({ id: 's1', event_type: 'swap', player_id: 'ali', team_id: 'blue', created_at: '2026-10-04T10:02:00Z', elapsed_seconds: 120 }),
    ev({ id: 's2', event_type: 'swap', player_id: 'omar', team_id: 'red', related_event_id: 's1', created_at: '2026-10-04T10:02:00Z', elapsed_seconds: 120 }),
  ])
  expect(entries).toEqual([{
    id: 's1', kind: 'swap', clock: 120, teamId: 'blue',
    swap: { a: { playerId: 'ali', from: 'red', to: 'blue' }, b: { playerId: 'omar', from: 'blue', to: 'red' } },
  }])
})

it('keeps red cards with their suspension length and leaves clock null when no time was logged', () => {
  const [entry] = buildTimeline([
    ev({ id: 'r1', event_type: 'red_card', suspension_minutes: 3, created_at: '2026-10-04T10:00:00Z' }),
  ])
  expect(entry).toMatchObject({ kind: 'red_card', clock: null, suspensionMinutes: 3 })
})
