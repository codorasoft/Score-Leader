import type { Match, Team } from '../lib/types'

export interface StandingRow {
  team: Team
  rank: number
  played: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
}

// A win means outscoring the other team; level scores count as draws (same as player stats),
// even when the draw rule or a shootout decided who stayed on.
export function computeStandings(teams: Team[], matches: Match[]): StandingRow[] {
  const rows = teams.map((team) => {
    const row = { team, rank: 0, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 }
    for (const m of matches) {
      if (m.status !== 'completed' || (m.team1_id !== team.id && m.team2_id !== team.id)) continue
      const isTeam1 = m.team1_id === team.id
      const scored = isTeam1 ? m.team1_score : m.team2_score
      const conceded = isTeam1 ? m.team2_score : m.team1_score
      row.played++
      row.goalsFor += scored
      row.goalsAgainst += conceded
      if (scored > conceded) row.wins++
      else if (scored === conceded) row.draws++
      else row.losses++
    }
    return row
  })

  const key = (r: StandingRow) => [r.wins, r.goalsFor - r.goalsAgainst, r.goalsFor]
  const compare = (a: StandingRow, b: StandingRow) => {
    const [ka, kb] = [key(a), key(b)]
    return kb[0] - ka[0] || kb[1] - ka[1] || kb[2] - ka[2]
  }
  rows.sort(compare)
  rows.forEach((r, i) => { r.rank = i > 0 && compare(rows[i - 1], r) === 0 ? rows[i - 1].rank : i + 1 })
  return rows
}
