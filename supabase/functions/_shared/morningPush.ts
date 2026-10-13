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
