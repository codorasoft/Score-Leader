import type { Match, MatchEvent, Player, Session, TeamPlayer } from '../lib/types'
import type { PlayerStat } from './stats'
import { availablePeriods, periodStats } from './leaderboardPeriod'

export interface LeagueData {
  players: Player[]
  sessions: Session[]
  matches: Match[]
  events: MatchEvent[]
  teamPlayers: TeamPlayer[]
}

export const POTM_POINTS = { goal: 3, assist: 2, win: 1, cleanSheet: 2 } as const

export const potmPoints = (s: PlayerStat) =>
  s.goals * POTM_POINTS.goal + s.assists * POTM_POINTS.assist + s.matchesWon * POTM_POINTS.win + s.cleanSheets * POTM_POINTS.cleanSheet

// Points first, then goals, assists and wins; players level on all four share the title.
const rankKey = (s: PlayerStat) => [potmPoints(s), s.goals, s.assists, s.matchesWon]

export function playersOfMonth(data: LeagueData, month: string): { winners: PlayerStat[]; points: number } | null {
  const ranked = periodStats(data, month).stats
    .filter((s) => potmPoints(s) > 0)
    .sort((a, b) => {
      const [ka, kb] = [rankKey(a), rankKey(b)]
      return kb[0] - ka[0] || kb[1] - ka[1] || kb[2] - ka[2] || kb[3] - ka[3]
    })
  if (ranked.length === 0) return null
  const best = rankKey(ranked[0]).join()
  return { winners: ranked.filter((s) => rankKey(s).join() === best), points: potmPoints(ranked[0]) }
}

export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

// Only finished months count as a title; the current month is still "leading".
export function monthsWonBy(data: LeagueData, playerId: string, now = new Date()): string[] {
  const current = monthKey(now)
  return availablePeriods(data.sessions)
    .filter((p) => p.length === 7 && p < current)
    .filter((month) => playersOfMonth(data, month)?.winners.some((s) => s.player.id === playerId))
    .sort()
}
