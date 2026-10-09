import { formatMatchClock, eventClockSeconds, canRecordEvents, finishedMatchFields } from './matchClock'

describe('formatMatchClock', () => {
  it('shows minutes and seconds inside regular time', () => {
    expect(formatMatchClock(0)).toBe('00:00')
    expect(formatMatchClock(192)).toBe('03:12')
  })

  it('shows exactly the limit without added time', () => {
    expect(formatMatchClock(420)).toBe('07:00')
  })

  it('shows time beyond the 7 minute limit as added time', () => {
    expect(formatMatchClock(465)).toBe('07:00 +00:45')
    expect(formatMatchClock(545)).toBe('07:00 +02:05')
  })
})

describe('eventClockSeconds', () => {
  it('uses the exact elapsed seconds when recorded', () => {
    expect(eventClockSeconds({ elapsed_seconds: 75, minute: 1 })).toBe(75)
  })

  it('falls back to whole minutes for events logged before seconds were stored', () => {
    expect(eventClockSeconds({ elapsed_seconds: null, minute: 3 })).toBe(180)
  })

  it('returns null when no time was logged (e.g. goals added after the match)', () => {
    expect(eventClockSeconds({ elapsed_seconds: null, minute: null })).toBeNull()
  })
})

describe('canRecordEvents', () => {
  it('is false before kickoff', () => {
    expect(canRecordEvents('pending', 'stopped')).toBe(false)
  })

  it('is true while the clock runs and while it is paused mid-match', () => {
    expect(canRecordEvents('active', 'running')).toBe(true)
    expect(canRecordEvents('active', 'paused')).toBe(true)
  })

  it('is false once the match is completed', () => {
    expect(canRecordEvents('completed', 'paused')).toBe(false)
  })
})

describe('finishedMatchFields', () => {
  it('records the final period length', () =>
    expect(finishedMatchFields({ period_seconds: [600] }, 587)).toEqual({ status: 'completed', timer_status: 'stopped', timer_elapsed_seconds: 587, timer_started_at: null, period_seconds: [600, 587] }))
})
