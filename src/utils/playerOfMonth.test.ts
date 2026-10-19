import { potmPoints, playersOfMonth, monthsWonBy } from './playerOfMonth'
import type { Match, MatchEvent, Player, Session, SessionAward, TeamPlayer } from '../lib/types'
import type { PeriodStat } from './leaderboardPeriod'

const zero = {
  goals: 0, assists: 0, matchesWon: 0, matchesDrawn: 0, cleanSheets: 0, interceptions: 0, yellowCards: 0, redCards: 0,
  mvpAwards: 0, bestGoalkeeperAwards: 0, fairPlayAwards: 0, bestGoalAwards: 0, bestDefenderAwards: 0,
}
const statOf = (position: Player['position'], o: Partial<PeriodStat>) => ({ ...zero, player: { position }, ...o }) as PeriodStat

it('scores goal 2, assist 2, win 2 and draw 1', () => {
  expect(potmPoints(statOf('ATT', { goals: 2, assists: 1, matchesWon: 3, matchesDrawn: 2 }))).toBe(4 + 2 + 6 + 2)
})

it('gives a clean sheet 2 to a goalkeeper and 1 to a defender, and 1 per interception', () => {
  expect(potmPoints(statOf('GK', { cleanSheets: 2 }))).toBe(4)
  expect(potmPoints(statOf('DEF', { cleanSheets: 2, interceptions: 3 }))).toBe(2 + 3)
})

it('adds award bonuses and takes points away for cards', () => {
  expect(potmPoints(statOf('MID', { mvpAwards: 1, bestGoalkeeperAwards: 1, fairPlayAwards: 1 }))).toBe(9)
  expect(potmPoints(statOf('MID', { bestGoalAwards: 1, bestDefenderAwards: 1 }))).toBe(4)
  expect(potmPoints(statOf('MID', { goals: 1, yellowCards: 1, redCards: 1 }))).toBe(2 - 1 - 3)
})

const players = ['Ali', 'Omar', 'Sami'].map((name) => ({ id: name, name, position: 'MID' }) as Player)
const sessions = [{ id: 'sep', date: '2026-09-27' }, { id: 'oct', date: '2026-10-04' }] as Session[]
const match = (id: string, session_id: string, team1_id: string, team2_id: string, a: number, b: number) =>
  ({ id, session_id, status: 'completed', team1_id, team2_id, team1_score: a, team2_score: b, is_draw: a === b, winner_team_id: a > b ? team1_id : team2_id }) as Match
const teamPlayers: TeamPlayer[] = [
  { team_id: 'A', player_id: 'Ali' }, { team_id: 'B', player_id: 'Omar' }, { team_id: 'C', player_id: 'Sami' },
  { team_id: 'D', player_id: 'Ali' }, { team_id: 'E', player_id: 'Omar' },
]
const goal = (id: string, match_id: string, player_id: string) => ({ id, match_id, player_id, event_type: 'goal' }) as MatchEvent
const assist = (id: string, match_id: string, player_id: string) => ({ id, match_id, player_id, event_type: 'assist' }) as MatchEvent

const data = {
  players, sessions, teamPlayers, awards: [] as SessionAward[],
  matches: [
    match('s1', 'sep', 'A', 'B', 1, 0),
    match('s2', 'sep', 'C', 'B', 0, 1),
    match('o1', 'oct', 'D', 'E', 1, 0),
  ],
  events: [
    goal('1', 's1', 'Ali'), // Ali: 2 + win 2 = 4
    goal('2', 's2', 'Omar'), assist('3', 's2', 'Omar'), // Omar: 2 + 2 + win 2 = 6
    goal('4', 'o1', 'Ali'),
  ],
}

it('crowns the player with the most points in the month', () => {
  const result = playersOfMonth(data, '2026-09')!
  expect(result.winners.map((s) => s.player.id)).toEqual(['Omar'])
  expect(result.points).toBe(6)
})

it('shares the title when players are level on points, goals, assists and wins', () => {
  const tied = { ...data, events: [goal('1', 's1', 'Ali'), goal('2', 's2', 'Omar')] }
  expect(playersOfMonth(tied, '2026-09')!.winners.map((s) => s.player.id)).toEqual(['Ali', 'Omar'])
})

it('returns null for a month where nobody scored points', () => {
  expect(playersOfMonth({ ...data, events: [], matches: [] }, '2026-09')).toBeNull()
})

it('lists only finished months a player won', () => {
  const now = new Date('2026-10-20T12:00:00')
  expect(monthsWonBy(data, 'Omar', now)).toEqual(['2026-09'])
  expect(monthsWonBy(data, 'Ali', now)).toEqual([])
})

it('counts the awards a player won that month', () => {
  const awards = [{ session_id: 'sep', award_type: 'mvp', winner_player_id: 'Ali' }] as SessionAward[]
  const result = playersOfMonth({ ...data, awards }, '2026-09')!
  expect(result.winners.map((s) => s.player.id)).toEqual(['Ali'])
  expect(result.points).toBe(4 + 3)
})
