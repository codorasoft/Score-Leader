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
  // Goals the player's team let in across those matches (penalty shootouts not counted)
  goalsConceded: number
}

export function computePlayerStats(
  players: Player[],
  events: MatchEvent[],
  matches: Match[],
  rosters: MatchRosters, // who was on which team in each match, after swaps (see matchRosters)
): PlayerStat[] {
  return players.map((player) => {
    const pEvents = events.filter((e) => e.player_id === player.id)

    const goals = pEvents.filter((e) => e.event_type === 'goal' || e.event_type === 'penalty_goal').length
    const assists = pEvents.filter((e) => e.event_type === 'assist').length
    const yellowCards = pEvents.filter((e) => e.event_type === 'yellow_card').length
    const redCards = pEvents.filter((e) => e.event_type === 'red_card').length
    const interceptions = pEvents.filter((e) => e.event_type === 'interception').length

    const teamIn = (m: Match) => rosters.get(m.id)?.get(player.id)
    const completedMatches = matches.filter((m) => m.status === 'completed' && (teamIn(m) === m.team1_id || teamIn(m) === m.team2_id))
    const matchesPlayed = completedMatches.length
    // A draw still stores winner_team_id (who keeps the field), so it must not count as a win
    const matchesWon = completedMatches.filter((m) => !m.is_draw && m.winner_team_id === teamIn(m)).length
    const matchesDrawn = completedMatches.filter((m) => m.is_draw).length

    // Clean sheet: a goalkeeper's or defender's team conceded 0 goals in a match
    const keepsSheets = player.position === 'GK' || player.position === 'DEF'
    let cleanSheets = 0
    let goalsConceded = 0
    for (const m of completedMatches) {
      const conceded = teamIn(m) === m.team1_id ? m.team2_score : m.team1_score
      goalsConceded += conceded
      if (keepsSheets && conceded === 0) cleanSheets++
    }

    return { player, goals, assists, yellowCards, redCards, matchesPlayed, matchesWon, matchesDrawn, cleanSheets, interceptions, goalsConceded }
  })
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
