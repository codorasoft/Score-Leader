import { availablePeriods, defaultPeriod, periodStats } from './leaderboardPeriod'
import type { Match, MatchEvent, Player, Session, TeamPlayer } from '../lib/types'

const session = (id: string, date: string) => ({ id, date }) as Session

describe('availablePeriods', () => {
  it('lists all time, then each year and each month with sessions, newest first', () => {
    expect(availablePeriods([session('a', '2026-09-27'), session('b', '2026-10-04'), session('c', '2025-12-30'), session('d', '2026-10-11')]))
      .toEqual(['all', '2026', '2026-10', '2026-09', '2025', '2025-12'])
  })
})

describe('defaultPeriod', () => {
  const periods = ['all', '2026', '2026-10', '2026-09']
  it('opens on the current month when it has sessions', () => {
    expect(defaultPeriod(periods, new Date('2026-10-20T12:00:00'))).toBe('2026-10')
  })
  it('falls back to all time otherwise', () => {
    expect(defaultPeriod(periods, new Date('2026-11-02T12:00:00'))).toBe('all')
  })
})

describe('periodStats', () => {
  const players = ['Ali', 'Omar', 'Sami'].map((name) => ({ id: name, name, position: 'MID' }) as Player)
  const sessions = [session('sep', '2026-09-27'), session('oct', '2026-10-04')]
  const matches = [
    { id: 'm-sep', session_id: 'sep', status: 'completed', team1_id: 't1', team2_id: 't2', team1_score: 1, team2_score: 0, is_draw: false, winner_team_id: 't1' },
    { id: 'm-oct', session_id: 'oct', status: 'completed', team1_id: 't3', team2_id: 't4', team1_score: 2, team2_score: 0, is_draw: false, winner_team_id: 't3' },
  ] as Match[]
  const teamPlayers: TeamPlayer[] = [
    { team_id: 't1', player_id: 'Ali' }, { team_id: 't2', player_id: 'Omar' },
    { team_id: 't3', player_id: 'Ali' }, { team_id: 't4', player_id: 'Sami' },
  ]
  const events = [
    { id: '1', match_id: 'm-sep', player_id: 'Ali', event_type: 'goal' },
    { id: '2', match_id: 'm-oct', player_id: 'Ali', event_type: 'goal' },
    { id: '3', match_id: 'm-oct', player_id: 'Ali', event_type: 'goal' },
  ] as MatchEvent[]
  const data = { players, sessions, matches, teamPlayers, events }

  it('counts only the chosen month and lists only players who played in it', () => {
    const { stats, sessionCount, matchCount } = periodStats(data, '2026-10')
    expect(sessionCount).toBe(1)
    expect(matchCount).toBe(1)
    expect(stats.map((s) => [s.player.id, s.goals, s.matchesPlayed, s.matchesWon])).toEqual([
      ['Ali', 2, 1, 1], ['Sami', 0, 1, 0],
    ])
  })

  it('adds up every session for the season and for all time', () => {
    for (const period of ['2026', 'all']) {
      const ali = periodStats(data, period).stats.find((s) => s.player.id === 'Ali')!
      expect([ali.goals, ali.matchesPlayed, ali.matchesWon]).toEqual([3, 2, 2])
    }
  })
})
