import { matchesByPlayer, matchRosters, partnerships, partnersOf } from './playerMatches'
import type { Match, MatchEvent, Session, TeamPlayer } from '../lib/types'

const sessions = [{ id: 's1', date: '2026-09-01' }, { id: 's2', date: '2026-09-08' }] as Session[]
const m = (id: string, session_id: string, match_number: number, team1_id: string, team2_id: string, a: number, b: number) =>
  ({ id, session_id, match_number, team1_id, team2_id, waiting_team_id: 'x', status: 'completed', team1_score: a, team2_score: b }) as Match
// Session 1: Ali+Omar on A, Sami on B. Session 2: Ali+Sami on C, Omar on D.
const teamPlayers: TeamPlayer[] = [
  { team_id: 'A', player_id: 'ali' }, { team_id: 'A', player_id: 'omar' }, { team_id: 'B', player_id: 'sami' },
  { team_id: 'C', player_id: 'ali' }, { team_id: 'C', player_id: 'sami' }, { team_id: 'D', player_id: 'omar' },
]
const matches = [
  m('m2', 's1', 2, 'A', 'B', 1, 1),
  m('m1', 's1', 1, 'A', 'B', 2, 0),
  m('m3', 's2', 1, 'C', 'D', 0, 3),
]
const league = { sessions, matches, teamPlayers, events: [] }

it('lists each player\'s matches in time order with the result', () => {
  const ali = matchesByPlayer(league).get('ali')!
  expect(ali.map((x) => [x.match.id, x.result, x.goalsFor, x.goalsAgainst])).toEqual([
    ['m1', 'W', 2, 0], ['m2', 'D', 1, 1], ['m3', 'L', 0, 3],
  ])
})

it('counts matches and wins for every pair of teammates', () => {
  const pairs = partnerships(league)
  const key = (a: string, b: string) => pairs.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a))
  expect(key('ali', 'omar')).toMatchObject({ matches: 2, wins: 1, draws: 1 })
  expect(key('ali', 'sami')).toMatchObject({ matches: 1, wins: 0 })
  expect(key('omar', 'sami')).toBeUndefined()
})

it('picks best and worst partners with enough matches together', () => {
  const pairs = [
    { a: 'ali', b: 'omar', matches: 6, wins: 5, draws: 0 },
    { a: 'ali', b: 'sami', matches: 8, wins: 2, draws: 1 },
    { a: 'hadi', b: 'ali', matches: 5, wins: 3, draws: 0 },
    { a: 'ali', b: 'new', matches: 2, wins: 2, draws: 0 },
  ]
  const { best, worst } = partnersOf(pairs, 'ali', 5)
  // Best and worst never repeat a partner: the top half are "best", the rest "toughest"
  expect(best.map((p) => [p.partnerId, Math.round(p.winRate * 100)])).toEqual([['omar', 83], ['hadi', 60]])
  expect(worst.map((p) => p.partnerId)).toEqual(['sami'])
})

it('shows no toughest list when every partner has the same win rate', () => {
  const pairs = [
    { a: 'ali', b: 'omar', matches: 10, wins: 3, draws: 0 },
    { a: 'ali', b: 'sami', matches: 10, wins: 3, draws: 0 },
  ]
  const { best, worst } = partnersOf(pairs, 'ali', 5)
  expect(best).toHaveLength(2)
  expect(worst).toEqual([])
})

describe('matchRosters', () => {
  // Ali starts on A and Sami on B; team_players holds where they ended the session
  const games = [m('g1', 's1', 1, 'A', 'B', 1, 0), m('g2', 's1', 2, 'A', 'B', 0, 0), m('g3', 's1', 3, 'B', 'A', 2, 0)]
  const swapped: TeamPlayer[] = [{ team_id: 'B', player_id: 'ali' }, { team_id: 'A', player_id: 'sami' }, { team_id: 'A', player_id: 'omar' }]
  // Each row's team_id is the team that player moved to; the second row points at the first
  const swap = (match_id: string, elapsed_seconds: number | null, period = 1) => [
    { id: 'sw1', match_id, player_id: 'ali', team_id: 'B', event_type: 'swap', related_event_id: null, elapsed_seconds, period, created_at: '1' },
    { id: 'sw2', match_id, player_id: 'sami', team_id: 'A', event_type: 'swap', related_event_id: 'sw1', elapsed_seconds, period, created_at: '1' },
  ] as MatchEvent[]
  const teamOf = (events: MatchEvent[], player: string) => {
    const rosters = matchRosters({ matches: games, teamPlayers: swapped, events })
    return games.map((g) => rosters.get(g.id)!.get(player))
  }

  it('keeps everyone on their team when nobody swapped', () => {
    expect(teamOf([], 'omar')).toEqual(['A', 'A', 'A'])
  })

  it('moves both players from the match a swap was made before kick-off', () => {
    expect(teamOf(swap('g2', null), 'ali')).toEqual(['A', 'B', 'B'])
    expect(teamOf(swap('g2', null), 'sami')).toEqual(['B', 'A', 'A'])
  })

  it('moves them from the next match when the swap was made during a match', () => {
    expect(teamOf(swap('g2', 300), 'ali')).toEqual(['A', 'A', 'B'])
    expect(teamOf(swap('g2', null, 2), 'ali')).toEqual(['A', 'A', 'B'])
  })

  it('puts a swap made in an unfinished match after every finished one', () => {
    expect(teamOf(swap('never-finished', null), 'ali')).toEqual(['A', 'A', 'A'])
  })

  it('credits results to the team the player was on in each match', () => {
    const ali = matchesByPlayer({ sessions, matches: games, teamPlayers: swapped, events: swap('g2', null) }).get('ali')!
    expect(ali.map((x) => [x.match.id, x.teamId, x.result, x.goalsAgainst])).toEqual([
      ['g1', 'A', 'W', 0], ['g2', 'B', 'D', 0], ['g3', 'B', 'W', 0],
    ])
  })
})
