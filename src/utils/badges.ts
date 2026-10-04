import type { SessionHistoryRow } from './playerHistory'

export interface Career {
  goals: number
  assists: number
  wins: number
  sessions: number
  cleanSheets: number
  hatTricks: number
  playmakerSessions: number
  unbeatenSessions: number
  potmMonths: number
  mvpAwards: number
  gkAwards: number
}

export type BadgeGroup = 'scoring' | 'playmaking' | 'winning' | 'awards'

export interface Badge {
  id: string
  group: BadgeGroup
  icon: string
  labelKey: string
  target: number
  value: number
  count?: number
}

interface BadgeDef {
  id: string
  group: BadgeGroup
  icon: string
  labelKey: string
  stat: keyof Career
  target: number
  series: string
  repeatable?: boolean
}

const milestones = (series: keyof Career, group: BadgeGroup, icon: string, targets: number[]): BadgeDef[] =>
  targets.map((target) => ({ id: `${series}_${target}`, group, icon, labelKey: `badges.${series}`, stat: series, target, series }))

const once = (id: string, group: BadgeGroup, icon: string, stat: keyof Career, repeatable = false): BadgeDef =>
  ({ id, group, icon, labelKey: `badges.${id}`, stat, target: 1, series: id, repeatable })

export const BADGES: BadgeDef[] = [
  once('first_goal', 'scoring', '⚽', 'goals'),
  once('hat_trick', 'scoring', '🎩', 'hatTricks', true),
  ...milestones('goals', 'scoring', '🥅', [10, 25, 50, 100]),
  once('first_assist', 'playmaking', '🎯', 'assists'),
  once('playmaker', 'playmaking', '🪄', 'playmakerSessions', true),
  ...milestones('assists', 'playmaking', '🤝', [10, 25, 50]),
  ...milestones('wins', 'winning', '🏆', [10, 50, 100]),
  ...milestones('sessions', 'winning', '📅', [5, 10, 25]),
  once('unbeaten', 'winning', '🛡️', 'unbeatenSessions', true),
  once('potm', 'awards', '👑', 'potmMonths', true),
  once('mvp', 'awards', '⭐', 'mvpAwards', true),
  once('best_gk', 'awards', '🧤', 'gkAwards', true),
  ...milestones('cleanSheets', 'awards', '🧱', [5, 10, 25]),
]

const toBadge = (def: BadgeDef, career: Career): Badge => ({
  id: def.id, group: def.group, icon: def.icon, labelKey: def.labelKey, target: def.target, value: career[def.stat],
  ...(def.repeatable && career[def.stat] >= def.target ? { count: career[def.stat] } : {}),
})

export function computeBadges(career: Career): { earned: Badge[]; next: Badge[] } {
  const earned = BADGES.filter((d) => career[d.stat] >= d.target).map((d) => toBadge(d, career))
  // Next up: the first locked milestone of each series, closest to completion first
  const nextOfSeries = new Map<string, BadgeDef>()
  for (const d of BADGES) if (career[d.stat] < d.target && !nextOfSeries.has(d.series)) nextOfSeries.set(d.series, d)
  const next = [...nextOfSeries.values()]
    .map((d) => toBadge(d, career))
    .sort((a, b) => b.value / b.target - a.value / a.target || (a.target - a.value) - (b.target - b.value))
    .slice(0, 3)
  return { earned, next }
}

const HAT_TRICK = 3
const PLAYMAKER_ASSISTS = 3
const UNBEATEN_MIN_MATCHES = 3

export function careerFromHistory(rows: SessionHistoryRow[], potmMonths: number): Career {
  const played = rows.filter((r) => r.played > 0)
  const sum = (k: 'goals' | 'assists' | 'wins' | 'cleanSheets') => played.reduce((n, r) => n + r[k], 0)
  const awards = rows.flatMap((r) => r.awards)
  return {
    goals: sum('goals'),
    assists: sum('assists'),
    wins: sum('wins'),
    sessions: played.length,
    cleanSheets: sum('cleanSheets'),
    hatTricks: played.filter((r) => r.goals >= HAT_TRICK).length,
    playmakerSessions: played.filter((r) => r.assists >= PLAYMAKER_ASSISTS).length,
    unbeatenSessions: played.filter((r) => r.played >= UNBEATEN_MIN_MATCHES && r.losses === 0).length,
    potmMonths,
    mvpAwards: awards.filter((a) => a === 'mvp').length,
    gkAwards: awards.filter((a) => a === 'best_goalkeeper').length,
  }
}
