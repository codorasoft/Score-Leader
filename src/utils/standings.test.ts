import { computeStandings } from './standings'
import type { Match, Team } from '../lib/types'

const teams: Team[] = (['green', 'blue', 'yellow'] as const).map((color) => ({ id: color, session_id: 's', color, name: null }))
let n = 0
const m = (team1_id: string, team2_id: string, team1_score: number, team2_score: number, o: Partial<Match> = {}): Match => {
  const draw = team1_score === team2_score
  return {
    id: `m${++n}`, session_id: 's', match_number: n, team1_id, team2_id, waiting_team_id: 'x',
    status: 'completed', team1_score, team2_score, is_draw: draw,
    winner_team_id: draw ? team2_id : team1_score > team2_score ? team1_id : team2_id,
    draw_resolved_by: draw ? 'late_team' : null,
    timer_started_at: null, timer_elapsed_seconds: 0, timer_status: 'paused', created_at: '', ...o,
  }
}

it('ranks teams by wins and counts wins, draws, losses and goals', () => {
  const rows = computeStandings(teams, [
    m('green', 'blue', 2, 0),
    m('green', 'yellow', 2, 1),
    m('green', 'blue', 1, 1),
    m('blue', 'yellow', 2, 0),
  ])
  expect(rows.map((r) => r.team.color)).toEqual(['green', 'blue', 'yellow'])
  expect(rows[0]).toMatchObject({ rank: 1, played: 3, wins: 2, draws: 1, losses: 0, goalsFor: 5, goalsAgainst: 2 })
  expect(rows[1]).toMatchObject({ rank: 2, played: 3, wins: 1, draws: 1, losses: 1, goalsFor: 3, goalsAgainst: 3 })
  expect(rows[2]).toMatchObject({ rank: 3, played: 2, wins: 0, draws: 0, losses: 2, goalsFor: 1, goalsAgainst: 4 })
})

it('breaks equal wins by goal difference, then goals scored', () => {
  const rows = computeStandings(teams, [
    m('green', 'yellow', 1, 0),
    m('blue', 'yellow', 3, 0),
  ])
  expect(rows.map((r) => r.team.color)).toEqual(['blue', 'green', 'yellow'])
})

it('gives fully tied teams the same rank', () => {
  const rows = computeStandings(teams, [m('green', 'blue', 1, 1)])
  expect(rows.map((r) => r.rank)).toEqual([1, 1, 3])
})

it('ignores matches that are not finished', () => {
  const rows = computeStandings(teams, [m('green', 'blue', 2, 0, { status: 'active' })])
  expect(rows.every((r) => r.played === 0)).toBe(true)
})
