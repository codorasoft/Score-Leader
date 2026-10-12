import {
  addDays, dotsFor, draftProblem, draftToRow, emptyDraft, isDone, itemsOn, monthGrid, occursOn, shiftMonth, timeLabel,
  toDraft, weekdayOf, weekdayOrder, weekStartFor, type ScheduleItem,
} from './schedule'

const item = (over: Partial<ScheduleItem> = {}): ScheduleItem => ({
  id: 'i1', kind: 'task', title: 'Book the pitch', item_date: '2026-10-12', start_time: null, end_time: null, note: null,
  repeat_days: [], repeat_until: null, skipped_dates: [], done_dates: [], ...over,
})

describe('days', () => {
  it('knows the weekday of a date whatever the time zone (0 = Sunday)', () => {
    expect(weekdayOf('2026-10-11')).toBe(0)
    expect(weekdayOf('2026-10-12')).toBe(1)
    expect(weekdayOf('2026-10-17')).toBe(6)
  })

  it('adds days across months and years', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('moves a month forwards and backwards across years', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 })
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 })
    expect(shiftMonth({ year: 2026, month: 10 }, -3)).toEqual({ year: 2026, month: 7 })
  })

  it('the week starts on Saturday in Arabic and on Monday otherwise', () => {
    expect(weekStartFor('ar')).toBe(6)
    expect(weekStartFor('ar-JO')).toBe(6)
    expect(weekStartFor('en')).toBe(1)
    expect(weekdayOrder(6)).toEqual([6, 0, 1, 2, 3, 4, 5])
    expect(weekdayOrder(1)).toEqual([1, 2, 3, 4, 5, 6, 0])
  })
})

describe('monthGrid', () => {
  it('fills whole weeks around the month, starting each on Monday', () => {
    // October 2026 starts on a Thursday and ends on a Saturday
    const weeks = monthGrid(2026, 10, 1)
    expect(weeks).toHaveLength(5)
    expect(weeks[0]).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(weeks.at(-1)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'])
    expect(weeks.every((w) => w.length === 7)).toBe(true)
  })

  it('starts each week on Saturday when asked', () => {
    const weeks = monthGrid(2026, 10, 6)
    expect(weeks[0][0]).toBe('2026-09-26')
    expect(weeks[0].at(-1)).toBe('2026-10-02')
    expect(weeks.at(-1)!.at(-1)).toBe('2026-11-06')
  })

  it('has six weeks when the month needs them and four when it fits exactly', () => {
    // August 2026 starts on a Saturday: six Monday-weeks
    expect(monthGrid(2026, 8, 1)).toHaveLength(6)
    // February 2027 starts on a Monday and has 28 days
    expect(monthGrid(2027, 2, 1)).toHaveLength(4)
  })
})

describe('occursOn', () => {
  it('a plain item is on its own day only', () => {
    expect(occursOn(item(), '2026-10-12')).toBe(true)
    expect(occursOn(item(), '2026-10-13')).toBe(false)
    expect(occursOn(item(), '2026-10-19')).toBe(false)
  })

  it('a repeating item is on its weekdays from its first day on', () => {
    // Sundays and Tuesdays from Sunday 11 October
    const training = item({ item_date: '2026-10-11', repeat_days: [0, 2] })
    expect(occursOn(training, '2026-10-11')).toBe(true)
    expect(occursOn(training, '2026-10-13')).toBe(true)
    expect(occursOn(training, '2026-10-12')).toBe(false)
    expect(occursOn(training, '2027-03-07')).toBe(true)
    // Not before it starts
    expect(occursOn(training, '2026-10-06')).toBe(false)
    expect(occursOn(training, '2026-10-04')).toBe(false)
  })

  it('stops after its last day, and that day itself still counts', () => {
    const training = item({ item_date: '2026-10-11', repeat_days: [0, 2], repeat_until: '2026-10-20' })
    expect(occursOn(training, '2026-10-20')).toBe(true)
    expect(occursOn(training, '2026-10-25')).toBe(false)
  })

  it('leaves out the days that were deleted on their own', () => {
    const training = item({ item_date: '2026-10-11', repeat_days: [0, 2], skipped_dates: ['2026-10-13'] })
    expect(occursOn(training, '2026-10-13')).toBe(false)
    expect(occursOn(training, '2026-10-18')).toBe(true)
  })

  it('a repeating item is not on its first day when that weekday is not one of its days', () => {
    // Starts on Monday 12, repeats on Wednesdays
    const wednesdays = item({ item_date: '2026-10-12', repeat_days: [3] })
    expect(occursOn(wednesdays, '2026-10-12')).toBe(false)
    expect(occursOn(wednesdays, '2026-10-14')).toBe(true)
  })
})

describe('a day', () => {
  const morning = item({ id: 'a', title: 'Gym', start_time: '08:00:00' })
  const evening = item({ id: 'b', title: 'Team training', kind: 'training', start_time: '18:00:00', end_time: '19:30:00' })
  const allDay = item({ id: 'c', title: 'Zebra' })
  const allDayToo = item({ id: 'd', title: 'Apple', kind: 'other' })
  const otherDay = item({ id: 'e', item_date: '2026-10-13', kind: 'match' })

  it('lists its items by start time, then the all-day ones by name', () => {
    expect(itemsOn([allDay, evening, otherDay, allDayToo, morning], '2026-10-12').map((i) => i.id)).toEqual(['a', 'b', 'd', 'c'])
  })

  it('shows a time, a time range, or nothing for all day', () => {
    expect(timeLabel(morning)).toBe('08:00')
    expect(timeLabel(evening)).toBe('18:00 – 19:30')
    expect(timeLabel(allDay)).toBeNull()
  })

  it('knows whether an item was ticked on that day', () => {
    const task = item({ repeat_days: [1], done_dates: ['2026-10-12'] })
    expect(isDone(task, '2026-10-12')).toBe(true)
    expect(isDone(task, '2026-10-19')).toBe(false)
  })

  it('has one dot per kind of thing on it, in a fixed order, at most four', () => {
    const extras = { sessions: [{ id: 's1', date: '2026-10-12' }], plans: [{ id: 'p1', training_date: '2026-10-12', title: null }] }
    expect(dotsFor([allDay, evening, allDayToo, morning], extras, '2026-10-12')).toEqual(['session', 'training', 'plan', 'task'])
    expect(dotsFor([otherDay], { sessions: [], plans: [] }, '2026-10-13')).toEqual(['match'])
    expect(dotsFor([otherDay], extras, '2026-10-20')).toEqual([])
  })
})

describe('the item form', () => {
  it('starts as an all-day task on the chosen day that does not repeat', () => {
    expect(emptyDraft('2026-10-12')).toEqual({ kind: 'task', title: '', date: '2026-10-12', start: '', end: '', note: '', repeatDays: [], until: '' })
  })

  it('is filled from an existing item, with times as the form shows them', () => {
    expect(toDraft(item({ kind: 'training', title: 'Team training', item_date: '2026-10-11', start_time: '18:00:00', end_time: '19:30:00', note: 'Bibs', repeat_days: [2, 0], repeat_until: '2026-12-31' })))
      .toEqual({ kind: 'training', title: 'Team training', date: '2026-10-11', start: '18:00', end: '19:30', note: 'Bibs', repeatDays: [0, 2], until: '2026-12-31' })
  })

  it('says what stops it from being saved', () => {
    const ok = { ...emptyDraft('2026-10-12'), title: 'Gym' }
    expect(draftProblem(ok)).toBeNull()
    expect(draftProblem({ ...ok, title: '   ' })).toBe('title')
    expect(draftProblem({ ...ok, date: '' })).toBe('date')
    expect(draftProblem({ ...ok, end: '10:00' })).toBe('times')
    expect(draftProblem({ ...ok, start: '10:00', end: '10:00' })).toBe('times')
    expect(draftProblem({ ...ok, start: '10:00', end: '09:00' })).toBe('times')
    expect(draftProblem({ ...ok, start: '10:00', end: '11:00' })).toBeNull()
    expect(draftProblem({ ...ok, repeatDays: [1], until: '2026-10-11' })).toBe('until')
    expect(draftProblem({ ...ok, repeatDays: [1], until: '2026-10-12' })).toBeNull()
    // An Until left over from before repeating was switched off does not matter
    expect(draftProblem({ ...ok, until: '2026-10-01' })).toBeNull()
  })

  it('becomes a clean row: trimmed, empty things as nothing, weekdays in order', () => {
    expect(draftToRow({ kind: 'training', title: '  Team   training ', date: '2026-10-11', start: '18:00', end: '', note: '  ', repeatDays: [2, 0], until: '2026-12-31' }))
      .toEqual({ kind: 'training', title: 'Team training', item_date: '2026-10-11', start_time: '18:00', end_time: null, note: null, repeat_days: [0, 2], repeat_until: '2026-12-31' })
    // Not repeating: no last day either
    expect(draftToRow({ ...emptyDraft('2026-10-12'), title: 'Gym', note: ' Leg day ', until: '2026-12-31' }))
      .toMatchObject({ repeat_days: [], repeat_until: null, note: 'Leg day', start_time: null })
  })
})
