// The morning notification: who is due for it, and what it says. Pure, so the same code is
// tested with the app's tests and runs in the server function (Deno): this file imports only
// its neighbours, by their full name.
import type { TodayRow } from './scheduleDay.ts'

export type PushLanguage = 'en' | 'ar'

// A device that wants the morning notification (a row of push_subscriptions)
export interface PushSub {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  // An IANA name such as 'Asia/Riyadh'
  time_zone: string
  // The hour chosen, 0–23, on the device's own clock
  notify_hour: number
  language: PushLanguage
  // The device's local day last handled
  last_sent_on: string | null
}

// A device with what the round needs to know about its coach
export interface CoachSub extends PushSub { coach: { enabled: boolean; features: string[] } }

// One of the coach's leagues with what is on that day in it
export interface LeagueDay { name: string; slug: string; rows: TodayRow[] }

// What the service worker is sent (public/push-sw.js shows it)
export interface PushMessage { title: string; body: string; url: string; tag: string; lang: PushLanguage; dir: 'ltr' | 'rtl' }

// ===== The words. They are the app's own (src/locales), copied here because the function
// cannot load the app's files; a test holds the two equal.

export const WORDS: Record<PushLanguage, { today: string; session: string; plan: string; more: string; sample: string; count: Record<string, string> }> = {
  en: {
    today: 'Today',
    session: 'Match session',
    plan: 'Training plan',
    more: '+{{count}} more',
    sample: 'Nothing on your schedule today. Your morning notification will appear here.',
    count: { one: '1 item', other: '{{count}} items' },
  },
  ar: {
    today: 'اليوم',
    session: 'جلسة مباريات',
    plan: 'خطة تدريب',
    more: '+{{count}} أخرى',
    sample: 'لا شيء في جدولك اليوم. هنا سيظهر إشعار الصباح.',
    count: {
      zero: '{{count}} عنصر',
      one: 'عنصر واحد',
      two: 'عنصران',
      few: '{{count}} عناصر',
      many: '{{count}} عنصراً',
      other: '{{count}} عنصر',
    },
  },
}

// ===== Who is due

// The date ('2026-10-13') and hour (0–23) on the clock of a time zone; null for a zone that
// cannot be read (a damaged value, or a name this runtime does not know)
export function localClock(timeZone: string, now: Date): { date: string; hour: number } | null {
  if (!timeZone) return null
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
    }).formatToParts(now)
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
    const date = `${part('year')}-${part('month')}-${part('day')}`
    const hour = Number(part('hour'))
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isInteger(hour) && hour >= 0 && hour <= 23 ? { date, hour } : null
  } catch {
    return null
  }
}

// The local day a device is due for, or null when it is not due now. It is due from its hour
// to the end of the hour after it (so a failed send is tried again), once a day. The hour
// after 23 belongs to the next day, so for 23 the window is that one hour.
export function dueDate(sub: Pick<PushSub, 'time_zone' | 'notify_hour' | 'last_sent_on'>, now: Date): string | null {
  const clock = localClock(sub.time_zone, now)
  if (!clock) return null
  const inWindow = clock.hour === sub.notify_hour || clock.hour === sub.notify_hour + 1
  return inWindow && sub.last_sent_on !== clock.date ? clock.date : null
}

// ===== What it says

const MAX_LINES = 5
// The push services refuse a message above about 4 KB; with every line cut here, five long
// titles with long league names still fit several times over
const MAX_LINE = 80

const cut = (line: string) => {
  const characters = [...line]
  return characters.length > MAX_LINE ? `${characters.slice(0, MAX_LINE - 1).join('')}…` : line
}
const counted = (text: string, count: number) => text.replace('{{count}}', String(count))

function rowText(language: PushLanguage, row: TodayRow): string {
  const words = WORDS[language]
  if (row.kind === 'session') return words.session
  if (row.kind === 'plan') return row.title ? `${words.plan}: ${row.title}` : words.plan
  return row.time ? `${row.time} ${row.title ?? ''}` : row.title ?? ''
}

const frame = (language: PushLanguage, date: string) =>
  ({ tag: `today-${date}`, lang: language, dir: language === 'ar' ? 'rtl' as const : 'ltr' as const })

// The notification for a day; null when no league has anything on it
export function buildMessage(language: PushLanguage, date: string, leagues: LeagueDay[]): PushMessage | null {
  const busy = leagues.filter((league) => league.rows.length > 0)
  if (busy.length === 0) return null
  const words = WORDS[language]
  // With something in more than one league, every line says which
  const lines = busy.flatMap((league) => league.rows.map((row) => `${busy.length > 1 ? `${league.name} · ` : ''}${rowText(language, row)}`))
  const shown = lines.slice(0, MAX_LINES).map(cut)
  if (lines.length > MAX_LINES) shown.push(counted(words.more, lines.length - MAX_LINES))
  const form = words.count[new Intl.PluralRules(language).select(lines.length)] ?? words.count.other
  return {
    title: `${words.today}: ${counted(form, lines.length)}`,
    body: shown.join('\n'),
    url: busy.length === 1 ? `/admin/${busy[0].slug}/schedule` : '/admin',
    ...frame(language, date),
  }
}

// What a test send shows on a day with nothing on it
export function sampleMessage(language: PushLanguage, date: string): PushMessage {
  return { title: WORDS[language].today, body: WORDS[language].sample, url: '/admin', ...frame(language, date) }
}

// ===== The round: everything the function decides, with its outside calls handed in

export type SendResult = 'sent' | 'gone' | 'failed'

export interface RoundDeps {
  // Every device, with its coach's state
  subscriptions(): Promise<CoachSub[]>
  // What is on a day in each of a coach's leagues
  day(userId: string, date: string, withPlans: boolean): Promise<LeagueDay[]>
  // 'gone' when the push service says the address no longer exists
  send(sub: PushSub, message: PushMessage): Promise<SendResult>
  markSent(id: string, date: string): Promise<void>
  remove(id: string): Promise<void>
}

export interface RoundResult { due: number; sent: number; nothing: number; gone: number; failed: number }

// How long one send may take. Any https address can be saved as a device, and one that takes
// the connection and never answers must not hold up every device after it.
export const SEND_LIMIT_MS = 10_000

function limited(send: Promise<SendResult>): Promise<SendResult> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<SendResult>((resolve) => { timer = setTimeout(() => resolve('failed'), SEND_LIMIT_MS) })
  return Promise.race([send, late]).finally(() => clearTimeout(timer))
}

const allowed = (sub: CoachSub) => sub.coach.enabled && sub.coach.features.includes('schedule')
const withPlans = (sub: CoachSub) => sub.coach.features.includes('training')

// One run of the job: every device that is due gets its coach's day. A day with nothing on it
// is marked and nothing is sent; a device whose address is gone is removed; anything that
// fails is left for the next run and stops nobody else.
export async function runRound(deps: RoundDeps, now: Date): Promise<RoundResult> {
  const result: RoundResult = { due: 0, sent: 0, nothing: 0, gone: 0, failed: 0 }
  // A coach's day is read once, however many of his devices are due for it
  const days = new Map<string, Promise<LeagueDay[]>>()
  for (const sub of await deps.subscriptions()) {
    const date = allowed(sub) ? dueDate(sub, now) : null
    if (!date) continue
    result.due++
    try {
      const key = `${sub.user_id}|${date}`
      const day = days.get(key) ?? deps.day(sub.user_id, date, withPlans(sub))
      days.set(key, day)
      const message = buildMessage(sub.language, date, await day)
      if (!message) {
        await deps.markSent(sub.id, date)
        result.nothing++
        continue
      }
      const answer = await limited(deps.send(sub, message))
      if (answer === 'sent') {
        await deps.markSent(sub.id, date)
        result.sent++
      } else if (answer === 'gone') {
        await deps.remove(sub.id)
        result.gone++
      } else {
        result.failed++
      }
    } catch {
      result.failed++
    }
  }
  return result
}

// "Send a test now": today's items to one device of the caller, whatever its hour, without
// touching the day it was last handled; a sample when nothing is on
export async function runTest(deps: RoundDeps, userId: string, endpoint: string, now: Date): Promise<SendResult | 'notFound'> {
  const sub = (await deps.subscriptions()).find((s) => s.user_id === userId && s.endpoint === endpoint)
  if (!sub) return 'notFound'
  try {
    const date = localClock(sub.time_zone, now)?.date ?? now.toISOString().slice(0, 10)
    const leagues = await deps.day(userId, date, withPlans(sub))
    const answer = await limited(deps.send(sub, buildMessage(sub.language, date, leagues) ?? sampleMessage(sub.language, date)))
    if (answer === 'gone') await deps.remove(sub.id)
    return answer
  } catch {
    return 'failed'
  }
}

// ===== Who is calling the function

// A job secret shorter than this is no secret: a function deployed without one has no job
const SECRET_LENGTH = 16

// Compared without stopping at the first difference
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let difference = 0
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return difference === 0
}

// From the Authorization header: the job (it sends the function's own secret), someone with
// a session (checked by the function), or nobody
export function callerKind(authorization: string | null, secret: string | undefined): 'job' | 'user' | 'none' {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : ''
  if (!token) return 'none'
  return secret && secret.length >= SECRET_LENGTH && sameText(token, secret) ? 'job' : 'user'
}
