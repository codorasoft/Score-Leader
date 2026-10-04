import type { LeagueData } from './playerOfMonth'

const ASSIST_WEIGHT = 0.7

export const DEFAULT_FORM_SESSIONS = 5

// Form on the same 0–5 scale as stars: half win rate, half goal involvement per match
// (goals + 0.7 × assists, capped at 1 per match), over the player's most recent sessions.
export function formRatings(data: Pick<LeagueData, 'sessions' | 'matches' | 'events' | 'teamPlayers'>, lastSessions = DEFAULT_FORM_SESSIONS) {
  const sessionDate = new Map(data.sessions.map((s) => [s.id, s.date]))
  const completed = data.matches.filter((m) => m.status === 'completed')
  const teamsOf = new Map<string, Set<string>>()
  for (const tp of data.teamPlayers) {
    if (!teamsOf.has(tp.player_id)) teamsOf.set(tp.player_id, new Set())
    teamsOf.get(tp.player_id)!.add(tp.team_id)
  }

  const ratings = new Map<string, number>()
  for (const [playerId, teams] of teamsOf) {
    const played = completed.filter((m) => teams.has(m.team1_id) || teams.has(m.team2_id))
    const recentSessions = new Set(
      [...new Set(played.map((m) => m.session_id))]
        .sort((a, b) => (sessionDate.get(b) ?? '').localeCompare(sessionDate.get(a) ?? ''))
        .slice(0, lastSessions),
    )
    const matches = played.filter((m) => recentSessions.has(m.session_id))
    if (matches.length === 0) continue

    const matchIds = new Set(matches.map((m) => m.id))
    const wins = matches.filter((m) => {
      const mine = teams.has(m.team1_id) ? m.team1_score : m.team2_score
      const theirs = teams.has(m.team1_id) ? m.team2_score : m.team1_score
      return mine > theirs
    }).length
    let involvement = 0
    for (const e of data.events) {
      if (e.player_id !== playerId || !matchIds.has(e.match_id)) continue
      if (e.event_type === 'goal' || e.event_type === 'penalty_goal') involvement += 1
      else if (e.event_type === 'assist') involvement += ASSIST_WEIGHT
    }
    const winRate = wins / matches.length
    const perMatch = Math.min(involvement / matches.length, 1)
    ratings.set(playerId, 5 * (0.5 * winRate + 0.5 * perMatch))
  }
  return ratings
}

export const blendStrength = (stars: number, form: number | undefined, formWeight: number) =>
  form === undefined ? stars : (1 - formWeight) * stars + formWeight * form
