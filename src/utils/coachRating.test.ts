import type { CoachEntry, CoachEvent } from '../lib/types'
import { coachStats, overallOf, periodStart, positionFromSpot, rankCoach, recencyWeight } from './coachRating'

const TODAY = '2026-10-31'

const training = (id: string, event_date = '2026-10-20'): CoachEvent => ({
  id, league_id: 'L1', kind: 'training', event_date, title: null, match_type: null, our_score: null, their_score: null, lineup_id: null,
})
const game = (id: string, match_type: CoachEvent['match_type'], event_date = '2026-10-25'): CoachEvent => ({
  id, league_id: 'L1', kind: 'match', event_date, title: 'Rivals', match_type, our_score: 1, their_score: 0, lineup_id: null,
})
const entry = (event_id: string, player_id: string, extra: Partial<CoachEntry> = {}): CoachEntry => ({
  event_id, player_id, attendance: 'present', role: null, position: null, rating: null, goals: 0, assists: 0, ...extra,
})

describe('recencyWeight', () => {
  it('counts the last eight weeks in full and fades older days to a quarter', () => {
    expect(recencyWeight('2026-10-31', TODAY)).toBe(1)
    expect(recencyWeight('2026-09-05', TODAY)).toBe(1) // 56 days
    expect(recencyWeight('2026-06-01', TODAY)).toBeCloseTo(1 - (152 - 56) / 300)
    expect(recencyWeight('2024-01-01', TODAY)).toBe(0.25)
  })
})

describe('coachStats', () => {
  it('counts attendance: late is three quarters, excused is not counted', () => {
    const events = [training('t1'), training('t2'), training('t3'), training('t4')]
    const entries = [
      entry('t1', 'p1'), entry('t2', 'p1', { attendance: 'late' }),
      entry('t3', 'p1', { attendance: 'absent' }), entry('t4', 'p1', { attendance: 'excused' }),
    ]
    const s = coachStats(events, entries, { today: TODAY }).get('p1')!
    expect(s.attendance).toEqual({ present: 1, late: 1, excused: 1, absent: 1, pct: Math.round((1.75 / 3) * 100) })
    expect(s.days).toBe(3)
    // Only attendance on record: the rating is the attendance
    expect(s.overall).toBe(58)
  })

  it('averages training ratings only for players who were there', () => {
    const events = [training('t1'), training('t2'), training('t3')]
    const entries = [
      entry('t1', 'p1', { rating: 8 }), entry('t2', 'p1', { rating: 6 }),
      entry('t3', 'p1', { attendance: 'absent', rating: 10 }),
    ]
    const s = coachStats(events, entries, { today: TODAY }).get('p1')!
    expect(s.training).toEqual({ count: 2, avg: 7 })
    expect(s.parts.training).toBe(70)
  })

  it('weighs a friendly and a sub appearance less in the match part, and splits by type, role and position', () => {
    const events = [game('m1', 'league'), game('m2', 'friendly'), game('m3', 'official')]
    const entries = [
      entry('m1', 'p1', { role: 'starter', position: 'MID', rating: 8, goals: 1 }),
      entry('m2', 'p1', { role: 'sub', position: 'DEF', rating: 4 }),
      entry('m3', 'p1', { role: 'unused' }),
    ]
    const s = coachStats(events, entries, { today: TODAY }).get('p1')!
    expect(s.match).toEqual({ count: 2, avg: 6 })
    // (8 * 1 + 4 * 0.6 * 0.6) / (1 + 0.36)
    expect(s.parts.match).toBe(Math.round(((8 + 4 * 0.36) / 1.36) * 10))
    expect(s.byType.league).toEqual({ count: 1, avg: 8, apps: 1 })
    expect(s.byType.friendly).toEqual({ count: 1, avg: 4, apps: 1 })
    expect(s.byType.official).toEqual({ count: 0, avg: null, apps: 0 })
    expect(s.byRole.starter).toEqual({ count: 1, avg: 8, apps: 1 })
    expect(s.byRole.sub).toEqual({ count: 1, avg: 4, apps: 1 })
    expect(s.byPosition.MID).toEqual({ count: 1, avg: 8, apps: 1 })
    expect(s.byPosition.DEF).toEqual({ count: 1, avg: 4, apps: 1 })
    expect([s.squads, s.apps, s.starts, s.goals]).toEqual([3, 2, 1, 1])
    // Started 1 of 3 squads; 1 goal in 2 games
    expect(s.parts.involvement).toBe(Math.round(100 * (0.7 / 3 + 0.3 * 0.5)))
  })

  it('needs three days on record before giving a rating', () => {
    const events = [training('t1'), game('m1', 'league')]
    const entries = [entry('t1', 'p1', { rating: 9 }), entry('m1', 'p1', { role: 'starter', rating: 9 })]
    const s = coachStats(events, entries, { today: TODAY }).get('p1')!
    expect(s.days).toBe(2)
    expect(s.overall).toBeNull()
  })

  it('filters by kind, match type and period', () => {
    const events = [training('t1', '2026-10-30'), game('m1', 'league', '2026-10-29'), game('m2', 'friendly', '2026-07-01')]
    const entries = [
      entry('t1', 'p1', { rating: 5 }),
      entry('m1', 'p1', { role: 'starter', rating: 9 }),
      entry('m2', 'p1', { role: 'starter', rating: 3 }),
    ]
    const trainingOnly = coachStats(events, entries, { today: TODAY, filter: 'training' }).get('p1')!
    expect([trainingOnly.training.count, trainingOnly.match.count]).toEqual([1, 0])
    const league = coachStats(events, entries, { today: TODAY, filter: 'league' }).get('p1')!
    expect([league.training.count, league.match.avg]).toEqual([0, 9])
    const recent = coachStats(events, entries, { today: TODAY, since: '2026-10-01' }).get('p1')!
    expect(recent.match).toEqual({ count: 1, avg: 9 })
  })

  it('gives the full weighted rating from all four parts', () => {
    const events = [training('t1'), training('t2'), game('m1', 'league')]
    const entries = [
      entry('t1', 'p1', { rating: 7 }), entry('t2', 'p1', { attendance: 'absent' }),
      entry('m1', 'p1', { role: 'starter', rating: 8, goals: 2 }),
    ]
    const s = coachStats(events, entries, { today: TODAY }).get('p1')!
    expect(s.parts).toEqual({ attendance: 50, training: 70, match: 80, involvement: 100 })
    expect(s.overall).toBe(Math.round(50 * 0.2 + 70 * 0.3 + 80 * 0.4 + 100 * 0.1))
  })
})

describe('overallOf', () => {
  it('shares the weight of a missing part among the others', () => {
    expect(overallOf({ attendance: 100, training: 50, match: null, involvement: null })).toBe(Math.round((100 * 0.2 + 50 * 0.3) / 0.5))
    expect(overallOf({ attendance: null, training: null, match: null, involvement: null })).toBeNull()
  })
})

describe('rankCoach', () => {
  const row = (name: string, overall: number | null, days = 3) => ({ name, stat: { overall, days } as never })
  it('puts the highest rating first, then more days, then name, and players without a rating last', () => {
    const ranked = rankCoach([row('Zed', null), row('Bo', 70, 3), row('Al', 70, 3), row('Cy', 70, 5), row('Di', 90)])
    expect(ranked.map((r) => r.name)).toEqual(['Di', 'Cy', 'Al', 'Bo', 'Zed'])
  })
})

describe('positionFromSpot', () => {
  it('reads the position from how far up the board a player stands', () => {
    expect([0.92, 0.7, 0.5, 0.2].map(positionFromSpot)).toEqual(['GK', 'DEF', 'MID', 'ATT'])
  })
})

describe('periodStart', () => {
  it('goes back the number of days, or nowhere for all time', () => {
    expect(periodStart('30', '2026-10-31')).toBe('2026-10-01')
    expect(periodStart('90', '2026-03-01')).toBe('2025-12-01')
    expect(periodStart('all', TODAY)).toBeNull()
  })
})
