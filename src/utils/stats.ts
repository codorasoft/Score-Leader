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
  playerTeams: Record<string, string[]>, // playerId → the player’s team in each session
): PlayerStat[] {
  return players.map((player) => {
    const pEvents = events.filter((e) => e.player_id === player.id)

    const goals = pEvents.filter((e) => e.event_type === 'goal' || e.event_type === 'penalty_goal').length
    const assists = pEvents.filter((e) => e.event_type === 'assist').length
    const yellowCards = pEvents.filter((e) => e.event_type === 'yellow_card').length
    const redCards = pEvents.filter((e) => e.event_type === 'red_card').length

    const teamIds = new Set(playerTeams[player.id] ?? [])
    const completedMatches = matches.filter(
      (m) => m.status === 'completed' && (teamIds.has(m.team1_id) || teamIds.has(m.team2_id))
    )
    const matchesPlayed = completedMatches.length
    // A draw still stores winner_team_id (who keeps the field), so it must not count as a win
    const matchesWon = completedMatches.filter((m) => !m.is_draw && m.winner_team_id && teamIds.has(m.winner_team_id)).length

    // Clean sheet: GK's team conceded 0 goals in a match
    let cleanSheets = 0
    if (player.position === 'GK') {
      for (const m of completedMatches) {
        const conceded = teamIds.has(m.team1_id) ? m.team2_score : m.team1_score
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
