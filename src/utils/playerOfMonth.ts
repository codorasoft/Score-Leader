import type { Match, MatchEvent, Player, Session, SessionAward, TeamPlayer } from '../lib/types'
import { availablePeriods, periodStats, type PeriodStat } from './leaderboardPeriod'

export interface LeagueData {
  players: Player[]
  sessions: Session[]
  matches: Match[]
  events: MatchEvent[]
  teamPlayers: TeamPlayer[]
  awards: SessionAward[]
}

// The leaderboard's points, also used for Player of the Month. A goalkeeper's clean sheet is worth
// more than a defender's, which is named a clean defence; cards take points away, so a total can go below zero.
export const POTM_POINTS = {
  goal: 2, assist: 2, win: 2, draw: 1,
  cleanSheetGk: 2, cleanSheetDef: 1, interception: 1,
  mvp: 3, bestGoalkeeper: 3, fairPlay: 3, bestGoal: 2, bestDefender: 2,
  yellowCard: -1, redCard: -3,
} as const

export type PointKind = 'goal' | 'assist' | 'win' | 'draw' | 'cleanSheet' | 'cleanDefence' | 'interception'
  | 'mvp' | 'bestGoalkeeper' | 'fairPlay' | 'bestGoal' | 'bestDefender' | 'yellowCard' | 'redCard'

// What a player's points are made of, in a fixed order: each record they have (count above zero)
// and the points it brings. The leaderboard shows it so the total can be checked.
export function pointParts(s: PeriodStat): { kind: PointKind; count: number; points: number }[] {
  const parts: [PointKind, number, number][] = [
    ['goal', s.goals, POTM_POINTS.goal],
    ['assist', s.assists, POTM_POINTS.assist],
    ['win', s.matchesWon, POTM_POINTS.win],
    ['draw', s.matchesDrawn, POTM_POINTS.draw],
    // The same count, named and scored by position: a clean sheet for a keeper, a clean defence for a defender
    ['cleanSheet', s.player.position === 'GK' ? s.cleanSheets : 0, POTM_POINTS.cleanSheetGk],
    ['cleanDefence', s.player.position === 'DEF' ? s.cleanSheets : 0, POTM_POINTS.cleanSheetDef],
    ['interception', s.interceptions, POTM_POINTS.interception],
    ['mvp', s.mvpAwards, POTM_POINTS.mvp],
    ['bestGoalkeeper', s.bestGoalkeeperAwards, POTM_POINTS.bestGoalkeeper],
    ['fairPlay', s.fairPlayAwards, POTM_POINTS.fairPlay],
    ['bestGoal', s.bestGoalAwards, POTM_POINTS.bestGoal],
    ['bestDefender', s.bestDefenderAwards, POTM_POINTS.bestDefender],
    ['yellowCard', s.yellowCards, POTM_POINTS.yellowCard],
    ['redCard', s.redCards, POTM_POINTS.redCard],
  ]
  return parts.filter(([, count]) => count > 0).map(([kind, count, each]) => ({ kind, count, points: count * each }))
}

export const potmPoints = (s: PeriodStat) => pointParts(s).reduce((sum, part) => sum + part.points, 0)

// Points first, then goals, assists and wins; players level on all four share the title.
const rankKey = (s: PeriodStat) => [potmPoints(s), s.goals, s.assists, s.matchesWon]

export function playersOfMonth(data: LeagueData, month: string): { winners: PeriodStat[]; points: number } | null {
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
