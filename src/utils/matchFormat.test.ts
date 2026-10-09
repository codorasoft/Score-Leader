import { PRESETS, DEFAULT_FORMAT, presetName, periodsFor, periodLabelKey, periodLength, totalSeconds, periodAfter, nextStep } from './matchFormat'
const m = (o: Partial<Parameters<typeof nextStep>[1]> = {}) => ({ period: 1, period_seconds: [], team1_score: 0, team2_score: 0, timer_status: 'running' as const, status: 'active' as const, ...o })

it('DEFAULT_FORMAT is Quick: 1 × 7 min, limit 2, no extra time, no penalties, stay', () =>
  expect(DEFAULT_FORMAT).toEqual({ period_count: 1, period_minutes: 7, extra_time_minutes: null, penalties: false, goal_limit: 2, draw_rule: 'stay' }))
it('presetName recognises each preset, ignores draw_rule for knockout, else custom', () => {
  expect(presetName(PRESETS.halves)).toBe('halves')
  expect(presetName({ ...PRESETS.knockout, draw_rule: 'draw' })).toBe('knockout')
  expect(presetName({ ...PRESETS.quick, period_minutes: 8 })).toBe('custom')
})
it('periodsFor: quick = [1]; halves = [1,2]; knockout = [1,2,3,4,5] with kinds', () => {
  expect(periodsFor(PRESETS.quick).map(p => p.number)).toEqual([1])
  expect(periodsFor(PRESETS.knockout).map(p => [p.number, p.kind, p.minutes])).toEqual([[1,'regular',10],[2,'regular',10],[3,'extra',5],[4,'extra',5],[5,'penalties',null]])
})
it('periodLabelKey: single period says full match; halves and extra time named', () => {
  expect(periodLabelKey(1, PRESETS.quick)).toBe('match.period.full')
  expect(periodLabelKey(2, PRESETS.halves)).toBe('match.period.second')
  expect(periodLabelKey(4, PRESETS.knockout)).toBe('match.period.extra2')
})
it('periodLength in seconds; null for penalties', () => {
  expect(periodLength(1, PRESETS.quick)).toBe(420); expect(periodLength(3, PRESETS.knockout)).toBe(300); expect(periodLength(5, PRESETS.knockout)).toBeNull()
})
it('totalSeconds sums finished periods and the current clock', () => expect(totalSeconds({ period_seconds: [640, 600] }, 45)).toBe(1285))
describe('periodAfter', () => {
  it('halves: after period 2 nothing follows, level or not', () => { expect(periodAfter(PRESETS.halves, 2, true)).toBeNull(); expect(periodAfter(PRESETS.halves, 2, false)).toBeNull() })
  it('knockout: after period 2 extra time only when level; after ET2 penalties only when level', () => {
    expect(periodAfter(PRESETS.knockout, 2, true)?.number).toBe(3); expect(periodAfter(PRESETS.knockout, 2, false)).toBeNull()
    expect(periodAfter(PRESETS.knockout, 4, true)?.number).toBe(5); expect(periodAfter(PRESETS.knockout, 4, false)).toBeNull()
  })
  it('penalties without extra time follow regular time directly', () =>
    expect(periodAfter({ ...PRESETS.halves, penalties: true }, 2, true)?.number).toBe(5))
})
describe('nextStep', () => {
  it('quick: goal limit ends the match at once', () => expect(nextStep(PRESETS.quick, m({ team1_score: 2 }), 100)).toEqual({ kind: 'endMatch', reason: 'goalLimit' }))
  it('goal limit does not apply in extra time', () =>
    expect(nextStep({ ...PRESETS.knockout, goal_limit: 2 }, m({ period: 3, period_seconds: [600, 600], team1_score: 2 }), 30)).toEqual({ kind: 'endPeriod', period: 3, timeUp: false }))
  it('halves: in play before time → endPeriod not timeUp; after time → timeUp', () => {
    expect(nextStep(PRESETS.halves, m(), 100)).toEqual({ kind: 'endPeriod', period: 1, timeUp: false })
    expect(nextStep(PRESETS.halves, m(), 600)).toEqual({ kind: 'endPeriod', period: 1, timeUp: true })
  })
  it('halves: between periods → startPeriod 2', () =>
    expect(nextStep(PRESETS.halves, m({ period: 1, period_seconds: [612], timer_status: 'stopped' }), 612)).toEqual({ kind: 'startPeriod', period: 2 }))
  it('halves: after period 2, level → draw; leader → endMatch timeUp', () => {
    expect(nextStep(PRESETS.halves, m({ period: 2, period_seconds: [600, 600], timer_status: 'stopped' }), 600)).toEqual({ kind: 'draw' })
    expect(nextStep(PRESETS.halves, m({ period: 2, period_seconds: [600, 600], timer_status: 'stopped', team1_score: 1 }), 600)).toEqual({ kind: 'endMatch', reason: 'timeUp' })
  })
  it('the stay rule never ends level: the final period over with no winner → endMatch timeUp (decideResult settles it)', () => {
    const stopped = m({ period: 2, period_seconds: [600, 600], timer_status: 'stopped' })
    expect(nextStep({ ...PRESETS.halves, draw_rule: 'stay' }, stopped, 600)).toEqual({ kind: 'endMatch', reason: 'timeUp' })
    expect(nextStep(PRESETS.quick, m({ period_seconds: [420], timer_status: 'stopped' }), 420)).toEqual({ kind: 'endMatch', reason: 'timeUp' })
  })
  it('knockout: level after ET2 → penalties; period 5 → penalties', () => {
    expect(nextStep(PRESETS.knockout, m({ period: 4, period_seconds: [600,600,300,300], timer_status: 'stopped' }), 300)).toEqual({ kind: 'penalties' })
    expect(nextStep(PRESETS.knockout, m({ period: 5 }), 0)).toEqual({ kind: 'penalties' })
  })
})
