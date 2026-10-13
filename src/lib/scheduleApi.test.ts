import { vi } from 'vitest'
import { db, resetDb, rows } from '../test/fakeSupabase'

vi.mock('./supabase', async () => (await import('../test/fakeSupabase')).supabaseModule)

import { deleteScheduleItem, fetchScheduleExtras, fetchScheduleItems, fetchToday, saveScheduleItem, setDone, skipDay } from './scheduleApi'
import type { ScheduleItem } from '../utils/schedule'

const row = (over: Record<string, unknown>) => ({
  league_id: 'L1', kind: 'task', title: 'Item', item_date: '2026-10-12', start_time: null, end_time: null, note: null,
  repeat_days: [], repeat_until: null, skipped_dates: [], done_dates: [], ...over,
})

describe('fetchScheduleItems', () => {
  it('reads the items that can be on a day of the range, and no others', async () => {
    resetDb({
      schedule_items: [
        row({ id: 'in', item_date: '2026-10-12' }),
        row({ id: 'first-day', item_date: '2026-10-01' }),
        row({ id: 'last-day', item_date: '2026-10-31' }),
        row({ id: 'before', item_date: '2026-09-30' }),
        row({ id: 'after', item_date: '2026-11-01' }),
        row({ id: 'other-league', league_id: 'L2' }),
        // Repeating: started long ago and still running; ended before the range; starts after it
        row({ id: 'weekly', item_date: '2026-01-04', repeat_days: [0, 2] }),
        row({ id: 'ends-inside', item_date: '2026-01-04', repeat_days: [0], repeat_until: '2026-10-01' }),
        row({ id: 'ended', item_date: '2026-01-04', repeat_days: [0], repeat_until: '2026-09-30' }),
        row({ id: 'not-yet', item_date: '2026-11-01', repeat_days: [0] }),
        row({ id: 'other-weekly', league_id: 'L2', item_date: '2026-01-04', repeat_days: [0] }),
        // Every month and every two weeks are repeating items too
        row({ id: 'monthly', item_date: '2026-03-15', repeat_monthly: true }),
        row({ id: 'two-weekly', item_date: '2026-02-01', repeat_days: [0], repeat_every: 2 }),
        row({ id: 'monthly-ended', item_date: '2026-03-15', repeat_monthly: true, repeat_until: '2026-08-15' }),
      ],
    })
    const items = await fetchScheduleItems('L1', '2026-10-01', '2026-10-31')
    expect(items.map((i) => i.id).sort()).toEqual(['ends-inside', 'first-day', 'in', 'last-day', 'monthly', 'two-weekly', 'weekly'])
    expect(items.find((i) => i.id === 'weekly')).toMatchObject({ repeat_days: [0, 2], repeat_every: 1, repeat_monthly: false, kind: 'task', title: 'Item' })
    expect(items.find((i) => i.id === 'two-weekly')).toMatchObject({ repeat_every: 2 })
    expect(items.find((i) => i.id === 'monthly')).toMatchObject({ repeat_monthly: true, repeat_days: [] })
    // A plain item comes back with the database's defaults for the repeat fields
    expect(items.find((i) => i.id === 'in')).toMatchObject({ repeat_every: 1, repeat_monthly: false })
  })

  it('throws when the items cannot be read', async () => {
    resetDb({ schedule_items: [row({ id: 'in' })] })
    db.errors.schedule_items = { message: 'offline' }
    await expect(fetchScheduleItems('L1', '2026-10-01', '2026-10-31')).rejects.toBeTruthy()
  })
})

describe('fetchScheduleExtras', () => {
  const data = () => ({
    sessions: [
      { id: 's1', league_id: 'L1', date: '2026-10-12' },
      { id: 's2', league_id: 'L1', date: '2026-11-02' },
      { id: 's3', league_id: 'L2', date: '2026-10-12' },
    ],
    trainings: [
      { id: 'p1', league_id: 'L1', training_date: '2026-10-20', title: 'Passing' },
      { id: 'p2', league_id: 'L1', training_date: '2026-09-20', title: null },
      { id: 'p3', league_id: 'L2', training_date: '2026-10-20', title: 'Not ours' },
    ],
  })

  it("reads the league's match sessions and training plans in the range", async () => {
    resetDb(data())
    expect(await fetchScheduleExtras('L1', '2026-10-01', '2026-10-31', true)).toEqual({
      sessions: [{ id: 's1', date: '2026-10-12' }],
      plans: [{ id: 'p1', training_date: '2026-10-20', title: 'Passing' }],
    })
  })

  it('does not ask for training plans when the league has no training', async () => {
    resetDb(data())
    db.errors.trainings = { message: 'must not be asked' }
    expect(await fetchScheduleExtras('L1', '2026-10-01', '2026-10-31', false)).toEqual({
      sessions: [{ id: 's1', date: '2026-10-12' }], plans: [],
    })
  })
})

describe('writing', () => {
  const draftRow = {
    kind: 'training' as const, title: 'Team training', item_date: '2026-10-11', start_time: '18:00', end_time: '19:30',
    note: null, repeat_days: [0, 2], repeat_every: 2, repeat_monthly: false, repeat_until: null,
  }
  const saved = (id: string) => rows('schedule_items').find((r) => r.id === id) as unknown as ScheduleItem

  it('adds a new item to the league', async () => {
    resetDb()
    expect(await saveScheduleItem('L1', null, draftRow)).toBe(true)
    expect(db.writes.at(-1)).toMatchObject({ table: 'schedule_items', op: 'insert', values: { league_id: 'L1', ...draftRow } })
    // The database works `repeats` out itself; it is never sent
    expect(db.writes.at(-1)!.values).not.toHaveProperty('repeats')
  })

  it('changes an existing item without moving it to another league', async () => {
    resetDb({ schedule_items: [row({ id: 'i1' })] })
    expect(await saveScheduleItem('L9', 'i1', draftRow)).toBe(true)
    expect(saved('i1')).toMatchObject({ league_id: 'L1', title: 'Team training', repeat_days: [0, 2] })
    expect(db.writes.at(-1)!.values).not.toHaveProperty('league_id')
  })

  it('reports a refused save', async () => {
    resetDb()
    db.errors.schedule_items = { message: 'new row violates row-level security policy' }
    expect(await saveScheduleItem('L1', null, draftRow)).toBe(false)
  })

  it('deletes an item', async () => {
    resetDb({ schedule_items: [row({ id: 'i1' }), row({ id: 'i2' })] })
    expect(await deleteScheduleItem('i1')).toBe(true)
    expect(rows('schedule_items').map((r) => r.id)).toEqual(['i2'])
  })

  it('takes one day out of a repeating item, keeping the days taken out before', async () => {
    resetDb({ schedule_items: [row({ id: 'i1', repeat_days: [0], skipped_dates: ['2026-10-04'] })] })
    expect(await skipDay(saved('i1'), '2026-10-11')).toBe(true)
    expect(saved('i1').skipped_dates).toEqual(['2026-10-04', '2026-10-11'])
  })

  it('ticks and unticks a day, never twice', async () => {
    resetDb({ schedule_items: [row({ id: 'i1', done_dates: ['2026-10-05'] })] })
    expect(await setDone(saved('i1'), '2026-10-12', true)).toBe(true)
    expect(saved('i1').done_dates).toEqual(['2026-10-05', '2026-10-12'])
    await setDone(saved('i1'), '2026-10-12', true)
    expect(saved('i1').done_dates).toEqual(['2026-10-05', '2026-10-12'])
    await setDone(saved('i1'), '2026-10-05', false)
    expect(saved('i1').done_dates).toEqual(['2026-10-12'])
  })
})

describe('fetchToday', () => {
  const seed = () => resetDb({
    schedule_items: [
      row({ id: 'gym', title: 'Gym', start_time: '08:00:00' }),
      row({ id: 'weekly', title: 'Team training', kind: 'training', item_date: '2026-10-05', repeat_days: [1] }),
      row({ id: 'done', title: 'Done already', done_dates: ['2026-10-12'] }),
      row({ id: 'tomorrow', item_date: '2026-10-13' }),
      row({ id: 'theirs', league_id: 'L2' }),
    ],
    sessions: [{ id: 's1', league_id: 'L1', date: '2026-10-12' }, { id: 's2', league_id: 'L2', date: '2026-10-12' }],
    trainings: [{ id: 'p1', league_id: 'L1', training_date: '2026-10-12', title: 'Passing day' }],
  })

  it("reads one league's day as rows", async () => {
    seed()
    const rows = await fetchToday('L1', '2026-10-12', true)
    expect(rows.map((r) => `${r.kind}:${r.id}`)).toEqual(['item:gym', 'item:weekly', 'session:s1', 'plan:p1'])
  })

  it('does not ask for training plans without the training feature', async () => {
    seed()
    db.errors.trainings = { message: 'must not be read' }
    const rows = await fetchToday('L1', '2026-10-12', false)
    expect(rows.map((r) => r.kind)).toEqual(['item', 'item', 'session'])
  })

  it('throws when a read fails', async () => {
    seed()
    db.errors.schedule_items = { message: 'down' }
    await expect(fetchToday('L1', '2026-10-12', true)).rejects.toThrow()
  })

  it('makes every one of its reads with the signal it is given, and with none otherwise', async () => {
    seed()
    const signal = new AbortController().signal
    await fetchToday('L1', '2026-10-12', true, signal)
    expect(db.signals).toEqual([signal, signal, signal, signal])
    seed()
    await fetchToday('L1', '2026-10-12', true)
    expect(db.signals).toEqual([undefined, undefined, undefined, undefined])
  })
})
