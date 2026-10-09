import { goalOps, cardOps, swapOps, undoOps } from './pitchOps'
import { overlayPending } from '../lib/outboxOverlay'
import type { Match, MatchEvent, TeamPlayer } from '../lib/types'

const match = { id: 'm1', team1_id: 'A', team2_id: 'B', team1_score: 1, team2_score: 0, period: 1 } as Match
const clock = { elapsed_seconds: 95, minute: 1 }
let n = 0
const ids = () => `id${++n}`
const now = '2026-10-05T18:00:00.000Z'

it('records a goal with its assist and the new score, using ids made on the phone', () => {
  const ops = goalOps({ match, scorerId: 'ali', scorerTeamId: 'B', assisterId: 'omar', assisterTeamId: 'B', clock, newId: ids, now })
  const state = overlayPending(ops, { match, events: [], teamPlayers: [] })
  const [goal, assist] = state.events
  expect(goal).toMatchObject({ event_type: 'goal', player_id: 'ali', team_id: 'B', elapsed_seconds: 95, created_at: now })
  expect(assist).toMatchObject({ event_type: 'assist', player_id: 'omar', related_event_id: goal.id })
  expect(state.match).toMatchObject({ team1_score: 1, team2_score: 1 })
})

it('records a card', () => {
  const ops = cardOps({ match, playerId: 'ali', teamId: 'A', cardType: 'red_card', suspensionMinutes: 2, clock, newId: ids, now })
  const [card] = overlayPending(ops, { match, events: [], teamPlayers: [] }).events
  expect(card).toMatchObject({ event_type: 'red_card', suspension_minutes: 2, suspension_started_at: now })
})

it('records a swap as two team moves plus a linked pair of timeline rows', () => {
  const teamPlayers = [{ team_id: 'A', player_id: 'ali' }, { team_id: 'B', player_id: 'omar' }] as TeamPlayer[]
  const ops = swapOps({ match, p1: { id: 'ali', teamId: 'A' }, p2: { id: 'omar', teamId: 'B' }, clock, newId: ids, now })
  const state = overlayPending(ops, { match, events: [], teamPlayers })
  expect(state.teamPlayers).toEqual([{ team_id: 'B', player_id: 'ali' }, { team_id: 'A', player_id: 'omar' }])
  const [first, second] = state.events
  expect(first).toMatchObject({ event_type: 'swap', player_id: 'ali', team_id: 'B', related_event_id: null })
  expect(second).toMatchObject({ event_type: 'swap', player_id: 'omar', team_id: 'A', related_event_id: first.id })
})

describe('undoOps', () => {
  it('removes a goal with its assist and lowers that team\'s score', () => {
    const scored = { ...match, team2_score: 1 }
    const goal = { id: 'g', event_type: 'goal', team_id: 'B', related_event_id: null } as MatchEvent
    const assist = { id: 'a', event_type: 'assist', team_id: 'B', related_event_id: 'g' } as MatchEvent
    const state = overlayPending(undoOps({ match: scored, event: goal, events: [goal, assist] }), { match: scored, events: [goal, assist], teamPlayers: [] })
    expect(state.events).toEqual([])
    expect(state.match).toMatchObject({ team1_score: 1, team2_score: 0 })
  })

  it('moves both swapped players back and removes the swap rows', () => {
    const first = { id: 's1', event_type: 'swap', player_id: 'ali', team_id: 'B', related_event_id: null } as MatchEvent
    const second = { id: 's2', event_type: 'swap', player_id: 'omar', team_id: 'A', related_event_id: 's1' } as MatchEvent
    const teamPlayers = [{ team_id: 'B', player_id: 'ali' }, { team_id: 'A', player_id: 'omar' }] as TeamPlayer[]
    const state = overlayPending(undoOps({ match, event: first, events: [first, second] }), { match, events: [first, second], teamPlayers })
    expect(state.teamPlayers).toEqual([{ team_id: 'A', player_id: 'ali' }, { team_id: 'B', player_id: 'omar' }])
    expect(state.events).toEqual([])
  })

  it('removes a card without touching the score', () => {
    const card = { id: 'c', event_type: 'yellow_card', team_id: 'A', related_event_id: null } as MatchEvent
    const ops = undoOps({ match, event: card, events: [card] })
    expect(ops.every((o) => o.table === 'match_events')).toBe(true)
  })
})

it('every event row carries the match period', () => {
  const ops = goalOps({ match: { ...match, period: 2 }, scorerId: 'ali', scorerTeamId: 'B', assisterId: 'omar', assisterTeamId: 'B', clock, newId: ids, now })
  const events = ops.filter((o) => o.table === 'match_events')
  expect(events.length).toBeGreaterThan(0)
  for (const op of events) expect((op as unknown as { row: MatchEvent }).row.period).toBe(2)
})
