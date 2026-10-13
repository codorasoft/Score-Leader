// The coach's schedule: which items are on which day, and the rows of one day.
// Shared by the app (src/utils/schedule.ts re-exports all of it) and by the server function
// that sends the morning notification, which runs in Deno: this file imports nothing.
// A day is a plain date ('2026-10-12') with no time zone; all the arithmetic is done in UTC so
// it gives the same answer on every device. Weekdays are 0 (Sunday) .. 6 (Saturday).

export type ScheduleKind = 'task' | 'training' | 'match' | 'other'

export interface ScheduleItem {
  id: string
  kind: ScheduleKind
  title: string
  // The day; for a repeating item, the first day of its series
  item_date: string
  // 'HH:MM:SS' from the database; no start means all day
  start_time: string | null
  end_time: string | null
  note: string | null
  // Weekdays it repeats on; empty = no weekly repeat
  repeat_days: number[]
  // Every how many weeks those weekdays come round, counted in blocks of seven days from item_date
  repeat_every: number
  // Every month on item_date's day number; a month without that day is skipped
  repeat_monthly: boolean
  // Last day of the series, inclusive
  repeat_until: string | null
  // Days of the series that were deleted on their own
  skipped_dates: string[]
  // Days on which it was ticked as done
  done_dates: string[]
}

// Things the app already has a date for: shown on the calendar, changed on their own pages
export interface ScheduleExtras {
  sessions: { id: string; date: string }[]
  plans: { id: string; training_date: string; title: string | null }[]
}

// ===== Days

const toUtc = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const DAY_MS = 86_400_000
const daysBetween = (from: string, to: string) => Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / DAY_MS)

export const weekdayOf = (date: string): number => toUtc(date).getUTCDay()

// ===== Items on a day

export type RepeatMode = 'none' | 'weekly' | 'biweekly' | 'monthly'

export function repeatModeOf(item: Pick<ScheduleItem, 'repeat_days' | 'repeat_every' | 'repeat_monthly'>): RepeatMode {
  if (item.repeat_monthly) return 'monthly'
  if (item.repeat_days.length === 0) return 'none'
  return item.repeat_every > 1 ? 'biweekly' : 'weekly'
}

export function occursOn(item: ScheduleItem, date: string): boolean {
  const mode = repeatModeOf(item)
  if (mode === 'none') return item.item_date === date
  if (date < item.item_date) return false
  if (item.repeat_until && date > item.repeat_until) return false
  if (item.skipped_dates.includes(date)) return false
  if (mode === 'monthly') return date.slice(8) === item.item_date.slice(8)
  // Weeks are blocks of seven days from the item's own first day, so the answer does not
  // depend on which day a calendar week starts on
  const week = Math.floor(daysBetween(item.item_date, date) / 7)
  return week % Math.max(1, item.repeat_every) === 0 && item.repeat_days.includes(weekdayOf(date))
}

// A day's items: the timed ones by start time, then the all-day ones by name
export function itemsOn(items: ScheduleItem[], date: string): ScheduleItem[] {
  return items.filter((i) => occursOn(i, date)).sort((a, b) => {
    if (a.start_time && b.start_time) return a.start_time.localeCompare(b.start_time) || a.title.localeCompare(b.title)
    if (a.start_time || b.start_time) return a.start_time ? -1 : 1
    return a.title.localeCompare(b.title)
  })
}

export const isDone = (item: ScheduleItem, date: string): boolean => item.done_dates.includes(date)

const hm = (time: string) => time.slice(0, 5)

// "18:00", "18:00 – 19:30", or null for all day
export function timeLabel(item: ScheduleItem): string | null {
  if (!item.start_time) return null
  return item.end_time ? `${hm(item.start_time)} – ${hm(item.end_time)}` : hm(item.start_time)
}

export type DotKind = ScheduleKind | 'session' | 'plan'

// One line of "what is on today": a schedule item, a match session or a training plan
export interface TodayRow {
  kind: 'item' | 'session' | 'plan'
  id: string
  dot: DotKind
  // An item's time label; null for all day, and always null for sessions and plans
  time: string | null
  // An item's title, a plan's title (may be null); always null for a session
  title: string | null
}

// What is on a day, in the order of the schedule page's day list: its items, then its match
// sessions, then its training plans. A task already ticked as done on that day is left out.
export function todayRows(items: ScheduleItem[], extras: ScheduleExtras, date: string): TodayRow[] {
  return [
    ...itemsOn(items, date)
      .filter((i) => !(i.kind === 'task' && isDone(i, date)))
      .map((i): TodayRow => ({ kind: 'item', id: i.id, dot: i.kind, time: timeLabel(i), title: i.title })),
    ...extras.sessions.filter((s) => s.date === date)
      .map((s): TodayRow => ({ kind: 'session', id: s.id, dot: 'session', time: null, title: null })),
    ...extras.plans.filter((p) => p.training_date === date)
      .map((p): TodayRow => ({ kind: 'plan', id: p.id, dot: 'plan', time: null, title: p.title })),
  ]
}
