import { recomputeResult } from './matchEdit'

const match = {
  team1_id: 'red', team2_id: 'blue', winner_team_id: 'red' as string | null,
  match_number: 2, draw_resolved_by: null as 'penalties' | 'late_team' | null,
}
const goal = (team_id: string) => ({ event_type: 'goal' as const, team_id })

it('counts goals per team and picks the higher scorer as winner', () => {
  const r = recomputeResult(match, [goal('blue'), goal('blue'), goal('red')])
  expect(r).toEqual({ team1_score: 1, team2_score: 2, is_draw: false, winner_team_id: 'blue', draw_resolved_by: null })
})

it('counts penalty_goal events but ignores assists and cards', () => {
  const r = recomputeResult(match, [
    goal('red'),
    { event_type: 'penalty_goal', team_id: 'red' },
    { event_type: 'assist', team_id: 'red' },
    { event_type: 'yellow_card', team_id: 'blue' },
  ])
  expect(r.team1_score).toBe(2)
  expect(r.team2_score).toBe(0)
})

it('keeps the existing winner on a draw so penalty or rotation results survive', () => {
  const r = recomputeResult({ ...match, winner_team_id: 'blue', draw_resolved_by: 'penalties' }, [goal('red'), goal('blue')])
  expect(r).toEqual({ team1_score: 1, team2_score: 1, is_draw: true, winner_team_id: 'blue', draw_resolved_by: 'penalties' })
})

it('clears draw_resolved_by when the edited result is no longer a draw', () => {
  const r = recomputeResult({ ...match, draw_resolved_by: 'late_team' }, [goal('red')])
  expect(r.draw_resolved_by).toBeNull()
})

it('marks a new draw as penalties in match 1 and late_team afterwards', () => {
  expect(recomputeResult({ ...match, match_number: 1 }, []).draw_resolved_by).toBe('penalties')
  expect(recomputeResult({ ...match, match_number: 3 }, []).draw_resolved_by).toBe('late_team')
})
