import { db, resetDb, rows, supabase } from '../../../src/test/fakeSupabase.ts'
import { coachIsAllowed, roundDeps } from './morningPushData.ts'

// Tuesday 13 October 2026 (weekday 2)
const DAY = '2026-10-13'
const item = (over: Record<string, unknown>) => ({
  kind: 'task', title: 'Item', item_date: DAY, start_time: null, end_time: null, note: null,
  repeat_days: [], repeat_until: null, skipped_dates: [], done_dates: [], ...over,
})
const device = (id: string, user_id: string) => ({
  id, user_id, endpoint: `https://push.test/${id}`, p256dh: 'k', auth: 'a', time_zone: 'Asia/Riyadh', notify_hour: 7, notify_minute: 30, language: 'en', last_sent_on: null,
})
const seed = () => resetDb({
  admin_profiles: [
    { user_id: 'u1', role: 'admin', is_disabled: false, features: ['schedule', 'training'] },
    { user_id: 'u2', role: 'admin', is_disabled: true, features: ['schedule'] },
    { user_id: 'u3', role: 'superadmin', is_disabled: false, features: [] },
    { user_id: 'u4', role: 'admin', is_disabled: false, features: ['training'] },
  ],
  // Not in the order they were made
  leagues: [
    { id: 'L2', owner_id: 'u1', name: 'Lions', slug: 'lions', created_at: '2026-02-01T00:00:00Z' },
    { id: 'L1', owner_id: 'u1', name: 'Eagles', slug: 'eagles', created_at: '2026-01-01T00:00:00Z' },
    { id: 'L3', owner_id: 'u2', name: 'Owls', slug: 'owls', created_at: '2026-03-01T00:00:00Z' },
  ],
  schedule_items: [
    item({ id: 'i1', league_id: 'L1', title: 'Gym', start_time: '08:00:00' }),
    item({ id: 'w1', league_id: 'L2', title: 'Team training', kind: 'training', item_date: '2026-10-06', repeat_days: [2] }),
    item({ id: 'ended', league_id: 'L1', item_date: '2026-09-01', repeat_days: [2], repeat_until: '2026-10-12' }),
    item({ id: 'tomorrow', league_id: 'L1', item_date: '2026-10-14' }),
    item({ id: 'later', league_id: 'L2', item_date: '2026-10-20', repeat_days: [2] }),
    item({ id: 'theirs', league_id: 'L3' }),
  ],
  sessions: [
    { id: 's1', league_id: 'L2', date: DAY },
    { id: 's0', league_id: 'L1', date: '2026-10-12' },
    { id: 's3', league_id: 'L3', date: DAY },
  ],
  trainings: [
    { id: 'p1', league_id: 'L1', training_date: DAY, title: 'Passing day' },
    { id: 'p3', league_id: 'L3', training_date: DAY, title: 'Theirs' },
  ],
  push_subscriptions: [device('d1', 'u1'), device('d2', 'u2'), device('d3', 'u3'), device('d4', 'gone-coach')],
})
const send = async () => 'sent' as const
const deps = () => roundDeps(supabase, send)
const shape = (leagues: Awaited<ReturnType<ReturnType<typeof deps>['day']>>) =>
  leagues.map((l) => ({ name: l.name, slug: l.slug, rows: l.rows.map((r) => `${r.kind}:${r.id}`) }))

describe('subscriptions', () => {
  it("gives every device with its coach's state", async () => {
    seed()
    const subs = await deps().subscriptions()
    expect(subs.map((s) => [s.id, s.coach.enabled, s.coach.features])).toEqual([
      ['d1', true, ['schedule', 'training']],
      ['d2', false, ['schedule']],      // disabled
      ['d3', false, []],                // a superadmin is not a coach
      ['d4', false, []],                // no profile
    ])
    expect(subs[0]).toMatchObject({ user_id: 'u1', endpoint: 'https://push.test/d1', p256dh: 'k', auth: 'a', time_zone: 'Asia/Riyadh', notify_hour: 7, notify_minute: 30, language: 'en', last_sent_on: null })
    // The read names its columns: the minutes must be among them
    const { DEVICE_COLUMNS } = await import('./morningPushData.ts')
    expect(DEVICE_COLUMNS.split(', ')).toContain('notify_minute')
  })
  it('is empty, and asks nothing more, when there is no device', async () => {
    resetDb({ admin_profiles: [{ user_id: 'u1', role: 'admin', is_disabled: false, features: ['schedule'] }] })
    expect(await deps().subscriptions()).toEqual([])
    expect(db.reads).toBe(1)
  })
  it('throws when the devices cannot be read', async () => {
    seed()
    db.errors.push_subscriptions = { message: 'down' }
    await expect(deps().subscriptions()).rejects.toThrow()
  })
})

describe('day', () => {
  it("gives each of the coach's leagues with its rows, in the order they were made", async () => {
    seed()
    expect(shape(await deps().day('u1', DAY, true))).toEqual([
      { name: 'Eagles', slug: 'eagles', rows: ['item:i1', 'plan:p1'] },
      { name: 'Lions', slug: 'lions', rows: ['item:w1', 'session:s1'] },
    ])
  })
  it('leaves training plans out, and does not ask for them, without plans', async () => {
    seed()
    db.errors.trainings = { message: 'must not be read' }
    expect(shape(await deps().day('u1', DAY, false))).toEqual([
      { name: 'Eagles', slug: 'eagles', rows: ['item:i1'] },
      { name: 'Lions', slug: 'lions', rows: ['item:w1', 'session:s1'] },
    ])
  })
  it.each(['leagues', 'schedule_items', 'sessions', 'trainings'])('throws when %s cannot be read', async (table) => {
    seed()
    db.errors[table] = { message: 'down' }
    await expect(deps().day('u1', DAY, true)).rejects.toThrow()
  })
  it('is empty for a coach with no league', async () => {
    seed()
    expect(await deps().day('u4', DAY, true)).toEqual([])
  })
})

describe('writes', () => {
  it('markSent writes the day on that device alone', async () => {
    seed()
    await deps().markSent('d1', DAY)
    expect(rows('push_subscriptions').map((r) => [r.id, r.last_sent_on])).toEqual([['d1', DAY], ['d2', null], ['d3', null], ['d4', null]])
  })
  it('remove deletes that device alone', async () => {
    seed()
    await deps().remove('d1')
    expect(rows('push_subscriptions').map((r) => r.id)).toEqual(['d2', 'd3', 'd4'])
  })
  it('both throw when the write is refused', async () => {
    seed()
    db.errors.push_subscriptions = { message: 'down' }
    await expect(deps().markSent('d1', DAY)).rejects.toThrow()
    await expect(deps().remove('d1')).rejects.toThrow()
  })
})

it('send is the one handed in', async () => {
  const sent: string[] = []
  const d = roundDeps(supabase, async (sub) => { sent.push(sub.id); return 'gone' })
  expect(await d.send({ ...device('d1', 'u1'), language: 'en' }, { title: 't', body: 'b', url: '/admin', tag: 'x', lang: 'en', dir: 'ltr' })).toBe('gone')
  expect(sent).toEqual(['d1'])
})

describe('coachIsAllowed', () => {
  it('is true for an enabled admin with the schedule', async () => {
    seed()
    expect(await coachIsAllowed(supabase, 'u1')).toBe(true)
  })
  it.each([['a disabled admin', 'u2'], ['a superadmin', 'u3'], ['an admin without the schedule', 'u4'], ['nobody we know', 'nobody']])('is false for %s', async (_who, id) => {
    seed()
    expect(await coachIsAllowed(supabase, id)).toBe(false)
  })
  it('is false when the profile cannot be read', async () => {
    seed()
    db.errors.admin_profiles = { message: 'down' }
    expect(await coachIsAllowed(supabase, 'u1')).toBe(false)
  })
})
