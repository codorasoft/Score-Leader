import {
  addDays, dotsFor, draftProblem, draftToRow, emptyDraft, gridHours, isDone, itemsOn, layoutDay, monthGrid, occursOn,
  repeatModeOf, shiftMonth, timeLabel, toDraft, weekdayOf, weekdayOrder, weekOf, weekStartFor, withRepeat, type ScheduleItem,
} from './schedule'

const item = (over: Partial<ScheduleItem> = {}): ScheduleItem => ({
  id: 'i1', kind: 'task', title: 'Book the pitch', item_date: '2026-10-12', start_time: null, end_time: null, note: null,
  repeat_days: [], repeat_every: 1, repeat_monthly: false, repeat_until: null, skipped_dates: [], done_dates: [], ...over,
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

describe('repeats every two weeks', () => {
  // Sundays and Tuesdays, every second week, from Sunday 11 October
  const training = item({ item_date: '2026-10-11', repeat_days: [0, 2], repeat_every: 2 })

  it('is on its weekdays in the first week and every second week after it', () => {
    expect(occursOn(training, '2026-10-11')).toBe(true)
    expect(occursOn(training, '2026-10-13')).toBe(true)
    expect(occursOn(training, '2026-10-18')).toBe(false)
    expect(occursOn(training, '2026-10-20')).toBe(false)
    expect(occursOn(training, '2026-10-25')).toBe(true)
    expect(occursOn(training, '2026-10-27')).toBe(true)
    expect(occursOn(training, '2026-11-01')).toBe(false)
    expect(occursOn(training, '2026-11-08')).toBe(true)
  })

  it('counts its weeks from its own first day, whatever day the calendar week starts on', () => {
    // Starts on Tuesday 13: that Tuesday and the Sunday after it are in the same first week
    const fromTuesday = item({ item_date: '2026-10-13', repeat_days: [0, 2], repeat_every: 2 })
    expect(occursOn(fromTuesday, '2026-10-13')).toBe(true)
    expect(occursOn(fromTuesday, '2026-10-18')).toBe(true)
    expect(occursOn(fromTuesday, '2026-10-20')).toBe(false)
    expect(occursOn(fromTuesday, '2026-10-25')).toBe(false)
    expect(occursOn(fromTuesday, '2026-10-27')).toBe(true)
    expect(occursOn(fromTuesday, '2026-11-01')).toBe(true)
  })

  it('still stops at its last day and leaves out deleted days', () => {
    expect(occursOn({ ...training, repeat_until: '2026-10-25' }, '2026-10-27')).toBe(false)
    expect(occursOn({ ...training, skipped_dates: ['2026-10-25'] }, '2026-10-25')).toBe(false)
  })
})

describe('repeats every month', () => {
  it('is on the same day number of every month from its first day on', () => {
    const rent = item({ item_date: '2026-10-12', repeat_monthly: true })
    expect(occursOn(rent, '2026-10-12')).toBe(true)
    expect(occursOn(rent, '2026-11-12')).toBe(true)
    expect(occursOn(rent, '2027-02-12')).toBe(true)
    expect(occursOn(rent, '2026-11-13')).toBe(false)
    expect(occursOn(rent, '2026-09-12')).toBe(false)
  })

  it('skips a month that does not have that day', () => {
    const end = item({ item_date: '2026-10-31', repeat_monthly: true })
    expect(occursOn(end, '2026-11-30')).toBe(false)
    expect(occursOn(end, '2026-12-31')).toBe(true)
    expect(occursOn(end, '2027-02-28')).toBe(false)
  })

  it('stops at its last day and leaves out deleted days', () => {
    const rent = item({ item_date: '2026-10-12', repeat_monthly: true, repeat_until: '2026-12-31', skipped_dates: ['2026-11-12'] })
    expect(occursOn(rent, '2026-11-12')).toBe(false)
    expect(occursOn(rent, '2026-12-12')).toBe(true)
    expect(occursOn(rent, '2027-01-12')).toBe(false)
  })
})

describe('the item form', () => {
  it('starts as an all-day task on the chosen day that does not repeat', () => {
    expect(emptyDraft('2026-10-12')).toEqual({ kind: 'task', title: '', date: '2026-10-12', start: '', end: '', note: '', repeat: 'none', repeatDays: [], until: '' })
  })

  it('is filled from an existing item, with times as the form shows them', () => {
    expect(toDraft(item({ kind: 'training', title: 'Team training', item_date: '2026-10-11', start_time: '18:00:00', end_time: '19:30:00', note: 'Bibs', repeat_days: [2, 0], repeat_until: '2026-12-31' })))
      .toEqual({ kind: 'training', title: 'Team training', date: '2026-10-11', start: '18:00', end: '19:30', note: 'Bibs', repeat: 'weekly', repeatDays: [0, 2], until: '2026-12-31' })
  })

  it('knows how an item repeats', () => {
    expect(repeatModeOf(item())).toBe('none')
    expect(repeatModeOf(item({ repeat_days: [1] }))).toBe('weekly')
    expect(repeatModeOf(item({ repeat_days: [1], repeat_every: 2 }))).toBe('biweekly')
    expect(repeatModeOf(item({ repeat_monthly: true }))).toBe('monthly')
    expect(toDraft(item({ repeat_days: [1], repeat_every: 2 }))).toMatchObject({ repeat: 'biweekly', repeatDays: [1] })
    expect(toDraft(item({ repeat_monthly: true }))).toMatchObject({ repeat: 'monthly', repeatDays: [] })
  })

  it("choosing a weekly repeat starts on the date's own weekday, and keeps weekdays already chosen", () => {
    const monday = { ...emptyDraft('2026-10-12'), title: 'Gym' }
    expect(withRepeat(monday, 'weekly')).toMatchObject({ repeat: 'weekly', repeatDays: [1] })
    expect(withRepeat(monday, 'biweekly')).toMatchObject({ repeat: 'biweekly', repeatDays: [1] })
    expect(withRepeat({ ...monday, repeat: 'weekly', repeatDays: [0, 2] }, 'biweekly')).toMatchObject({ repeat: 'biweekly', repeatDays: [0, 2] })
    expect(withRepeat({ ...monday, repeat: 'weekly', repeatDays: [0, 2] }, 'monthly')).toMatchObject({ repeat: 'monthly' })
    expect(withRepeat({ ...monday, repeat: 'weekly', repeatDays: [0, 2] }, 'none')).toMatchObject({ repeat: 'none' })
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
    // A weekly or two-weekly repeat needs at least one weekday
    expect(draftProblem({ ...ok, repeat: 'weekly' })).toBe('days')
    expect(draftProblem({ ...ok, repeat: 'biweekly' })).toBe('days')
    expect(draftProblem({ ...ok, repeat: 'monthly' })).toBeNull()
    expect(draftProblem({ ...ok, repeat: 'weekly', repeatDays: [1], until: '2026-10-11' })).toBe('until')
    expect(draftProblem({ ...ok, repeat: 'monthly', until: '2026-10-11' })).toBe('until')
    expect(draftProblem({ ...ok, repeat: 'weekly', repeatDays: [1], until: '2026-10-12' })).toBeNull()
    // What is left over from before repeating was switched off does not matter
    expect(draftProblem({ ...ok, repeatDays: [], until: '2026-10-01' })).toBeNull()
  })

  it('becomes a clean row: trimmed, empty things as nothing, weekdays in order', () => {
    expect(draftToRow({ kind: 'training', title: '  Team   training ', date: '2026-10-11', start: '18:00', end: '', note: '  ', repeat: 'weekly', repeatDays: [2, 0], until: '2026-12-31' }))
      .toEqual({
        kind: 'training', title: 'Team training', item_date: '2026-10-11', start_time: '18:00', end_time: null, note: null,
        repeat_days: [0, 2], repeat_every: 1, repeat_monthly: false, repeat_until: '2026-12-31',
      })
  })

  it('becomes a row that repeats the chosen way, and only that way', () => {
    const base = { ...emptyDraft('2026-10-12'), title: 'Gym', note: ' Leg day ', repeatDays: [3, 1], until: '2026-12-31' }
    expect(draftToRow({ ...base, repeat: 'none' })).toMatchObject({ repeat_days: [], repeat_every: 1, repeat_monthly: false, repeat_until: null, note: 'Leg day' })
    expect(draftToRow({ ...base, repeat: 'weekly' })).toMatchObject({ repeat_days: [1, 3], repeat_every: 1, repeat_monthly: false, repeat_until: '2026-12-31' })
    expect(draftToRow({ ...base, repeat: 'biweekly' })).toMatchObject({ repeat_days: [1, 3], repeat_every: 2, repeat_monthly: false, repeat_until: '2026-12-31' })
    expect(draftToRow({ ...base, repeat: 'monthly' })).toMatchObject({ repeat_days: [], repeat_every: 1, repeat_monthly: true, repeat_until: '2026-12-31' })
    expect(draftToRow({ ...base, repeat: 'monthly', until: '' })).toMatchObject({ repeat_until: null })
  })
})

describe('the week and day views', () => {
  it('a week is the seven days from its first weekday that hold the date', () => {
    expect(weekOf('2026-10-14', 1)).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'])
    expect(weekOf('2026-10-14', 6)[0]).toBe('2026-10-10')
    expect(weekOf('2026-10-12', 1)[0]).toBe('2026-10-12')
    expect(weekOf('2026-11-01', 1)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'])
  })

  it('shows 07:00 to 21:00, and more when an item starts earlier or ends later', () => {
    expect(gridHours([])).toEqual({ from: 7, to: 21 })
    expect(gridHours([item({ start_time: '09:00:00', end_time: '10:00:00' })])).toEqual({ from: 7, to: 21 })
    expect(gridHours([item({ start_time: '05:30:00' }), item({ start_time: '20:30:00', end_time: '22:15:00' })])).toEqual({ from: 5, to: 23 })
    // No end time counts as one hour
    expect(gridHours([item({ start_time: '21:00:00' })])).toEqual({ from: 7, to: 22 })
    expect(gridHours([item({ start_time: '23:30:00' })])).toEqual({ from: 7, to: 24 })
    // All-day items take no hours
    expect(gridHours([item()])).toEqual({ from: 7, to: 21 })
  })

  it('places the timed items of a day by their minutes; no end time is one hour', () => {
    const gym = item({ id: 'gym', start_time: '08:00:00' })
    const training = item({ id: 'tr', start_time: '18:00:00', end_time: '19:30:00' })
    expect(layoutDay([training, item({ id: 'allday' }), gym])).toEqual([
      { item: gym, start: 480, end: 540, lane: 0, lanes: 1 },
      { item: training, start: 1080, end: 1170, lane: 0, lanes: 1 },
    ])
  })

  it('puts items that overlap side by side, and lets what follows use the full width again', () => {
    const a = item({ id: 'a', start_time: '09:00:00', end_time: '11:00:00' })
    const b = item({ id: 'b', start_time: '10:00:00', end_time: '12:00:00' })
    const c = item({ id: 'c', start_time: '11:00:00', end_time: '12:00:00' })
    const d = item({ id: 'd', start_time: '14:00:00', end_time: '15:00:00' })
    expect(layoutDay([d, c, b, a]).map((e) => [e.item.id, e.lane, e.lanes])).toEqual([
      ['a', 0, 2], ['b', 1, 2], ['c', 0, 2], ['d', 0, 1],
    ])
  })

  it('an item that runs to midnight ends at the end of the day', () => {
    expect(layoutDay([item({ start_time: '23:30:00' })])[0]).toMatchObject({ start: 1410, end: 1440 })
  })
})
