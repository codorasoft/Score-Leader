import { dayLabel, groupByDay, localToday } from './trainingDays'

// Half past midnight and a minute before it: one of the two is on another UTC date in every
// time zone but UTC itself, so reading the date from UTC fails here
it("today is the device's local date, also around midnight", () => {
  expect(localToday(new Date(2026, 9, 13, 0, 30))).toBe('2026-10-13')
  expect(localToday(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
})

const on = (...dates: string[]) => dates.map((training_date, i) => ({ id: `x${i}`, training_date }))

it('splits trainings into today, upcoming (nearest first) and past (latest first)', () => {
  const groups = groupByDay(on('2026-10-20', '2026-10-10', '2026-10-12', '2026-10-14', '2026-10-12', '2026-09-30'), '2026-10-12')
  expect(groups.today.map((t) => t.id)).toEqual(['x2', 'x4'])
  expect(groups.upcoming.map((t) => t.training_date)).toEqual(['2026-10-14', '2026-10-20'])
  expect(groups.past.map((t) => t.training_date)).toEqual(['2026-10-10', '2026-09-30'])
})

it('a group with nothing in it is empty', () => {
  expect(groupByDay(on('2026-10-10'), '2026-10-12')).toEqual({ today: [], upcoming: [], past: [{ id: 'x0', training_date: '2026-10-10' }] })
})

it('labels a day in words, on that day whatever the time zone', () => {
  const label = dayLabel('2026-10-12', 'en')
  expect(label).toContain('12')
  expect(label).toContain('Oct')
  expect(label).toContain('Mon')
  expect(label).toContain('2026')
})
