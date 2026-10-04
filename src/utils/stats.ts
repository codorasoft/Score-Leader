import type { Player, MatchEvent, Match } from '../lib/types'

export interface PlayerStat {
  player: Player
  goals: number
  assists: number
  yellowCards: number
  redCards: number
  matchesPlayed: number
  matchesWon: number
  cleanSheets: number
}

export function computePlayerStats(
  players: Player[],
  events: MatchEvent[],
  matches: Match[],
  teamPlayerMap: Record<string, string>, // playerId → teamId
): PlayerStat[] {
  return players.map((player) => {
    const pEvents = events.filter((e) => e.player_id === player.id)

    const goals = pEvents.filter((e) => e.event_type === 'goal' || e.event_type === 'penalty_goal').length
    const assists = pEvents.filter((e) => e.event_type === 'assist').length
    const yellowCards = pEvents.filter((e) => e.event_type === 'yellow_card').length
    const redCards = pEvents.filter((e) => e.event_type === 'red_card').length

    const playerTeamId = teamPlayerMap[player.id]
    const completedMatches = matches.filter(
      (m) => m.status === 'completed' && (m.team1_id === playerTeamId || m.team2_id === playerTeamId)
    )
    const matchesPlayed = completedMatches.length
    const matchesWon = completedMatches.filter((m) => m.winner_team_id === playerTeamId).length

    // Clean sheet: GK's team conceded 0 goals in a match
    let cleanSheets = 0
    if (player.position === 'GK') {
      for (const m of completedMatches) {
        const conceded = m.team1_id === playerTeamId ? m.team2_score : m.team1_score
        if (conceded === 0) cleanSheets++
      }
    }

    return { player, goals, assists, yellowCards, redCards, matchesPlayed, matchesWon, cleanSheets }
  })
}

export function getAutoAwardWinner(
  stats: PlayerStat[],
  awardType: 'best_goalscorer' | 'best_assister' | 'best_goalkeeper',
): { winner: PlayerStat | null; tied: boolean } {
  let filtered = stats

  if (awardType === 'best_goalkeeper') {
    filtered = stats.filter((s) => s.player.position === 'GK')
  }

  const field = awardType === 'best_goalscorer' ? 'goals' : awardType === 'best_assister' ? 'assists' : 'cleanSheets'

  const sorted = [...filtered].sort((a, b) => (b[field] as number) - (a[field] as number))

  if (sorted.length === 0 || (sorted[0][field] as number) === 0) return { winner: null, tied: false }

  const top = sorted[0][field] as number
  const tied = sorted.filter((s) => (s[field] as number) === top).length > 1

  return { winner: sorted[0], tied }
}
