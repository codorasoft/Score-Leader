import en from '../../../src/locales/en.json'
import ar from '../../../src/locales/ar.json'
import { buildMessage, dueDate, localClock, sampleMessage, WORDS, type LeagueDay } from './morningPush.ts'
import type { TodayRow } from './scheduleDay.ts'

const at = (iso: string) => new Date(iso)
const sub = (over = {}) => ({ time_zone: 'Asia/Riyadh', notify_hour: 7, last_sent_on: null as string | null, ...over })

describe('localClock', () => {
  it('reads the date and hour of a time zone', () => {
    expect(localClock('Asia/Riyadh', at('2026-10-13T04:10:00Z'))).toEqual({ date: '2026-10-13', hour: 7 })
    expect(localClock('America/New_York', at('2026-10-13T03:59:00Z'))).toEqual({ date: '2026-10-12', hour: 23 })
    expect(localClock('Asia/Kolkata', at('2026-10-13T18:45:00Z'))).toEqual({ date: '2026-10-14', hour: 0 })
    expect(localClock('UTC', at('2026-10-13T00:00:00Z'))).toEqual({ date: '2026-10-13', hour: 0 })
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
