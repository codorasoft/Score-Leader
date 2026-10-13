import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { itemsOn, occursOn, todayRows, type ScheduleItem } from './scheduleDay.ts'

const item = (over: Partial<ScheduleItem> = {}): ScheduleItem => ({
  id: 'i1', kind: 'task', title: 'Book the pitch', item_date: '2026-10-12', start_time: null, end_time: null, note: null,
  repeat_days: [], repeat_every: 1, repeat_monthly: false, repeat_until: null, skipped_dates: [], done_dates: [], ...over,
})

it('holds the day logic the app and the server function share', () => {
  const weekly = item({ id: 'w', item_date: '2026-10-05', repeat_days: [1], start_time: '18:00:00' })
  expect(occursOn(weekly, '2026-10-12')).toBe(true)
  expect(itemsOn([item(), weekly], '2026-10-12').map((i) => i.id)).toEqual(['w', 'i1'])
  expect(todayRows([item({ done_dates: ['2026-10-12'] })], { sessions: [{ id: 's1', date: '2026-10-12' }], plans: [] }, '2026-10-12'))
    .toEqual([{ kind: 'session', id: 's1', dot: 'session', time: null, title: null }])
})

// The server function runs in Deno: a shared file may only import its neighbours, by their full name
it.each(['scheduleDay.ts', 'morningPush.ts', 'morningPushData.ts'])('%s imports nothing Deno cannot load', (name) => {
  let source: string
  try { source = readFileSync(resolve(__dirname, name), 'utf8') } catch { return } // not written yet
  const paths = [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
  for (const path of paths) expect(path).toMatch(/^\.\/[A-Za-z]+\.ts$/)
})

it('the app still gets everything from src/utils/schedule', async () => {
  const app = await import('../../../src/utils/schedule.ts')
  for (const name of ['occursOn', 'itemsOn', 'isDone', 'timeLabel', 'todayRows', 'repeatModeOf', 'weekdayOf', 'monthGrid', 'layoutDay', 'draftToRow']) {
    expect(app).toHaveProperty(name)
  }
})
