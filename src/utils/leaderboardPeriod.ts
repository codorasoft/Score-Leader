import type { Match, MatchEvent, Player, Session, TeamPlayer } from '../lib/types'
import { computePlayerStats } from './stats'

// 'all' | season 'YYYY' (calendar year) | month 'YYYY-MM'; session dates are 'YYYY-MM-DD'
export type PeriodKey = string

const inPeriod = (date: string, period: PeriodKey) => period === 'all' || date.startsWith(period)

export function availablePeriods(sessions: Pick<Session, 'date'>[]): PeriodKey[] {
  const months = [...new Set(sessions.map((s) => s.date.slice(0, 7)))].sort().reverse()
  const years = [...new Set(months.map((m) => m.slice(0, 4)))]
  return ['all', ...years.flatMap((y) => [y, ...months.filter((m) => m.startsWith(y))])]
}

export function defaultPeriod(periods: PeriodKey[], now = new Date()): PeriodKey {
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return periods.includes(thisMonth) ? thisMonth : 'all'
}

export function periodStats(
  data: { players: Player[]; sessions: Session[]; matches: Match[]; teamPlayers: TeamPlayer[]; events: MatchEvent[] },
  period: PeriodKey,
) {
  const sessionIds = new Set(data.sessions.filter((s) => inPeriod(s.date, period)).map((s) => s.id))
  const matches = data.matches.filter((m) => m.status === 'completed' && sessionIds.has(m.session_id))
  const matchIds = new Set(matches.map((m) => m.id))
  const events = data.events.filter((e) => matchIds.has(e.match_id))

  const playerTeams: Record<string, string[]> = {}
  for (const tp of data.teamPlayers) (playerTeams[tp.player_id] ??= []).push(tp.team_id)

  const stats = computePlayerStats(data.players, events, matches, playerTeams).filter((s) => s.matchesPlayed > 0)
  return { stats, sessionCount: sessionIds.size, matchCount: matches.length }
}
