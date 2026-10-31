import type { CoachEntry, CoachEvent, MatchType, PlayerPosition } from '../lib/types'

// The coach's own ranking: a Coach Rating out of 100 from training attendance and the 1-10
// ratings the coach gives at trainings and matches. Wins play no part. It is separate from the
// leaderboard's points and the player cards, which do not read any of this.

// What the rating is made of. A part a player has nothing for is left out and the others share its weight.
export const COACH_WEIGHTS = { attendance: 0.2, training: 0.3, match: 0.4, involvement: 0.1 } as const
export type CoachPart = keyof typeof COACH_WEIGHTS

// A friendly tells the coach less than a competitive game; a substitute's rating less than a starter's
export const MATCH_TYPE_WEIGHT: Record<MatchType, number> = { league: 1, official: 1, friendly: 0.6 }
export const ROLE_WEIGHT = { starter: 1, sub: 0.6 } as const

// Late counts as most of a training; an excused absence is not counted either way
export const ATTENDANCE_VALUE = { present: 1, late: 0.75, absent: 0 } as const

// Fewer days than this on record and a player is "not enough data" rather than ranked
export const MIN_DAYS = 3

// The last eight weeks count in full; older days fade, to a quarter at about a year
export const FULL_WEIGHT_DAYS = 56
const FADE_DAYS = 300
const OLDEST_WEIGHT = 0.25

export const MATCH_TYPES: readonly MatchType[] = ['friendly', 'official', 'league']
export const POSITIONS: readonly PlayerPosition[] = ['GK', 'DEF', 'MID', 'ATT']

// all: everything. training: trainings only (attendance and training ratings). A match type:
// only matches of that type (match ratings and involvement).
export type CoachFilter = 'all' | 'training' | MatchType
export const COACH_FILTERS: readonly CoachFilter[] = ['all', 'training', ...MATCH_TYPES]

export interface Average { count: number; avg: number | null }

export interface CoachStat {
  playerId: string
  attendance: { present: number; late: number; excused: number; absent: number; pct: number | null }
  // Plain averages of the coach's 1-10 ratings, for the breakdowns
  training: Average
  match: Average
  byType: Record<MatchType, Average & { apps: number }>
  byRole: { starter: Average & { apps: number }; sub: Average & { apps: number } }
  byPosition: Record<PlayerPosition, Average & { apps: number }>
  // In the squad, came on (started or as a sub), started
  squads: number
  apps: number
  starts: number
  goals: number
  assists: number
  // Trainings with attendance counted, plus matches in the squad
  days: number
  // Each part out of 100, or null when the player has nothing for it
  parts: Record<CoachPart, number | null>
  overall: number | null
}

const daysBetween = (from: string, to: string) => {
  const [a, b] = [from, to].map((d) => { const [y, m, day] = d.split('-').map(Number); return Date.UTC(y, m - 1, day) })
  return Math.round((b - a) / 86_400_000)
}

export function recencyWeight(date: string, today: string): number {
  const age = Math.max(0, daysBetween(date, today))
  if (age <= FULL_WEIGHT_DAYS) return 1
  return Math.max(OLDEST_WEIGHT, 1 - (age - FULL_WEIGHT_DAYS) / FADE_DAYS)
}

// Sums for an average, plain and weighted
class Acc {
  n = 0; sum = 0; wSum = 0; w = 0; apps = 0
  add(rating: number | null, weight = 1) {
    if (rating === null) return
    this.n++; this.sum += rating; this.wSum += rating * weight; this.w += weight
  }
  get plain(): Average { return { count: this.n, avg: this.n ? round1(this.sum / this.n) : null } }
  get weighted(): number | null { return this.w > 0 ? this.wSum / this.w : null }
  withApps() { return { ...this.plain, apps: this.apps } }
}

const round1 = (v: number) => Math.round(v * 10) / 10

function includes(filter: CoachFilter, event: CoachEvent): boolean {
  if (filter === 'all') return true
  if (filter === 'training') return event.kind === 'training'
  return event.kind === 'match' && event.match_type === filter
}

export interface CoachOptions {
  filter?: CoachFilter
  // Only days on or after this date (yyyy-mm-dd)
  since?: string | null
  // For recency; yyyy-mm-dd
  today: string
}

// Every player with anything on record in the chosen days, keyed by player id
export function coachStats(events: CoachEvent[], entries: CoachEntry[], options: CoachOptions): Map<string, CoachStat> {
  const { filter = 'all', since = null, today } = options
  const byId = new Map(events.filter((e) => includes(filter, e) && (!since || e.event_date >= since)).map((e) => [e.id, e]))

  interface Work {
    present: number; late: number; excused: number; absent: number; attW: number; attSum: number
    training: Acc; match: Acc; types: Record<MatchType, Acc>; starter: Acc; sub: Acc; positions: Record<PlayerPosition, Acc>
    squads: number; goals: number; assists: number
  }
  const work = new Map<string, Work>()
  const of = (id: string): Work => {
    let w = work.get(id)
    if (!w) {
      w = {
        present: 0, late: 0, excused: 0, absent: 0, attW: 0, attSum: 0,
        training: new Acc(), match: new Acc(),
        types: { friendly: new Acc(), official: new Acc(), league: new Acc() },
        starter: new Acc(), sub: new Acc(),
        positions: { GK: new Acc(), DEF: new Acc(), MID: new Acc(), ATT: new Acc() },
        squads: 0, goals: 0, assists: 0,
      }
      work.set(id, w)
    }
    return w
  }

  for (const entry of entries) {
    const event = byId.get(entry.event_id)
    if (!event) continue
    const w = of(entry.player_id)
    const recent = recencyWeight(event.event_date, today)

    if (event.kind === 'training') {
      w[entry.attendance]++
      if (entry.attendance !== 'excused') {
        w.attW += recent
        w.attSum += ATTENDANCE_VALUE[entry.attendance] * recent
      }
      if (entry.attendance === 'present' || entry.attendance === 'late') w.training.add(entry.rating, recent)
      continue
    }

    // A match: the row means the player was in the squad
    w.squads++
    const role = entry.role ?? 'starter'
    if (role === 'unused') continue
    w.goals += entry.goals
    w.assists += entry.assists
    const type = event.match_type ?? 'friendly'
    const acc = role === 'starter' ? w.starter : w.sub
    acc.apps++
    w.types[type].apps++
    w.match.add(entry.rating, MATCH_TYPE_WEIGHT[type] * ROLE_WEIGHT[role] * recent)
    w.types[type].add(entry.rating)
    acc.add(entry.rating)
    if (entry.position) {
      w.positions[entry.position].apps++
      w.positions[entry.position].add(entry.rating)
    }
  }

  const stats = new Map<string, CoachStat>()
  for (const [playerId, w] of work) {
    const counted = w.present + w.late + w.absent
    const apps = w.starter.apps + w.sub.apps
    const trainingAvg = w.training.weighted
    const matchAvg = w.match.weighted
    const parts: Record<CoachPart, number | null> = {
      attendance: w.attW > 0 ? Math.round((w.attSum / w.attW) * 100) : null,
      training: trainingAvg === null ? null : Math.round(trainingAvg * 10),
      match: matchAvg === null ? null : Math.round(matchAvg * 10),
      // Trusted to start, and goals and assists per game (one a game is the most it gives)
      involvement: w.squads === 0 ? null : Math.round(
        100 * (0.7 * (w.starter.apps / w.squads) + 0.3 * Math.min(1, apps ? (w.goals + w.assists) / apps : 0)),
      ),
    }
    const days = counted + w.squads
    stats.set(playerId, {
      playerId,
      attendance: { present: w.present, late: w.late, excused: w.excused, absent: w.absent, pct: parts.attendance },
      training: w.training.plain,
      match: w.match.plain,
      byType: { friendly: w.types.friendly.withApps(), official: w.types.official.withApps(), league: w.types.league.withApps() },
      byRole: { starter: w.starter.withApps(), sub: w.sub.withApps() },
      byPosition: { GK: w.positions.GK.withApps(), DEF: w.positions.DEF.withApps(), MID: w.positions.MID.withApps(), ATT: w.positions.ATT.withApps() },
      squads: w.squads,
      apps,
      starts: w.starter.apps,
      goals: w.goals,
      assists: w.assists,
      days,
      parts,
      overall: days >= MIN_DAYS ? overallOf(parts) : null,
    })
  }
  return stats
}

// The parts a player has, each by its weight, shared out again over those parts
export function overallOf(parts: Record<CoachPart, number | null>): number | null {
  let sum = 0
  let weight = 0
  for (const key of Object.keys(COACH_WEIGHTS) as CoachPart[]) {
    const value = parts[key]
    if (value === null) continue
    sum += value * COACH_WEIGHTS[key]
    weight += COACH_WEIGHTS[key]
  }
  return weight > 0 ? Math.round(sum / weight) : null
}

// Highest Coach Rating first; then more days on record, then name. Not enough data goes last.
export function rankCoach<T extends { name: string; stat: CoachStat }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const [x, y] = [a.stat.overall, b.stat.overall]
    if (x === null && y !== null) return 1
    if (y === null && x !== null) return -1
    return (y ?? 0) - (x ?? 0) || b.stat.days - a.stat.days || a.name.localeCompare(b.name)
  })
}

// The position a player stood in on a coach board, from how far up the pitch they were.
// The board has our goal at the bottom (y = 1), as the formation layouts place the keeper.
export function positionFromSpot(y: number): PlayerPosition {
  if (y >= 0.84) return 'GK'
  if (y >= 0.6) return 'DEF'
  if (y >= 0.36) return 'MID'
  return 'ATT'
}

// The first day of the period to show, or null for all time
export type CoachPeriod = 'all' | '30' | '90'
export function periodStart(period: CoachPeriod, today: string): string | null {
  if (period === 'all') return null
  const [y, m, d] = today.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, d - Number(period)))
  return start.toISOString().slice(0, 10)
}
