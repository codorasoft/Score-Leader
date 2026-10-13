// The coach's schedule in the app: the grids it is shown on and its form. Which items are on
// which day, and the rows of one day, are in the file shared with the server function, and
// everything in it is passed on from here.
// A day is a plain date ('2026-10-12') with no time zone; all the arithmetic is done in UTC so
// it gives the same answer on every device. Weekdays are 0 (Sunday) .. 6 (Saturday).
import {
  occursOn, repeatModeOf, weekdayOf,
  type DotKind, type RepeatMode, type ScheduleExtras, type ScheduleItem, type ScheduleKind,
} from '../../supabase/functions/_shared/scheduleDay.ts'

export * from '../../supabase/functions/_shared/scheduleDay.ts'

export const SCHEDULE_KINDS: ScheduleKind[] = ['task', 'training', 'match', 'other']

// ===== Days

const two = (n: number) => String(n).padStart(2, '0')
const toUtc = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const fromUtc = (d: Date) => `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`

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

// ===== A day's dots

const DOT_ORDER: DotKind[] = ['session', 'match', 'training', 'plan', 'task', 'other']
const MAX_DOTS = 4

// One dot per kind of thing on a day, in a fixed order, so the same kind is always in the same place
export function dotsFor(items: ScheduleItem[], extras: ScheduleExtras, date: string): DotKind[] {
  const on = new Set<DotKind>(items.filter((i) => occursOn(i, date)).map((i) => i.kind))
  if (extras.sessions.some((s) => s.date === date)) on.add('session')
  if (extras.plans.some((p) => p.training_date === date)) on.add('plan')
  return DOT_ORDER.filter((k) => on.has(k)).slice(0, MAX_DOTS)
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

const hm = (time: string) => time.slice(0, 5)

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
