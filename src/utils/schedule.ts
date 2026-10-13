// The coach's schedule: which items are on which day, and the grids they are shown on.
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

const two = (n: number) => String(n).padStart(2, '0')
const toUtc = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const fromUtc = (d: Date) => `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`
const DAY_MS = 86_400_000
const daysBetween = (from: string, to: string) => Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / DAY_MS)

export const weekdayOf = (date: string): number => toUtc(date).getUTCDay()

export function addDays(date: string, days: number): string {
  const d = toUtc(date)
  d.setUTCDate(d.getUTCDate() + days)
  return fromUtc(d)
}

export interface Month { year: number; month: number } // month 1..12

export const monthOf = (date: string): Month => ({ year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) })
export const firstOfMonth = ({ year, month }: Month): string => `${year}-${two(month)}-01`

export function shiftMonth({ year, month }: Month, by: number): Month {
  const index = year * 12 + (month - 1) + by
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

// Saturday in Arabic, Monday otherwise
export const weekStartFor = (language: string): number => (language.startsWith('ar') ? 6 : 1)

// The seven weekdays in the order a week shows them
export const weekdayOrder = (weekStartsOn: number): number[] => Array.from({ length: 7 }, (_, i) => (weekStartsOn + i) % 7)

// The seven days, from the week's first weekday, that hold the date
export function weekOf(date: string, weekStartsOn: number): string[] {
  const first = addDays(date, -((weekdayOf(date) - weekStartsOn + 7) % 7))
  return Array.from({ length: 7 }, (_, i) => addDays(first, i))
}

// The weeks that cover a month, each of seven days; the first and last may reach into the
// neighbouring months.
export function monthGrid(year: number, month: number, weekStartsOn: number): string[][] {
  const first = firstOfMonth({ year, month })
  const last = addDays(firstOfMonth(shiftMonth({ year, month }, 1)), -1)
  const weeks: string[][] = []
  for (let week = weekOf(first, weekStartsOn); week[0] <= last; week = weekOf(addDays(week[0], 7), weekStartsOn)) weeks.push(week)
  return weeks
}

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
const DOT_ORDER: DotKind[] = ['session', 'match', 'training', 'plan', 'task', 'other']
const MAX_DOTS = 4

// One dot per kind of thing on a day, in a fixed order, so the same kind is always in the same place
export function dotsFor(items: ScheduleItem[], extras: ScheduleExtras, date: string): DotKind[] {
  const on = new Set<DotKind>(items.filter((i) => occursOn(i, date)).map((i) => i.kind))
  if (extras.sessions.some((s) => s.date === date)) on.add('session')
  if (extras.plans.some((p) => p.training_date === date)) on.add('plan')
  return DOT_ORDER.filter((k) => on.has(k)).slice(0, MAX_DOTS)
}

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

// ===== The week and day views: a grid of hours

const DAY_MINUTES = 24 * 60
// An item with no end time is drawn one hour long
const DEFAULT_MINUTES = 60
const FIRST_HOUR = 7
const LAST_HOUR = 21

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
const span = (item: ScheduleItem) => {
  const start = minutesOf(item.start_time!)
  const end = item.end_time ? minutesOf(item.end_time) : start + DEFAULT_MINUTES
  return { start, end: Math.min(DAY_MINUTES, Math.max(end, start + 1)) }
}

// The hours a grid shows: 07:00 to 21:00, stretched to hold every timed item given
export function gridHours(items: ScheduleItem[]): { from: number; to: number } {
  const spans = items.filter((i) => i.start_time).map(span)
  return {
    from: Math.min(FIRST_HOUR, ...spans.map((s) => Math.floor(s.start / 60))),
    to: Math.max(LAST_HOUR, ...spans.map((s) => Math.ceil(s.end / 60))),
  }
}

export interface Placed { item: ScheduleItem; start: number; end: number; lane: number; lanes: number }

// Where the timed items of one day go: minutes from midnight, and for items that overlap, which
// of how many side-by-side lanes each takes. All-day items are not placed.
export function layoutDay(items: ScheduleItem[]): Placed[] {
  const timed = items.filter((i) => i.start_time).map((item) => ({ item, ...span(item) }))
    .sort((a, b) => a.start - b.start || a.end - b.end || a.item.title.localeCompare(b.item.title))
  const placed: Placed[] = []
  // A cluster is a run of items chained together by overlaps; they share one lane count
  let cluster: Placed[] = []
  let clusterEnd = 0
  const close = () => {
    const lanes = Math.max(0, ...cluster.map((p) => p.lane)) + 1
    cluster.forEach((p) => { p.lanes = lanes })
    cluster = []
  }
  for (const entry of timed) {
    if (cluster.length > 0 && entry.start >= clusterEnd) close()
    const taken = new Set(cluster.filter((p) => p.end > entry.start).map((p) => p.lane))
    let lane = 0
    while (taken.has(lane)) lane++
    const p: Placed = { ...entry, lane, lanes: 1 }
    cluster.push(p)
    placed.push(p)
    clusterEnd = Math.max(clusterEnd, entry.end)
  }
  if (cluster.length > 0) close()
  return placed
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
  repeat: RepeatMode
  // For a weekly or two-weekly repeat
  repeatDays: number[]
  // '' for no last day
  until: string
}

export const emptyDraft = (date: string, start = ''): ScheduleDraft =>
  ({ kind: 'task', title: '', date, start, end: '', note: '', repeat: 'none', repeatDays: [], until: '' })

export const toDraft = (item: ScheduleItem): ScheduleDraft => ({
  kind: item.kind,
  title: item.title,
  date: item.item_date,
  start: item.start_time ? hm(item.start_time) : '',
  end: item.end_time ? hm(item.end_time) : '',
  note: item.note ?? '',
  repeat: repeatModeOf(item),
  repeatDays: [...item.repeat_days].sort((a, b) => a - b),
  until: item.repeat_until ?? '',
})

const byWeekdays = (mode: RepeatMode) => mode === 'weekly' || mode === 'biweekly'

// The draft with another way of repeating. A weekly repeat with no weekday chosen yet starts on
// the date's own weekday.
export function withRepeat(draft: ScheduleDraft, repeat: RepeatMode): ScheduleDraft {
  const needsDay = byWeekdays(repeat) && draft.repeatDays.length === 0 && !!draft.date
  return { ...draft, repeat, repeatDays: needsDay ? [weekdayOf(draft.date)] : draft.repeatDays }
}

// What stops a draft from being saved, or null when it can be
export function draftProblem(draft: ScheduleDraft): 'title' | 'date' | 'times' | 'days' | 'until' | null {
  if (!draft.title.trim()) return 'title'
  if (!draft.date) return 'date'
  if (draft.end && (!draft.start || draft.end <= draft.start)) return 'times'
  if (byWeekdays(draft.repeat) && draft.repeatDays.length === 0) return 'days'
  if (draft.repeat !== 'none' && draft.until && draft.until < draft.date) return 'until'
  return null
}

export type ScheduleRow = Pick<ScheduleItem,
  'kind' | 'title' | 'item_date' | 'start_time' | 'end_time' | 'note' | 'repeat_days' | 'repeat_every' | 'repeat_monthly' | 'repeat_until'>

// The draft as the database takes it
export function draftToRow(draft: ScheduleDraft): ScheduleRow {
  return {
    kind: draft.kind,
    title: draft.title.replace(/\s+/g, ' ').trim(),
    item_date: draft.date,
    start_time: draft.start || null,
    end_time: draft.end || null,
    note: draft.note.trim() || null,
    repeat_days: byWeekdays(draft.repeat) ? [...draft.repeatDays].sort((a, b) => a - b) : [],
    repeat_every: draft.repeat === 'biweekly' ? 2 : 1,
    repeat_monthly: draft.repeat === 'monthly',
    repeat_until: draft.repeat !== 'none' && draft.until ? draft.until : null,
  }
}
