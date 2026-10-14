import en from '../../../src/locales/en.json'
import ar from '../../../src/locales/ar.json'
import {
  buildMessage, callerKind, dueDate, localClock, runRound, runTest, sampleMessage, SEND_AT_ONCE, WORDS,
  type CoachSub, type LeagueDay, type PushMessage, type RoundDeps, type SendResult,
} from './morningPush.ts'
import type { TodayRow } from './scheduleDay.ts'

const at = (iso: string) => new Date(iso)
const sub = (over = {}) => ({ time_zone: 'Asia/Riyadh', notify_hour: 7, notify_minute: 0, last_sent_on: null as string | null, ...over })

describe('localClock', () => {
  it('reads the date, hour and minute of a time zone', () => {
    expect(localClock('Asia/Riyadh', at('2026-10-13T04:10:00Z'))).toEqual({ date: '2026-10-13', hour: 7, minute: 10 })
    expect(localClock('America/New_York', at('2026-10-13T03:59:00Z'))).toEqual({ date: '2026-10-12', hour: 23, minute: 59 })
    expect(localClock('Asia/Kolkata', at('2026-10-13T18:45:00Z'))).toEqual({ date: '2026-10-14', hour: 0, minute: 15 })
    expect(localClock('Asia/Kathmandu', at('2026-10-13T01:15:00Z'))).toEqual({ date: '2026-10-13', hour: 7, minute: 0 })
    expect(localClock('UTC', at('2026-10-13T00:00:00Z'))).toEqual({ date: '2026-10-13', hour: 0, minute: 0 })
  })
  it.each(['Not a zone!', '', 'Mars/Olympus'])('gives null for a zone it cannot read (%s)', (zone) => {
    expect(localClock(zone, at('2026-10-13T04:10:00Z'))).toBeNull()
  })
})

describe('dueDate', () => {
  it('is due from the chosen hour to the end of the hour after it', () => {
    expect(dueDate(sub(), at('2026-10-13T03:59:00Z'))).toBeNull()               // 06:59
    expect(dueDate(sub(), at('2026-10-13T04:00:00Z'))).toBe('2026-10-13')       // 07:00
    expect(dueDate(sub(), at('2026-10-13T05:59:00Z'))).toBe('2026-10-13')       // 08:59
    expect(dueDate(sub(), at('2026-10-13T06:00:00Z'))).toBeNull()               // 09:00
  })
  it('is not due twice on one day, and is due again the next', () => {
    expect(dueDate(sub({ last_sent_on: '2026-10-13' }), at('2026-10-13T04:15:00Z'))).toBeNull()
    expect(dueDate(sub({ last_sent_on: '2026-10-13' }), at('2026-10-14T04:15:00Z'))).toBe('2026-10-14')
  })
  it('at hour 23 the window is that hour alone', () => {
    const late = sub({ notify_hour: 23 })
    expect(dueDate(late, at('2026-10-13T20:30:00Z'))).toBe('2026-10-13')        // 23:30
    expect(dueDate(late, at('2026-10-13T21:10:00Z'))).toBeNull()                // 00:10 the next day
  })
  it('follows a time zone half an hour off', () => {
    const india = sub({ time_zone: 'Asia/Kolkata' })
    expect(dueDate(india, at('2026-10-13T01:29:00Z'))).toBeNull()               // 06:59
    expect(dueDate(india, at('2026-10-13T01:30:00Z'))).toBe('2026-10-13')       // 07:00
  })
  it('on the day the clocks go forward, an hour that does not exist is caught by the one after', () => {
    const berlin = sub({ time_zone: 'Europe/Berlin', notify_hour: 2 })
    expect(dueDate(berlin, at('2026-03-29T00:59:00Z'))).toBeNull()              // 01:59
    expect(dueDate(berlin, at('2026-03-29T01:00:00Z'))).toBe('2026-03-29')      // 03:00, there is no 02:00
  })
  it('on the day the clocks go back, the hour that comes twice is sent once', () => {
    const berlin = sub({ time_zone: 'Europe/Berlin', notify_hour: 2 })
    expect(dueDate(berlin, at('2026-10-25T00:10:00Z'))).toBe('2026-10-25')      // 02:10, the first time
    expect(dueDate({ ...berlin, last_sent_on: '2026-10-25' }, at('2026-10-25T01:10:00Z'))).toBeNull() // 02:10 again
  })
  it('a device whose time zone cannot be read is never due', () => {
    expect(dueDate(sub({ time_zone: 'Not a zone!' }), at('2026-10-13T04:10:00Z'))).toBeNull()
  })
  it('with minutes, is due from that time for the two hours after it', () => {
    const half = sub({ notify_minute: 30 })                                      // 07:30 in Riyadh
    expect(dueDate(half, at('2026-10-13T04:00:00Z'))).toBeNull()                // 07:00
    expect(dueDate(half, at('2026-10-13T04:29:00Z'))).toBeNull()                // 07:29
    expect(dueDate(half, at('2026-10-13T04:30:00Z'))).toBe('2026-10-13')        // 07:30
    expect(dueDate(half, at('2026-10-13T06:29:00Z'))).toBe('2026-10-13')        // 09:29
    expect(dueDate(half, at('2026-10-13T06:30:00Z'))).toBeNull()                // 09:30
    expect(dueDate(sub({ notify_minute: 45 }), at('2026-10-13T04:44:00Z'))).toBeNull()         // 07:44
    expect(dueDate(sub({ notify_minute: 45 }), at('2026-10-13T04:45:00Z'))).toBe('2026-10-13') // 07:45
    expect(dueDate(sub({ notify_minute: 15 }), at('2026-10-13T04:15:00Z'))).toBe('2026-10-13') // 07:15
  })
  it('a time late in the evening is due until midnight only', () => {
    const last = sub({ notify_hour: 23, notify_minute: 45 })
    expect(dueDate(last, at('2026-10-13T20:44:00Z'))).toBeNull()                // 23:44
    expect(dueDate(last, at('2026-10-13T20:45:00Z'))).toBe('2026-10-13')        // 23:45
    expect(dueDate(last, at('2026-10-13T21:00:00Z'))).toBeNull()                // 00:00 the next day
    const evening = sub({ notify_hour: 22, notify_minute: 30 })
    expect(dueDate(evening, at('2026-10-13T20:59:00Z'))).toBe('2026-10-13')     // 23:59
    expect(dueDate(evening, at('2026-10-13T21:10:00Z'))).toBeNull()             // 00:10 the next day
  })
  it('follows the minutes in a time zone a quarter of an hour off', () => {
    const nepal = sub({ time_zone: 'Asia/Kathmandu', notify_minute: 15 })       // UTC+5:45
    expect(dueDate(nepal, at('2026-10-13T01:15:00Z'))).toBeNull()               // 07:00
    expect(dueDate(nepal, at('2026-10-13T01:30:00Z'))).toBe('2026-10-13')       // 07:15
  })
  it('a device with no minutes counts as on the hour', () => {
    const old = sub({ notify_minute: undefined as unknown as number })
    expect(dueDate(old, at('2026-10-13T04:00:00Z'))).toBe('2026-10-13')         // 07:00
    expect(dueDate({ ...old, notify_minute: null as unknown as number }, at('2026-10-13T03:59:00Z'))).toBeNull()
  })
})

const row = (over: Partial<TodayRow>): TodayRow => ({ kind: 'item', id: 'i', dot: 'task', time: null, title: 'Item', ...over })
const eagles = (rows: TodayRow[]): LeagueDay => ({ name: 'Eagles', slug: 'eagles', rows })

describe('buildMessage', () => {
  it('lists one league in English', () => {
    expect(buildMessage('en', '2026-10-13', [eagles([
      row({ time: '08:00 – 09:30', title: 'Gym' }),
      row({ title: 'Book the pitch' }),
      row({ kind: 'session', dot: 'session', title: null }),
      row({ kind: 'plan', dot: 'plan', title: 'Passing day' }),
      row({ kind: 'plan', dot: 'plan', title: null }),
    ])])).toEqual({
      title: 'Today: 5 items',
      body: '08:00 – 09:30 Gym\nBook the pitch\nMatch session\nTraining plan: Passing day\nTraining plan',
      url: '/admin/eagles/schedule', tag: 'today-2026-10-13', lang: 'en', dir: 'ltr',
    })
  })
  it('says "1 item" for one', () => {
    expect(buildMessage('en', '2026-10-13', [eagles([row({})])])?.title).toBe('Today: 1 item')
  })
  it('is null when nothing is on', () => {
    expect(buildMessage('en', '2026-10-13', [])).toBeNull()
    expect(buildMessage('en', '2026-10-13', [eagles([])])).toBeNull()
  })
  it('names the league on every line when more than one has something, and opens the app', () => {
    const message = buildMessage('en', '2026-10-13', [
      eagles([row({ title: 'Gym' })]),
      { name: 'Lions', slug: 'lions', rows: [] },
      { name: 'Owls', slug: 'owls', rows: [row({ kind: 'session', dot: 'session', title: null })] },
    ])
    expect(message?.body).toBe('Eagles · Gym\nOwls · Match session')
    expect(message?.url).toBe('/admin')
    expect(message?.title).toBe('Today: 2 items')
  })
  it('a league with nothing does not turn the names on', () => {
    const message = buildMessage('en', '2026-10-13', [eagles([row({ title: 'Gym' })]), { name: 'Lions', slug: 'lions', rows: [] }])
    expect(message?.body).toBe('Gym')
    expect(message?.url).toBe('/admin/eagles/schedule')
  })
  it('shows five rows and counts the rest', () => {
    const rows = Array.from({ length: 8 }, (_, i) => row({ id: `i${i}`, title: `Item ${i + 1}` }))
    const message = buildMessage('en', '2026-10-13', [eagles(rows)])
    expect(message?.body.split('\n')).toEqual(['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5', '+3 more'])
    expect(message?.title).toBe('Today: 8 items')
  })
  it('cuts a long line, so the whole message stays small enough to send', () => {
    const long = '⚽'.repeat(80)
    const rows = Array.from({ length: 9 }, (_, i) => row({ id: `i${i}`, time: '08:00 – 09:30', title: long }))
    const message = buildMessage('ar', '2026-10-13', [
      { name: 'ن'.repeat(80), slug: 'a', rows }, { name: 'م'.repeat(80), slug: 'b', rows },
    ])!
    for (const line of message.body.split('\n')) expect([...line].length).toBeLessThanOrEqual(80)
    expect(message.body.split('\n')[0].endsWith('…')).toBe(true)
    expect(new TextEncoder().encode(JSON.stringify(message)).length).toBeLessThan(3000)
  })
  it('speaks Arabic, right to left, with its plural forms', () => {
    const message = buildMessage('ar', '2026-10-13', [eagles([
      row({ time: '08:00', title: 'تمرين' }), row({ kind: 'session', dot: 'session', title: null }), row({ kind: 'plan', dot: 'plan', title: 'تمرير' }),
    ])])!
    expect(message).toMatchObject({ lang: 'ar', dir: 'rtl', title: 'اليوم: 3 عناصر' })
    expect(message.body).toBe('08:00 تمرين\nجلسة مباريات\nخطة تدريب: تمرير')
    expect(buildMessage('ar', '2026-10-13', [eagles([row({})])])?.title).toBe('اليوم: عنصر واحد')
    expect(buildMessage('ar', '2026-10-13', [eagles([row({}), row({})])])?.title).toBe('اليوم: عنصران')
    const eleven = Array.from({ length: 11 }, () => row({}))
    expect(buildMessage('ar', '2026-10-13', [eagles(eleven)])?.title).toBe('اليوم: 11 عنصراً')
  })
})

it('a sample says where the notification will appear', () => {
  expect(sampleMessage('en', '2026-10-13')).toEqual({
    title: 'Today', body: 'Nothing on your schedule today. Your morning notification will appear here.',
    url: '/admin', tag: 'today-2026-10-13', lang: 'en', dir: 'ltr',
  })
  expect(sampleMessage('ar', '2026-10-13')).toMatchObject({ title: 'اليوم', dir: 'rtl' })
})

it("uses the app's own words", () => {
  for (const [language, locale] of [['en', en], ['ar', ar]] as const) {
    expect(WORDS[language].today).toBe(locale.today.title)
    expect(WORDS[language].session).toBe(locale.schedule.session)
    expect(WORDS[language].plan).toBe(locale.schedule.plan)
    const counts = Object.fromEntries(Object.entries(locale.today).filter(([k]) => k.startsWith('count_')).map(([k, v]) => [k.slice(6), v]))
    expect(WORDS[language].count).toEqual(counts)
  }
})

// ===== The round

// 07:10 in Riyadh on Tuesday 13 October 2026
const NOW = new Date('2026-10-13T04:10:00Z')
const device = (over: Partial<CoachSub> = {}): CoachSub => ({
  id: 'd1', user_id: 'u1', endpoint: 'https://push.test/d1', p256dh: 'k', auth: 'a', time_zone: 'Asia/Riyadh',
  notify_hour: 7, notify_minute: 0, language: 'en', last_sent_on: null, coach: { enabled: true, features: ['schedule', 'training'] }, ...over,
})
// The outside world of a round, kept in memory, with everything that was asked of it
function world(devices: CoachSub[], days: Record<string, LeagueDay[]> = {}, answers: Record<string, SendResult | Error> = {}) {
  const log = { day: [] as string[], sent: [] as [string, PushMessage][], marked: [] as [string, string][], removed: [] as string[] }
  const deps: RoundDeps = {
    subscriptions: async () => devices,
    subscription: async (userId, endpoint) => devices.find((d) => d.user_id === userId && d.endpoint === endpoint) ?? null,
    day: async (userId, date, withPlans) => {
      log.day.push(`${userId}|${date}|${withPlans}`)
      const found = days[userId]
      if (!found) throw new Error('down')
      return found
    },
    send: async (sub, message) => {
      log.sent.push([sub.id, message])
      const answer = answers[sub.id] ?? 'sent'
      if (answer instanceof Error) throw answer
      return answer
    },
    markSent: async (id, date) => { log.marked.push([id, date]) },
    remove: async (id) => { log.removed.push(id) },
  }
  return { deps, log }
}
const gym: LeagueDay[] = [{ name: 'Eagles', slug: 'eagles', rows: [row({ title: 'Gym' })] }]
const nothing: LeagueDay[] = [{ name: 'Eagles', slug: 'eagles', rows: [] }]

describe('runRound', () => {
  it('sends to a due device and marks its day', async () => {
    const { deps, log } = world([device()], { u1: gym })
    expect(await runRound(deps, NOW)).toEqual({ due: 1, sent: 1, nothing: 0, gone: 0, failed: 0 })
    expect(log.sent.map(([id, message]) => [id, message.body])).toEqual([['d1', 'Gym']])
    expect(log.marked).toEqual([['d1', '2026-10-13']])
  })

  it("waits for a device's minutes", async () => {
    // It is 07:10: a device set to 07:15 is not due yet, one set to 07:00 is
    const { deps, log } = world([device({ notify_minute: 15 }), device({ id: 'd2' })], { u1: gym })
    expect(await runRound(deps, NOW)).toMatchObject({ due: 1, sent: 1 })
    expect(log.sent.map(([id]) => id)).toEqual(['d2'])
    const later = world([device({ notify_minute: 15 })], { u1: gym })
    expect(await runRound(later.deps, new Date('2026-10-13T04:15:00Z'))).toMatchObject({ due: 1, sent: 1 })
  })

  it('leaves a device that is not due alone', async () => {
    const { deps, log } = world([device({ notify_hour: 9 }), device({ id: 'd2', last_sent_on: '2026-10-13' })], { u1: gym })
    expect(await runRound(deps, NOW)).toEqual({ due: 0, sent: 0, nothing: 0, gone: 0, failed: 0 })
    expect(log.day).toEqual([])
    expect(log.sent).toEqual([])
  })

  it("reads a coach's day once for two devices", async () => {
    const { deps, log } = world([device(), device({ id: 'd2', endpoint: 'https://push.test/d2', language: 'ar' })], { u1: gym })
    expect(await runRound(deps, NOW)).toMatchObject({ due: 2, sent: 2 })
    expect(log.day).toEqual(['u1|2026-10-13|true'])
    expect(log.sent.map(([id, message]) => [id, message.lang])).toEqual([['d1', 'en'], ['d2', 'ar']])
    expect(log.marked).toEqual([['d1', '2026-10-13'], ['d2', '2026-10-13']])
  })

  it('reads two days for one coach whose devices are on different dates', async () => {
    const { deps, log } = world([
      device({ id: 'east', time_zone: 'Pacific/Kiritimati', notify_hour: 18 }), // 18:10 on the 13th
      device({ id: 'west', time_zone: 'Pacific/Pago_Pago', notify_hour: 17 }),  // 17:10 on the 12th
    ], { u1: gym })
    expect(await runRound(deps, NOW)).toMatchObject({ due: 2, sent: 2 })
    expect([...log.day].sort()).toEqual(['u1|2026-10-12|true', 'u1|2026-10-13|true'])
    expect([...log.marked].sort()).toEqual([['east', '2026-10-13'], ['west', '2026-10-12']])
  })

  it('marks the day and sends nothing when nothing is on', async () => {
    const { deps, log } = world([device()], { u1: nothing })
    expect(await runRound(deps, NOW)).toEqual({ due: 1, sent: 0, nothing: 1, gone: 0, failed: 0 })
    expect(log.sent).toEqual([])
    expect(log.marked).toEqual([['d1', '2026-10-13']])
  })

  it('removes a device whose address is gone', async () => {
    const { deps, log } = world([device()], { u1: gym }, { d1: 'gone' })
    expect(await runRound(deps, NOW)).toEqual({ due: 1, sent: 0, nothing: 0, gone: 1, failed: 0 })
    expect(log.removed).toEqual(['d1'])
    expect(log.marked).toEqual([])
  })

  it('leaves a failed send for the next run, and goes on', async () => {
    const { deps, log } = world([device(), device({ id: 'd2', user_id: 'u2' })], { u1: gym, u2: gym }, { d1: 'failed' })
    expect(await runRound(deps, NOW)).toEqual({ due: 2, sent: 1, nothing: 0, gone: 0, failed: 1 })
    expect(log.marked).toEqual([['d2', '2026-10-13']])
    expect(log.removed).toEqual([])
  })

  it('a send that throws, and a day that cannot be read, count as failed and stop nobody', async () => {
    const { deps, log } = world(
      [device(), device({ id: 'd2', user_id: 'u2' }), device({ id: 'd3', user_id: 'u3' })],
      { u1: gym, u3: gym }, // u2's day cannot be read
      { d1: new Error('boom') },
    )
    expect(await runRound(deps, NOW)).toEqual({ due: 3, sent: 1, nothing: 0, gone: 0, failed: 2 })
    expect(log.marked).toEqual([['d3', '2026-10-13']])
  })

  it('a write that fails after a send stops nobody either', async () => {
    const { deps, log } = world([device(), device({ id: 'd2', user_id: 'u2' })], { u1: gym, u2: gym })
    const mark = deps.markSent
    deps.markSent = async (id, date) => { if (id === 'd1') throw new Error('down'); return mark(id, date) }
    expect(await runRound(deps, NOW)).toEqual({ due: 2, sent: 1, nothing: 0, gone: 0, failed: 1 })
    expect(log.marked).toEqual([['d2', '2026-10-13']])
  })

  it('skips a coach who is disabled or lost the schedule', async () => {
    const { deps, log } = world([
      device({ coach: { enabled: false, features: ['schedule'] } }),
      device({ id: 'd2', user_id: 'u2', coach: { enabled: true, features: ['training'] } }),
    ], { u1: gym, u2: gym })
    expect(await runRound(deps, NOW)).toEqual({ due: 0, sent: 0, nothing: 0, gone: 0, failed: 0 })
    expect(log.day).toEqual([])
  })

  it('does not read training plans for a coach without training', async () => {
    const { deps, log } = world([device({ coach: { enabled: true, features: ['schedule'] } })], { u1: gym })
    await runRound(deps, NOW)
    expect(log.day).toEqual(['u1|2026-10-13|false'])
  })

  it('skips a device whose time zone cannot be read, and goes on', async () => {
    const { deps, log } = world([device({ time_zone: 'Not a zone!' }), device({ id: 'd2' })], { u1: gym })
    expect(await runRound(deps, NOW)).toEqual({ due: 1, sent: 1, nothing: 0, gone: 0, failed: 0 })
    expect(log.sent.map(([id]) => id)).toEqual(['d2'])
  })
})

describe('runTest', () => {
  it("sends today's items to the caller's own device whatever the hour, and marks nothing", async () => {
    const { deps, log } = world([device({ notify_hour: 20, last_sent_on: '2026-10-13' })], { u1: gym })
    expect(await runTest(deps, 'u1', 'https://push.test/d1', NOW)).toBe('sent')
    expect(log.sent.map(([id, message]) => [id, message.body])).toEqual([['d1', 'Gym']])
    expect(log.day).toEqual(['u1|2026-10-13|true'])
    expect(log.marked).toEqual([])
  })

  it('sends the sample on an empty day', async () => {
    const { deps, log } = world([device()], { u1: nothing })
    expect(await runTest(deps, 'u1', 'https://push.test/d1', NOW)).toBe('sent')
    expect(log.sent[0][1].body).toBe('Nothing on your schedule today. Your morning notification will appear here.')
  })

  it("finds nothing for another coach's device, or an unknown one", async () => {
    const { deps, log } = world([device()], { u1: gym, u2: gym })
    expect(await runTest(deps, 'u2', 'https://push.test/d1', NOW)).toBe('notFound')
    expect(await runTest(deps, 'u1', 'https://push.test/unknown', NOW)).toBe('notFound')
    expect(log.sent).toEqual([])
  })

  it('removes a device whose address is gone', async () => {
    const { deps, log } = world([device()], { u1: gym }, { d1: 'gone' })
    expect(await runTest(deps, 'u1', 'https://push.test/d1', NOW)).toBe('gone')
    expect(log.removed).toEqual(['d1'])
  })

  it('reports a failed send, and one that throws, as failed', async () => {
    expect(await runTest(world([device()], { u1: gym }, { d1: 'failed' }).deps, 'u1', 'https://push.test/d1', NOW)).toBe('failed')
    expect(await runTest(world([device()], { u1: gym }, { d1: new Error('boom') }).deps, 'u1', 'https://push.test/d1', NOW)).toBe('failed')
    expect(await runTest(world([device()], {}).deps, 'u1', 'https://push.test/d1', NOW)).toBe('failed') // the day cannot be read
  })

  it("reads only the caller's device, not every device", async () => {
    const { deps } = world([device()], { u1: gym })
    deps.subscriptions = async () => { throw new Error('reads every device') }
    expect(await runTest(deps, 'u1', 'https://push.test/d1', NOW)).toBe('sent')
  })

  it("uses today's date in UTC for a device whose time zone cannot be read", async () => {
    const { deps, log } = world([device({ time_zone: 'Not a zone!' })], { u1: gym })
    expect(await runTest(deps, 'u1', 'https://push.test/d1', NOW)).toBe('sent')
    expect(log.day).toEqual(['u1|2026-10-13|true'])
  })
})

describe('callerKind', () => {
  const SECRET = 'a-long-job-secret-0123456789'
  it('knows the job by its secret, and anyone else with a token as a user', () => {
    expect(callerKind(`Bearer ${SECRET}`, SECRET)).toBe('job')
    expect(callerKind('Bearer some.user.session', SECRET)).toBe('user')
    expect(callerKind(`Bearer ${SECRET}x`, SECRET)).toBe('user')
    expect(callerKind(`Bearer ${SECRET.slice(0, -1)}`, SECRET)).toBe('user')
  })
  it('lets nobody in without a bearer token', () => {
    expect(callerKind(null, SECRET)).toBe('none')
    expect(callerKind('', SECRET)).toBe('none')
    expect(callerKind('Bearer ', SECRET)).toBe('none')
    expect(callerKind('Basic abc', SECRET)).toBe('none')
  })
  it('a function deployed without its secret, or with a short one, has no job', () => {
    expect(callerKind('Bearer ', '')).toBe('none')
    expect(callerKind('Bearer ', undefined)).toBe('none')
    expect(callerKind('Bearer short', 'short')).toBe('user')
    expect(callerKind('Bearer undefined', undefined)).toBe('user')
  })
})

// A push address that takes the connection and never answers (any https address can be saved)
describe('a send that never answers', () => {
  const stuck = (deps: RoundDeps, id: string) => {
    const send = deps.send
    deps.send = (sub, message) => (sub.id === id ? new Promise<SendResult>(() => {}) : send(sub, message))
  }
  afterEach(() => vi.useRealTimers())

  it('is given up after ten seconds and counted as failed, and does not hold up the next device', async () => {
    vi.useFakeTimers()
    const { deps, log } = world([device(), device({ id: 'd2', user_id: 'u2' })], { u1: gym, u2: gym })
    stuck(deps, 'd1')
    const round = runRound(deps, NOW)
    let over = false
    round.then(() => { over = true })
    await vi.advanceTimersByTimeAsync(0)
    expect(log.marked).toEqual([['d2', '2026-10-13']])
    await vi.advanceTimersByTimeAsync(9_999)
    expect(over).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await round).toEqual({ due: 2, sent: 1, nothing: 0, gone: 0, failed: 1 })
    expect(log.marked).toEqual([['d2', '2026-10-13']])
  })

  it(`serves ${SEND_AT_ONCE} devices at once, so many that never answer cannot use up the run`, async () => {
    vi.useFakeTimers()
    const many = Array.from({ length: SEND_AT_ONCE * 2 + 5 }, (_, i) => device({ id: `d${i}`, user_id: `u${i}` }))
    const { deps, log } = world(many, Object.fromEntries(many.map((d) => [d.user_id, gym])))
    deps.send = (sub, message) => { log.sent.push([sub.id, message]); return new Promise<SendResult>(() => {}) }
    const round = runRound(deps, NOW)
    await vi.advanceTimersByTimeAsync(0)
    expect(log.sent).toHaveLength(SEND_AT_ONCE)
    // Three turns of ten seconds, not one per device
    await vi.advanceTimersByTimeAsync(30_000)
    expect(await round).toMatchObject({ due: many.length, failed: many.length })
  })

  it('a test send gives up too', async () => {
    vi.useFakeTimers()
    const { deps } = world([device()], { u1: gym })
    stuck(deps, 'd1')
    const test = runTest(deps, 'u1', 'https://push.test/d1', NOW)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await test).toBe('failed')
  })

  it('a send that answers in time leaves no timer behind', async () => {
    vi.useFakeTimers()
    const { deps } = world([device()], { u1: gym })
    expect(await runRound(deps, NOW)).toMatchObject({ sent: 1 })
    expect(vi.getTimerCount()).toBe(0)
  })
})
