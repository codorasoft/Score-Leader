import { computeRecords } from './records'
import type { Match, MatchEvent, Player, Session, Team, TeamPlayer } from '../lib/types'

const players = ['ali', 'omar', 'sami', 'gk'].map((id) => ({ id, name: id.toUpperCase(), position: id === 'gk' ? 'GK' : 'MID' }) as Player)
const sessions = [{ id: 's1', date: '2026-09-01' }, { id: 's2', date: '2026-09-08' }] as Session[]
const teams = [
  { id: 'A', session_id: 's1', color: 'green' }, { id: 'B', session_id: 's1', color: 'blue' },
  { id: 'C', session_id: 's2', color: 'yellow' }, { id: 'D', session_id: 's2', color: 'blue' },
] as Team[]
const teamPlayers: TeamPlayer[] = [
  { team_id: 'A', player_id: 'ali' }, { team_id: 'A', player_id: 'omar' }, { team_id: 'B', player_id: 'sami' }, { team_id: 'B', player_id: 'gk' },
  { team_id: 'C', player_id: 'ali' }, { team_id: 'D', player_id: 'omar' }, { team_id: 'D', player_id: 'gk' },
]
const m = (id: string, session_id: string, match_number: number, team1_id: string, team2_id: string, a: number, b: number) =>
  ({ id, session_id, match_number, team1_id, team2_id, waiting_team_id: 'x', status: 'completed', team1_score: a, team2_score: b }) as Match
const matches = [
  m('m1', 's1', 1, 'A', 'B', 4, 0),
  m('m2', 's1', 2, 'A', 'B', 3, 1),
  m('m3', 's2', 1, 'C', 'D', 3, 3),
  m('m4', 's2', 2, 'C', 'D', 1, 0),
]
let n = 0
const ev = (match_id: string, player_id: string, event_type: MatchEvent['event_type'], elapsed_seconds: number | null = null) =>
  ({ id: `e${++n}`, match_id, player_id, event_type, elapsed_seconds }) as MatchEvent
const events = [
  ev('m1', 'ali', 'goal', 200), ev('m1', 'ali', 'goal', 40), ev('m1', 'ali', 'goal'), ev('m1', 'omar', 'goal', 300),
  ev('m1', 'omar', 'assist'), ev('m1', 'omar', 'assist'),
  ev('m2', 'omar', 'goal', 61), ev('m2', 'omar', 'goal'), ev('m2', 'ali', 'goal'), ev('m2', 'sami', 'goal', 25),
  ev('m3', 'ali', 'goal'), ev('m3', 'ali', 'goal'), ev('m3', 'ali', 'goal'), ev('m3', 'omar', 'goal'), ev('m3', 'omar', 'goal'), ev('m3', 'omar', 'goal'),
  ev('m4', 'ali', 'goal'),
]

const league = { players, sessions, teams, teamPlayers, matches, events, awards: [] }
const records = computeRecords(league)
const byId = (id: string) => records.find((r) => r.id === id)!

it('finds the biggest win with its teams, score and date', () => {
  expect(byId('biggest_win')).toMatchObject({
    value: 4,
    holders: [{ kind: 'match', winnerColor: 'green', loserColor: 'blue', winnerScore: 4, loserScore: 0, date: '2026-09-01' }],
  })
})

it('finds the highest-scoring match', () => {
  expect(byId('most_goals_match')).toMatchObject({ value: 6, holders: [{ kind: 'match', date: '2026-09-08' }] })
})

it('finds the fastest goal using only goals with an exact time', () => {
  expect(byId('fastest_goal')).toMatchObject({ value: 25, holders: [{ kind: 'player', playerId: 'sami' }] })
})

it('finds the most goals and contributions in one session, sharing ties', () => {
  expect(byId('session_goals')).toMatchObject({ value: 4, holders: [{ playerId: 'ali', date: '2026-09-01' }, { playerId: 'ali', date: '2026-09-08' }] })
  expect(byId('session_contributions')).toMatchObject({ value: 5, holders: [{ playerId: 'omar', date: '2026-09-01' }] })
})

it('finds the longest winning and unbeaten streaks across sessions', () => {
  // Ali: W W D W → best win streak 2, unbeaten 4
  expect(byId('win_streak')).toMatchObject({ value: 2, holders: [{ playerId: 'ali' }, { playerId: 'omar' }] })
  expect(byId('unbeaten_streak')).toMatchObject({ value: 4, holders: [{ playerId: 'ali' }] })
})

it('counts sessions played', () => {
  expect(byId('most_sessions')).toMatchObject({ value: 2, holders: expect.arrayContaining([{ kind: 'player', playerId: 'ali', name: 'ALI' }]) })
})

it('leaves out records nobody has set yet', () => {
  expect(records.find((r) => r.id === 'session_clean_sheets')).toBeUndefined()
  expect(records.find((r) => r.id === 'best_duo')).toBeUndefined()
})
