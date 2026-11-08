import type { Player, MatchEvent, Match } from '../lib/types'
import type { MatchRosters } from './playerMatches'

export interface PlayerStat {
  player: Player
  goals: number
  assists: number
  yellowCards: number
  redCards: number
  matchesPlayed: number
  matchesWon: number
  matchesDrawn: number
  // Goalkeepers and defenders only
  cleanSheets: number
  interceptions: number
  // Goals put in their own net: they count for the other team, never as the player's goals
  ownGoals: number
  // Goals the player's team let in across those matches (penalty shootouts not counted)
  goalsConceded: number
}

export function computePlayerStats(
  players: Player[],
  events: MatchEvent[],
  matches: Match[],
  rosters: MatchRosters, // who was on which team in each match, after swaps (see matchRosters)
): PlayerStat[] {
  const stats = players.map((player) => ({
    player, goals: 0, assists: 0, yellowCards: 0, redCards: 0, interceptions: 0, ownGoals: 0,
    matchesPlayed: 0, matchesWon: 0, matchesDrawn: 0, cleanSheets: 0, goalsConceded: 0,
  }))
  const byPlayer = new Map(stats.map((row) => [row.player.id, row]))
  for (const event of events) {
    const row = byPlayer.get(event.player_id)
    if (!row) continue
    switch (event.event_type) {
      case 'goal':
      case 'penalty_goal': row.goals++; break
      case 'assist': row.assists++; break
      case 'yellow_card': row.yellowCards++; break
      case 'red_card': row.redCards++; break
      case 'interception': row.interceptions++; break
      case 'own_goal': row.ownGoals++; break
    }
  }

  for (const match of matches) {
    if (match.status !== 'completed') continue
    for (const [id, team] of rosters.get(match.id) ?? []) {
      if (team !== match.team1_id && team !== match.team2_id) continue
      const row = byPlayer.get(id)
      if (!row) continue
      row.matchesPlayed++
      // A draw can still have a winner_team_id to decide who stays on the pitch.
      if (match.is_draw) row.matchesDrawn++
      else if (team === match.winner_team_id) row.matchesWon++
      const conceded = team === match.team1_id ? match.team2_score : match.team1_score
      row.goalsConceded += conceded
      if (conceded === 0 && (row.player.position === 'GK' || row.player.position === 'DEF')) row.cleanSheets++
    }
  }
  return stats
}

export function getAutoAwardWinner(
  stats: PlayerStat[],
  awardType: 'best_goalscorer' | 'best_assister',
): { winner: PlayerStat | null; tied: boolean } {
  const field = awardType === 'best_goalscorer' ? 'goals' : 'assists'
  const sorted = [...stats].sort((a, b) => b[field] - a[field])

  if (sorted.length === 0 || sorted[0][field] === 0) return { winner: null, tied: false }

  const top = sorted[0][field]
  const tied = sorted.filter((s) => s[field] === top).length > 1

  return { winner: sorted[0], tied }
}

// Best goalkeeper: the keeper who let in the fewest goals per match in the session's finished
// matches. Only keepers who played at least half as many matches as the busiest keeper count, so
// one lucky match cannot beat a full session. A tie goes to more clean sheets, then more matches;
// keepers still level share the award.
export function getBestGoalkeepers(stats: PlayerStat[]): PlayerStat[] {
  const played = stats.filter((s) => s.player.position === 'GK' && s.matchesPlayed > 0)
  if (played.length === 0) return []
  const busiest = Math.max(...played.map((s) => s.matchesPlayed))
  const keepers = played.filter((s) => s.matchesPlayed * 2 >= busiest)
  // Goals per match compared without dividing, so equal rates are exactly equal
  const compare = (a: PlayerStat, b: PlayerStat) =>
    a.goalsConceded * b.matchesPlayed - b.goalsConceded * a.matchesPlayed
    || b.cleanSheets - a.cleanSheets
    || b.matchesPlayed - a.matchesPlayed
  const sorted = [...keepers].sort(compare)
  return sorted.filter((s) => compare(s, sorted[0]) === 0)
}
