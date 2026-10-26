import type { Match, MatchEvent, Player, Session, SessionAward, TeamPlayer } from '../lib/types'
import { computePlayerStats, type PlayerStat } from './stats'
import { matchRosters } from './playerMatches'

export const INTERCEPTIONS_PER_POINT = 3

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

// A player's period stats plus the session awards they won in it (a shared award counts for each)
export interface PeriodStat extends PlayerStat {
  // Interceptions score 1 point per 3 in a session; the spare ones do not carry over to the next
  interceptionPoints: number
  mvpAwards: number
  bestGoalkeeperAwards: number
  fairPlayAwards: number
  bestGoalAwards: number
  bestDefenderAwards: number
}

type AwardRow = Pick<SessionAward, 'session_id' | 'award_type' | 'winner_player_id'>

export function periodStats(
  data: { players: Player[]; sessions: Session[]; matches: Match[]; teamPlayers: TeamPlayer[]; events: MatchEvent[]; awards: AwardRow[] },
  period: PeriodKey,
): { stats: PeriodStat[]; sessionCount: number; matchCount: number } {
  const sessionIds = new Set(data.sessions.filter((s) => inPeriod(s.date, period)).map((s) => s.id))
  const matches = data.matches.filter((m) => m.status === 'completed' && sessionIds.has(m.session_id))
  const matchIds = new Set(matches.map((m) => m.id))
  const events = data.events.filter((e) => matchIds.has(e.match_id))

  // From every match and event, not just this period's: undoing swaps needs the whole session
  const rosters = matchRosters(data)

  // Interceptions per player per session
  const sessionOfMatch = new Map(matches.map((m) => [m.id, m.session_id]))
  const intercepted = new Map<string, Map<string, number>>()
  for (const e of events) {
    if (e.event_type !== 'interception') continue
    const perSession = intercepted.get(e.player_id) ?? new Map<string, number>()
    const session = sessionOfMatch.get(e.match_id)!
    perSession.set(session, (perSession.get(session) ?? 0) + 1)
    intercepted.set(e.player_id, perSession)
  }
  const interceptionPoints = (playerId: string) =>
    [...(intercepted.get(playerId)?.values() ?? [])].reduce((sum, n) => sum + Math.floor(n / INTERCEPTIONS_PER_POINT), 0)

  const awards = data.awards.filter((a) => sessionIds.has(a.session_id))
  const won = (playerId: string, type: SessionAward['award_type']) =>
    awards.filter((a) => a.winner_player_id === playerId && a.award_type === type).length

  const stats = computePlayerStats(data.players, events, matches, rosters)
    .filter((s) => s.matchesPlayed > 0)
    .map((s) => ({
      ...s,
      interceptionPoints: interceptionPoints(s.player.id),
      mvpAwards: won(s.player.id, 'mvp'),
      bestGoalkeeperAwards: won(s.player.id, 'best_goalkeeper'),
      fairPlayAwards: won(s.player.id, 'fair_play'),
      bestGoalAwards: won(s.player.id, 'best_goal'),
      bestDefenderAwards: won(s.player.id, 'best_defender'),
    }))
  return { stats, sessionCount: sessionIds.size, matchCount: matches.length }
}
