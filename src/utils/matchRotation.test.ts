import { resolveMatch, decideResult, setupFirstMatch, nextMatchToStart } from './matchRotation'
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

it('draw on match > 1: the challenger (team2) wins, the previous winner (team1) goes off', () => {
  const result = decideResult({ team1_score: 1, team2_score: 1, match_number: 2, team1_id: 'red', team2_id: 'blue' })
  expect(result).toEqual({ is_draw: true, draw_resolved_by: 'late_team', winner_team_id: 'blue' })

  const next = resolveMatch(base({ ...result, match_number: 2 }))
  expect(next.nextTeam1Id).toBe('blue')       // challenger stays on
  expect(next.nextTeam2Id).toBe('yellow')     // waiting team comes on
  expect(next.nextWaitingTeamId).toBe('red')  // previous winner sits out
})

it('draw on match 1 has no winner yet so penalties decide it', () => {
  expect(decideResult({ team1_score: 0, team2_score: 0, match_number: 1, team1_id: 'red', team2_id: 'blue' }))
    .toEqual({ is_draw: true, draw_resolved_by: null, winner_team_id: null })
})

it('a decisive score picks the higher-scoring team', () => {
  expect(decideResult({ team1_score: 0, team2_score: 2, match_number: 3, team1_id: 'red', team2_id: 'blue' }))
    .toEqual({ is_draw: false, draw_resolved_by: null, winner_team_id: 'blue' })
})

it('blue wins cleanly: blue stays, yellow comes on, red waits', () => {
  const next = resolveMatch(base({ team1_score: 0, team2_score: 3, winner_team_id: 'blue' }))
  expect(next.nextTeam1Id).toBe('blue')
  expect(next.nextTeam2Id).toBe('yellow')
  expect(next.nextWaitingTeamId).toBe('red')
})

describe('setupFirstMatch', () => {
  const teams = (['green', 'blue', 'yellow'] as const).map((color) => ({ id: color, session_id: 's', color, name: null }))

  it('uses the chosen waiting team and plays the other two', () => {
    const first = setupFirstMatch(teams, 'yellow')
    expect(first.waitingTeamId).toBe('yellow')
    expect([first.team1Id, first.team2Id].sort()).toEqual(['blue', 'green'])
  })

  it('picks a random pairing of three distinct teams when no team is chosen', () => {
    const first = setupFirstMatch(teams)
    expect(new Set([first.team1Id, first.team2Id, first.waitingTeamId])).toEqual(new Set(['green', 'blue', 'yellow']))
  })
})

describe('nextMatchToStart', () => {
  const teams = ['g', 'b', 'y'].map((id) => ({ id, session_id: 's', color: 'green', name: null, league_id: 'L' })) as never
  const done = (n: number, t1: string, t2: string, w: string, winner: string) =>
    ({ id: `m${n}`, match_number: n, team1_id: t1, team2_id: t2, waiting_team_id: w, winner_team_id: winner, status: 'completed' }) as Match

  it('starts match 1 with the chosen waiting team when no matches are left', () => {
    const next = nextMatchToStart([], teams, 'b')!
    expect(next.matchNumber).toBe(1)
    expect(next.waitingTeamId).toBe('b')
    expect([next.team1Id, next.team2Id].sort()).toEqual(['g', 'y'])
  })

  it('carries the rotation on from the last finished match', () => {
    const next = nextMatchToStart([done(1, 'g', 'b', 'y', 'g'), done(2, 'g', 'y', 'b', 'y')], teams)
    expect(next).toEqual({ matchNumber: 3, team1Id: 'y', team2Id: 'b', waitingTeamId: 'g' })
  })

  it('numbers after the highest finished match even when later ones were deleted', () => {
    expect(nextMatchToStart([done(4, 'g', 'b', 'y', 'b')], teams)?.matchNumber).toBe(5)
  })

  it('is null while a match is still pending or being played', () => {
    expect(nextMatchToStart([done(1, 'g', 'b', 'y', 'g'), { ...done(2, 'g', 'y', 'b', 'g'), status: 'pending', winner_team_id: null }], teams)).toBeNull()
  })

  it('is null without three teams', () => {
    expect(nextMatchToStart([], [])).toBeNull()
  })
})
