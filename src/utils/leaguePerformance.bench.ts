import { test } from 'vitest'
import { event, match, player, session } from '../test/fixtures'
import { periodStats } from './leaderboardPeriod'
import { monthsWonBy, type LeagueData } from './playerOfMonth'

// Deterministic weekly bookings with rotating squads. Benchmark the same calculations
// used by the public pages, without network, rendering or fixture setup in the timing.
function makeLeague(bookings: number): LeagueData {
  const players = Array.from({ length: 60 }, (_, i) => player(String(i), `Player ${i}`, 'MID', 3))
  const data: LeagueData = { players, sessions: [], matches: [], teamPlayers: [], events: [], awards: [] }
  for (let week = 0; week < bookings; week++) {
    const id = `s${week}`
    const date = new Date(Date.UTC(2024, 0, 1 + week * 7)).toISOString().slice(0, 10)
    data.sessions.push({ ...session, id, date })
    const squad = Array.from({ length: 15 }, (_, i) => players[(week * 7 + i) % players.length].id)
    const teams = [id + '-a', id + '-b', id + '-c']
    squad.forEach((player_id, i) => data.teamPlayers.push({ league_id: session.league_id, team_id: teams[Math.floor(i / 5)], player_id }))
    for (let round = 0; round < 8; round++) {
      const home = round % 3
      const away = (round + 1) % 3
      const matchId = `${id}-${round}`
      data.matches.push(match(matchId, {
        session_id: id, match_number: round + 1, status: 'completed',
        team1_id: teams[home], team2_id: teams[away], team1_score: 2, team2_score: 1, winner_team_id: teams[home],
      }))
      for (const [goal, side] of [home, away, home].entries()) {
        const scorer = side * 5 + (round + goal) % 5
        const assister = side * 5 + (round + goal + 1) % 5
        data.events.push(event(`${matchId}-g${goal}`, matchId, squad[scorer], teams[side], 'goal'))
        data.events.push(event(`${matchId}-a${goal}`, matchId, squad[assister], teams[side], 'assist'))
      }
    }
  }
  return data
}

for (const bookings of [5, 104]) {
  test(`${bookings} weekly bookings`, { timeout: 60000 }, async ({ bench }) => {
    const league = makeLeague(bookings)
    const now = new Date(2026, 0, 1)
    const standings = await bench('all-time leaderboard stats', () => { periodStats(league, 'all') }).run()
    const titles = await bench('monthly titles on a player profile', () => { monthsWonBy(league, '0', now) }).run()
    for (const result of [standings, titles]) {
      console.info(`${bookings} bookings • ${result.name}: ${result.latency.p50.toFixed(2)} ms median (${result.latency.samplesCount} samples)`)
    }
  })
}
