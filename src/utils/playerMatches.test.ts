import { matchesByPlayer, partnerships, partnersOf } from './playerMatches'
import type { Match, Session, TeamPlayer } from '../lib/types'

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
