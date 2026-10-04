import { resolveMatch } from './matchRotation'
import type { Match } from '../lib/types'

const base = (o: Partial<Match> = {}): Match => ({
  id: 'm1', session_id: 's1', match_number: 1,
  team1_id: 'red', team2_id: 'blue', waiting_team_id: 'yellow',
  status: 'completed', team1_score: 0, team2_score: 0,
  winner_team_id: null, is_draw: false, draw_resolved_by: null,
  timer_started_at: null, timer_elapsed_seconds: 0, timer_status: 'stopped',
  created_at: '',
  ...o,
})

it('winner stays, loser sits, waiter comes on', () => {
  const next = resolveMatch(base({ team1_score: 2, team2_score: 1, winner_team_id: 'red' }))
  expect(next.nextTeam1Id).toBe('red')
  expect(next.nextTeam2Id).toBe('yellow')
  expect(next.nextWaitingTeamId).toBe('blue')
})

it('draw on match 1 with penalty winner: winner stays, loser waits', () => {
  const next = resolveMatch(base({
    is_draw: true, draw_resolved_by: 'penalties', winner_team_id: 'blue', match_number: 1,
  }))
  expect(next.nextTeam1Id).toBe('blue')
  expect(next.nextTeam2Id).toBe('yellow')
  expect(next.nextWaitingTeamId).toBe('red')
})

it('draw on match > 1: team1 (prev winner) retains spot, team2 sits out', () => {
  // team1_id is always the previous match winner; they keep their spot on a draw
  const next = resolveMatch(base({
    is_draw: true, draw_resolved_by: 'late_team', winner_team_id: 'red',
    match_number: 2,
  }))
  expect(next.nextTeam1Id).toBe('red')    // prev winner stays
  expect(next.nextTeam2Id).toBe('yellow') // waiting team comes on
  expect(next.nextWaitingTeamId).toBe('blue') // team2 sits out
})

it('blue wins cleanly: blue stays, yellow comes on, red waits', () => {
  const next = resolveMatch(base({ team1_score: 0, team2_score: 3, winner_team_id: 'blue' }))
  expect(next.nextTeam1Id).toBe('blue')
  expect(next.nextTeam2Id).toBe('yellow')
  expect(next.nextWaitingTeamId).toBe('red')
})
