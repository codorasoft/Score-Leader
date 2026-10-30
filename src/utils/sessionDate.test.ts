import { sessionDate } from './sessionDate'

const today = new Date('2026-10-30T12:00:00')

it('reads as a weekday, day and month in this year', () => {
  expect(sessionDate('2026-10-30', 'en', today)).toBe('Fri 30 Oct')
})

it('adds the year for another year', () => {
  expect(sessionDate('2025-12-14', 'en', today)).toBe('Sun 14 Dec 2025')
})

it('is written in Arabic for Arabic', () => {
  expect(sessionDate('2026-10-30', 'ar', today)).toMatch(/أكتوبر/)
})

it('leaves a date it cannot read as it is', () => {
  expect(sessionDate('', 'en', today)).toBe('')
})
