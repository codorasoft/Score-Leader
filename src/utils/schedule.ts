// The coach's schedule: which items are on which day, and the month grid they are shown on.
// A day is a plain date ('2026-10-12') with no time zone; all the arithmetic is done in UTC so
// it gives the same answer on every device. Weekdays are 0 (Sunday) .. 6 (Saturday).

export type ScheduleKind = 'task' | 'training' | 'match' | 'other'
export const SCHEDULE_KINDS: ScheduleKind[] = ['task', 'training', 'match', 'other']

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
  // Weekdays it repeats on every week; empty = it does not repeat
  repeat_days: number[]
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

const two = (n: number) => String(n).padStart(2, '0')
const toUtc = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const fromUtc = (d: Date) => `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`

export const weekdayOf = (date: string): number => toUtc(date).getUTCDay()

export function addDays(date: string, days: number): string {
  const d = toUtc(date)
  d.setUTCDate(d.getUTCDate() + days)
  return fromUtc(d)
}

export interface Month { year: number; month: number } // month 1..12

export const monthOf = (date: string): Month => ({ year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) })

export function shiftMonth({ year, month }: Month, by: number): Month {
  const index = year * 12 + (month - 1) + by
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

// Saturday in Arabic, Monday otherwise
export const weekStartFor = (language: string): number => (language.startsWith('ar') ? 6 : 1)

// The seven weekdays in the order a week shows them
export const weekdayOrder = (weekStartsOn: number): number[] => Array.from({ length: 7 }, (_, i) => (weekStartsOn + i) % 7)

// The weeks that cover a month, each of seven days; the first and last may reach into the
// neighbouring months.
export function monthGrid(year: number, month: number, weekStartsOn: number): string[][] {
  const first = `${year}-${two(month)}-01`
  const next = shiftMonth({ year, month }, 1)
  const last = addDays(`${next.year}-${two(next.month)}-01`, -1)
  let day = addDays(first, -((weekdayOf(first) - weekStartsOn + 7) % 7))
  const weeks: string[][] = []
  while (day <= last) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(day, i)))
    day = addDays(day, 7)
  }
  return weeks
}

// ===== Items on a day

export function occursOn(item: ScheduleItem, date: string): boolean {
  if (item.repeat_days.length === 0) return item.item_date === date
  if (date < item.item_date) return false
  if (item.repeat_until && date > item.repeat_until) return false
  return item.repeat_days.includes(weekdayOf(date)) && !item.skipped_dates.includes(date)
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
const DOT_ORDER: DotKind[] = ['session', 'match', 'training', 'plan', 'task', 'other']
const MAX_DOTS = 4

// One dot per kind of thing on a day, in a fixed order, so the same kind is always in the same place
export function dotsFor(items: ScheduleItem[], extras: ScheduleExtras, date: string): DotKind[] {
  const on = new Set<DotKind>(items.filter((i) => occursOn(i, date)).map((i) => i.kind))
  if (extras.sessions.some((s) => s.date === date)) on.add('session')
  if (extras.plans.some((p) => p.training_date === date)) on.add('plan')
  return DOT_ORDER.filter((k) => on.has(k)).slice(0, MAX_DOTS)
}

// ===== The item form

export interface ScheduleDraft {
  kind: ScheduleKind
  title: string
  date: string
  // 'HH:MM', or '' for none
  start: string
  end: string
  note: string
  repeatDays: number[]
  // '' for no last day
  until: string
}

export const emptyDraft = (date: string): ScheduleDraft =>
  ({ kind: 'task', title: '', date, start: '', end: '', note: '', repeatDays: [], until: '' })

export const toDraft = (item: ScheduleItem): ScheduleDraft => ({
  kind: item.kind,
  title: item.title,
  date: item.item_date,
  start: item.start_time ? hm(item.start_time) : '',
  end: item.end_time ? hm(item.end_time) : '',
  note: item.note ?? '',
  repeatDays: [...item.repeat_days].sort((a, b) => a - b),
  until: item.repeat_until ?? '',
})

// What stops a draft from being saved, or null when it can be
export function draftProblem(draft: ScheduleDraft): 'title' | 'date' | 'times' | 'until' | null {
  if (!draft.title.trim()) return 'title'
  if (!draft.date) return 'date'
  if (draft.end && (!draft.start || draft.end <= draft.start)) return 'times'
  if (draft.repeatDays.length > 0 && draft.until && draft.until < draft.date) return 'until'
  return null
}

export type ScheduleRow = Pick<ScheduleItem, 'kind' | 'title' | 'item_date' | 'start_time' | 'end_time' | 'note' | 'repeat_days' | 'repeat_until'>

// The draft as the database takes it
export function draftToRow(draft: ScheduleDraft): ScheduleRow {
  const repeats = draft.repeatDays.length > 0
  return {
    kind: draft.kind,
    title: draft.title.replace(/\s+/g, ' ').trim(),
    item_date: draft.date,
    start_time: draft.start || null,
    end_time: draft.end || null,
    note: draft.note.trim() || null,
    repeat_days: [...draft.repeatDays].sort((a, b) => a - b),
    repeat_until: repeats && draft.until ? draft.until : null,
  }
}
