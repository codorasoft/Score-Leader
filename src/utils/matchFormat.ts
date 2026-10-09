import type { Match, Session } from '../lib/types'

export type MatchFormat = Pick<Session, 'period_count' | 'period_minutes' | 'extra_time_minutes' | 'penalties' | 'goal_limit' | 'draw_rule'>
export type PresetName = 'quick' | 'halves' | 'knockout'

export const PRESETS: Record<PresetName, MatchFormat> = {
  quick: { period_count: 1, period_minutes: 7, extra_time_minutes: null, penalties: false, goal_limit: 2, draw_rule: 'stay' },
  halves: { period_count: 2, period_minutes: 10, extra_time_minutes: null, penalties: false, goal_limit: null, draw_rule: 'draw' },
  knockout: { period_count: 2, period_minutes: 10, extra_time_minutes: 5, penalties: true, goal_limit: null, draw_rule: 'stay' },
}
export const DEFAULT_FORMAT: MatchFormat = PRESETS.quick

export function presetName(f: MatchFormat): PresetName | 'custom' {
  for (const name of Object.keys(PRESETS) as PresetName[]) {
    const p = PRESETS[name]
    if (f.period_count === p.period_count && f.period_minutes === p.period_minutes && f.extra_time_minutes === p.extra_time_minutes
      && f.penalties === p.penalties && f.goal_limit === p.goal_limit && (name === 'knockout' || f.draw_rule === p.draw_rule)) return name
  }
  return 'custom'
}

export interface Period { number: number; kind: 'regular' | 'extra' | 'penalties'; minutes: number | null }

export function periodsFor(f: MatchFormat): Period[] {
  const out: Period[] = []
  for (let n = 1; n <= f.period_count; n++) out.push({ number: n, kind: 'regular', minutes: f.period_minutes })
  if (f.extra_time_minutes) {
    out.push({ number: 3, kind: 'extra', minutes: f.extra_time_minutes })
    out.push({ number: 4, kind: 'extra', minutes: f.extra_time_minutes })
  }
  if (f.penalties) out.push({ number: 5, kind: 'penalties', minutes: null })
  return out
}

export function periodLabelKey(period: number, f: MatchFormat): string {
  if (f.period_count === 1 && period === 1) return 'match.period.full'
  switch (period) {
    case 1: return 'match.period.first'
    case 2: return 'match.period.second'
    case 3: return 'match.period.extra1'
    case 4: return 'match.period.extra2'
    default: return 'match.period.penalties'
  }
}

export function periodLength(period: number, f: MatchFormat): number | null {
  const p = periodsFor(f).find(x => x.number === period)
  return p && p.minutes != null ? p.minutes * 60 : null
}

export function totalSeconds(m: Pick<Match, 'period_seconds'>, currentElapsed: number): number {
  return m.period_seconds.reduce((a, b) => a + b, 0) + currentElapsed
}

// The period to play after `period` just ended, or null when the match is over (or goes to a draw).
export function periodAfter(f: MatchFormat, period: number, level: boolean): Period | null {
  const all = periodsFor(f)
  const find = (n: number) => all.find(p => p.number === n) ?? null
  if (period < f.period_count) return find(period + 1)
  if (period === f.period_count) return level ? (find(3) ?? find(5)) : null
  if (period === 3) return find(4)
  if (period === 4) return level ? find(5) : null
  return null
}

export type Step =
  | { kind: 'play' }
  | { kind: 'endPeriod'; period: number; timeUp: boolean }
  | { kind: 'startPeriod'; period: number }
  | { kind: 'penalties' }
  | { kind: 'endMatch'; reason: 'goalLimit' | 'timeUp' }
  | { kind: 'draw' }

export function nextStep(
  f: MatchFormat,
  m: Pick<Match, 'period' | 'period_seconds' | 'team1_score' | 'team2_score' | 'timer_status' | 'status'>,
  elapsed: number,
): Step {
  if (m.status === 'completed') return { kind: 'play' }
  if (m.period === 5) return { kind: 'penalties' }
  if (f.goal_limit != null && m.period <= f.period_count && Math.max(m.team1_score, m.team2_score) >= f.goal_limit) {
    return { kind: 'endMatch', reason: 'goalLimit' }
  }
  if (m.timer_status === 'stopped' && m.period_seconds.length >= m.period) {
    const level = m.team1_score === m.team2_score
    const next = periodAfter(f, m.period, level)
    if (next) return next.kind === 'penalties' ? { kind: 'penalties' } : { kind: 'startPeriod', period: next.number }
    return level ? { kind: 'draw' } : { kind: 'endMatch', reason: 'timeUp' }
  }
  const len = periodLength(m.period, f)
  return { kind: 'endPeriod', period: m.period, timeUp: len != null && elapsed >= len }
}
