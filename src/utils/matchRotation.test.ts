import { resolveMatch, decideResult, setupFirstMatch, nextMatchToStart, matchRowFields } from './matchRotation'
import type { Match, Team, TeamColor } from '../lib/types'

const base = (o: Partial<Match> = {}): Match => ({
  league_id: 'L', id: 'm1', session_id: 's1', match_number: 1,
  team1_id: 'red', team2_id: 'blue', waiting_team_id: 'yellow', queue: ['yellow'],
  status: 'completed', team1_score: 0, team2_score: 0,
  winner_team_id: null, is_draw: false, draw_resolved_by: null,
  timer_started_at: null, timer_elapsed_seconds: 0, timer_status: 'stopped',
  created_at: '',
  ...o,
})

const teamsOf = (...ids: string[]): Team[] => {
  const colors: TeamColor[] = ['green', 'blue', 'yellow', 'orange', 'purple', 'white']
  return ids.map((id, i) => ({ league_id: 'L', id, session_id: 's', color: colors[i], name: null }))
}

describe('three teams: same results as before', () => {
  it('winner stays, loser sits, waiter comes on', () => {
    expect(resolveMatch(base({ team1_score: 2, team2_score: 1, winner_team_id: 'red' })))
      .toEqual({ team1Id: 'red', team2Id: 'yellow', queue: ['blue'] })
  })

  it('draw on match 1 with penalty winner: winner stays, loser waits', () => {
    expect(resolveMatch(base({ is_draw: true, draw_resolved_by: 'penalties', winner_team_id: 'blue' })))
      .toEqual({ team1Id: 'blue', team2Id: 'yellow', queue: ['red'] })
  })

  it('draw on match > 1: the challenger (team2) wins, the previous winner (team1) goes off', () => {
    const result = decideResult({ team1_score: 1, team2_score: 1, match_number: 2, team1_id: 'red', team2_id: 'blue' })
    expect(result).toEqual({ is_draw: true, draw_resolved_by: 'late_team', winner_team_id: 'blue' })
    expect(resolveMatch(base({ ...result, match_number: 2 }))).toEqual({ team1Id: 'blue', team2Id: 'yellow', queue: ['red'] })
  })

  it('blue wins cleanly: blue stays, yellow comes on, red waits', () => {
    expect(resolveMatch(base({ team1_score: 0, team2_score: 3, winner_team_id: 'blue' })))
      .toEqual({ team1Id: 'blue', team2Id: 'yellow', queue: ['red'] })
  })
})

it('draw on match 1 has no winner yet so penalties decide it', () => {
  expect(decideResult({ team1_score: 0, team2_score: 0, match_number: 1, team1_id: 'red', team2_id: 'blue' }))
    .toEqual({ is_draw: true, draw_resolved_by: null, winner_team_id: null })
})

it('a decisive score picks the higher-scoring team', () => {
  expect(decideResult({ team1_score: 0, team2_score: 2, match_number: 3, team1_id: 'red', team2_id: 'blue' }))
    .toEqual({ is_draw: false, draw_resolved_by: null, winner_team_id: 'blue' })
})

it('cannot resolve a match without a winner', () => {
  expect(() => resolveMatch(base())).toThrow()
})

describe('queue with more teams', () => {
  it('four teams: winner stays, front of the queue comes on, loser joins the back', () => {
    const m1 = base({ team1_id: 'g', team2_id: 'b', waiting_team_id: 'y', queue: ['y', 'o'], winner_team_id: 'g' })
    const next = resolveMatch(m1)
    expect(next).toEqual({ team1Id: 'g', team2Id: 'y', queue: ['o', 'b'] })

    const m2 = base({ match_number: 2, team1_id: next.team1Id, team2_id: next.team2Id, queue: next.queue, winner_team_id: 'y' })
    expect(resolveMatch(m2)).toEqual({ team1Id: 'y', team2Id: 'o', queue: ['b', 'g'] })
  })

  it('five teams keep their order over several matches', () => {
    let m = base({ team1_id: 'a', team2_id: 'b', queue: ['c', 'd', 'e'], winner_team_id: 'a' })
    const seen: string[][] = []
    for (const winnerIs of ['team1', 'team2', 'team1'] as const) {
      const next = resolveMatch(m)
      seen.push([next.team1Id, next.team2Id, ...next.queue])
      m = base({ team1_id: next.team1Id, team2_id: next.team2Id, queue: next.queue, winner_team_id: winnerIs === 'team1' ? next.team1Id : next.team2Id })
    }
    expect(seen).toEqual([
      ['a', 'c', 'd', 'e', 'b'],  // a beat b
      ['a', 'd', 'e', 'b', 'c'],  // a beat c
      ['d', 'e', 'b', 'c', 'a'],  // d beat a
    ])
  })

  it('two teams: the same two play again and nobody waits', () => {
    const next = resolveMatch(base({ team1_id: 'g', team2_id: 'b', waiting_team_id: null, queue: [], winner_team_id: 'b' }))
    expect(next).toEqual({ team1Id: 'b', team2Id: 'g', queue: [] })
    expect(matchRowFields(next)).toEqual({ team1_id: 'b', team2_id: 'g', queue: [], waiting_team_id: null })
  })

  it('two teams: a draw in match 1 still goes to penalties', () => {
    expect(decideResult({ team1_score: 2, team2_score: 2, match_number: 1, team1_id: 'g', team2_id: 'b' }).winner_team_id).toBeNull()
  })

  it('a match saved by an older app version (no queue) uses its waiting team', () => {
    const old = base({ team1_id: 'g', team2_id: 'b', waiting_team_id: 'y', queue: [], winner_team_id: 'g' })
    expect(resolveMatch(old)).toEqual({ team1Id: 'g', team2Id: 'y', queue: ['b'] })
  })
})

describe('matchRowFields', () => {
  it('stores the queue and its first team as the waiting team', () => {
    expect(matchRowFields({ team1Id: 'g', team2Id: 'y', queue: ['o', 'b'] }))
      .toEqual({ team1_id: 'g', team2_id: 'y', queue: ['o', 'b'], waiting_team_id: 'o' })
  })
})

describe('setupFirstMatch', () => {
  it('plays the two chosen teams and queues the rest in colour order', () => {
    const teams = teamsOf('g', 'b', 'y', 'o')
    const first = setupFirstMatch(teams, ['b', 'o'])
    expect([first.team1Id, first.team2Id].sort()).toEqual(['b', 'o'])
    expect(first.queue).toEqual(['g', 'y'])
  })

  it('three teams: choosing two to play leaves the third waiting', () => {
    expect(setupFirstMatch(teamsOf('g', 'b', 'y'), ['g', 'y']).queue).toEqual(['b'])
  })

  it('picks two distinct teams at random when none are chosen', () => {
    const first = setupFirstMatch(teamsOf('g', 'b', 'y', 'o', 'p'))
    expect(new Set([first.team1Id, first.team2Id, ...first.queue])).toEqual(new Set(['g', 'b', 'y', 'o', 'p']))
    expect(first.team1Id).not.toBe(first.team2Id)
  })

  it('two teams: both play and nobody waits', () => {
    expect(setupFirstMatch(teamsOf('g', 'b')).queue).toEqual([])
  })
})

describe('nextMatchToStart', () => {
  const done = (n: number, t1: string, t2: string, queue: string[], winner: string) =>
    base({ id: `m${n}`, match_number: n, team1_id: t1, team2_id: t2, queue, waiting_team_id: queue[0] ?? null, winner_team_id: winner })

  it('starts match 1 with the chosen teams when no matches are left', () => {
    const next = nextMatchToStart([], teamsOf('g', 'b', 'y', 'o'), ['b', 'y'])!
    expect(next.matchNumber).toBe(1)
    expect([next.team1Id, next.team2Id].sort()).toEqual(['b', 'y'])
    expect(next.queue).toEqual(['g', 'o'])
  })

  it('carries the rotation on from the last finished match', () => {
    const next = nextMatchToStart([done(1, 'g', 'b', ['y', 'o'], 'g'), done(2, 'g', 'y', ['o', 'b'], 'y')], teamsOf('g', 'b', 'y', 'o'))
    expect(next).toEqual({ matchNumber: 3, team1Id: 'y', team2Id: 'o', queue: ['b', 'g'] })
  })

  it('numbers after the highest finished match even when later ones were deleted', () => {
    expect(nextMatchToStart([done(4, 'g', 'b', ['y'], 'b')], teamsOf('g', 'b', 'y'))?.matchNumber).toBe(5)
  })

  it('is null while a match is still pending or being played', () => {
    expect(nextMatchToStart([done(1, 'g', 'b', ['y'], 'g'), { ...done(2, 'g', 'y', ['b'], 'g'), status: 'pending', winner_team_id: null }], teamsOf('g', 'b', 'y'))).toBeNull()
  })

  it('is null with fewer than two teams', () => {
    expect(nextMatchToStart([], teamsOf('g'))).toBeNull()
  })
})
