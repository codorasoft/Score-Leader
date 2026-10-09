import { recomputeResult, findLastUndoable } from './matchEdit'
import { PRESETS } from './matchFormat'

describe('findLastUndoable', () => {
  const ev = (id: string, event_type: string, created_at: string) => ({ id, event_type, created_at }) as never

  it('returns the most recent goal or card regardless of array order', () => {
    const last = findLastUndoable([
      ev('g1', 'goal', '2026-10-04T10:00:00Z'),
      ev('c1', 'yellow_card', '2026-10-04T10:05:00Z'),
      ev('g2', 'goal', '2026-10-04T10:02:00Z'),
    ])
    expect(last?.id).toBe('c1')
  })

  it('skips assists because they are undone together with their goal', () => {
    const last = findLastUndoable([
      ev('g1', 'goal', '2026-10-04T10:00:00Z'),
      ev('a1', 'assist', '2026-10-04T10:00:01Z'),
    ])
    expect(last?.id).toBe('g1')
  })

  it('includes swaps, using the first row of the swap pair', () => {
    const last = findLastUndoable([
      { ...ev('g1', 'goal', '2026-10-04T10:00:00Z'), related_event_id: null },
      { ...ev('s1', 'swap', '2026-10-04T10:03:00Z'), related_event_id: null },
      { ...ev('s2', 'swap', '2026-10-04T10:03:00Z'), related_event_id: 's1' },
    ] as never[])
    expect((last as { id: string }).id).toBe('s1')
  })

  it('returns null when there is nothing to undo', () => {
    expect(findLastUndoable([])).toBeNull()
  })
})

const match = {
  team1_id: 'red', team2_id: 'blue', winner_team_id: 'red' as string | null,
  match_number: 2, draw_resolved_by: null as 'penalties' | 'late_team' | 'extra_time' | null,
  period: 1, penalties_team1: null as number | null, penalties_team2: null as number | null,
}
const goal = (team_id: string) => ({ event_type: 'goal' as const, team_id })

it('counts goals per team and picks the higher scorer as winner', () => {
  const r = recomputeResult(match, [goal('blue'), goal('blue'), goal('red')], PRESETS.quick)
  expect(r).toEqual({ team1_score: 1, team2_score: 2, is_draw: false, winner_team_id: 'blue', draw_resolved_by: null })
})

it('counts penalty_goal events but ignores assists and cards', () => {
  const r = recomputeResult(match, [
    goal('red'),
    { event_type: 'penalty_goal', team_id: 'red' },
    { event_type: 'assist', team_id: 'red' },
    { event_type: 'yellow_card', team_id: 'blue' },
  ], PRESETS.quick)
  expect(r.team1_score).toBe(2)
  expect(r.team2_score).toBe(0)
})

it('keeps the penalty shootout winner when match 1 is edited to another draw', () => {
  const r = recomputeResult({ ...match, match_number: 1, winner_team_id: 'blue', draw_resolved_by: 'penalties' }, [goal('red'), goal('blue')], PRESETS.quick)
  expect(r).toEqual({ team1_score: 1, team2_score: 1, is_draw: true, winner_team_id: 'blue', draw_resolved_by: 'penalties' })
})

it('applies the draw rule when a later match is edited into a draw: the challenger (team2) wins', () => {
  const r = recomputeResult({ ...match, winner_team_id: 'red' }, [goal('red'), goal('blue')], PRESETS.quick)
  expect(r).toEqual({ team1_score: 1, team2_score: 1, is_draw: true, winner_team_id: 'blue', draw_resolved_by: 'late_team' })
})

it('clears draw_resolved_by when the edited result is no longer a draw', () => {
  const r = recomputeResult({ ...match, draw_resolved_by: 'late_team' }, [goal('red')], PRESETS.quick)
  expect(r.draw_resolved_by).toBeNull()
})

it('marks a new draw as penalties in match 1 and late_team afterwards', () => {
  expect(recomputeResult({ ...match, match_number: 1 }, [], PRESETS.quick).draw_resolved_by).toBe('penalties')
  expect(recomputeResult({ ...match, match_number: 3 }, [], PRESETS.quick).draw_resolved_by).toBe('late_team')
})

it('halves (draw rule): a match edited into a draw becomes a true draw with no winner', () => {
  expect(recomputeResult({ ...match, match_number: 1 }, [goal('red'), goal('blue')], PRESETS.halves))
    .toEqual({ team1_score: 1, team2_score: 1, is_draw: true, winner_team_id: null, draw_resolved_by: null })
})

it('knockout (penalties): any match edited into a draw keeps its shoot-out winner', () => {
  const r = recomputeResult({ ...match, match_number: 4, winner_team_id: 'blue', draw_resolved_by: 'penalties' }, [], PRESETS.knockout)
  expect(r).toEqual({ team1_score: 0, team2_score: 0, is_draw: true, winner_team_id: 'blue', draw_resolved_by: 'penalties' })
})

it('an extra-time win keeps its extra-time mark when a scorer is corrected', () => {
  const won = { ...match, match_number: 4, period: 4, winner_team_id: 'red', draw_resolved_by: 'extra_time' as const }
  const r = recomputeResult(won, [goal('red'), goal('red'), goal('blue')], PRESETS.knockout)
  expect(r).toEqual({ team1_score: 2, team2_score: 1, is_draw: false, winner_team_id: 'red', draw_resolved_by: 'extra_time' })
})

it('knockout: a win edited to a level score keeps its winner but does not claim a shoot-out that has no score', () => {
  const r = recomputeResult({ ...match, match_number: 4, period: 2, winner_team_id: 'blue' }, [goal('red'), goal('blue')], PRESETS.knockout)
  expect(r.winner_team_id).toBe('blue')
  expect(r.is_draw).toBe(true)
  expect(r.draw_resolved_by).not.toBe('penalties')
})

it('knockout: a level match with a saved shoot-out score stays decided on penalties', () => {
  const shootOut = { ...match, match_number: 4, period: 5, winner_team_id: 'blue', penalties_team1: 3, penalties_team2: 4 }
  expect(recomputeResult(shootOut, [goal('red'), goal('blue')], PRESETS.knockout).draw_resolved_by).toBe('penalties')
})

import { undoAllowed } from './matchEdit'

describe('undoAllowed', () => {
  const on = { cards: true, swaps: true }
  it('hides undo of a swap when swaps is off', () => {
    expect(undoAllowed('swap', { ...on, swaps: false })).toBe(false)
    expect(undoAllowed('swap', on)).toBe(true)
  })
  it('hides undo of a card when cards is off', () => {
    expect(undoAllowed('yellow_card', { ...on, cards: false })).toBe(false)
    expect(undoAllowed('red_card', { ...on, cards: false })).toBe(false)
    expect(undoAllowed('goal', { cards: false, swaps: false })).toBe(true)
  })
})
