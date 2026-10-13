// The morning notification's reads and writes, over a database client that is handed in: the
// server function gives its service-role client, the tests an in-memory stand-in. Runs in
// Deno: this file imports only its neighbours, by their full name.
import { todayRows, type ScheduleItem } from './scheduleDay.ts'
import type { CoachSub, LeagueDay, PushSub, RoundDeps } from './morningPush.ts'

// The few calls used here (select, eq, in, lte, order, update, delete, maybeSingle), loosely
// typed so that the real client and the tests' stand-in both fit
// deno-lint-ignore no-explicit-any
export interface DataClient { from(table: string): any }

interface Answer<T> { data: T | null; error: unknown }

// A read that failed must not look like "nothing there": a day wrongly read as empty would be
// marked as handled, and the coach would hear nothing
function rowsOf<T>(answer: Answer<T[]>, what: string): T[] {
  if (answer.error || !answer.data) throw new Error(`${what} could not be read`)
  return answer.data
}

export const DEVICE_COLUMNS = 'id, user_id, endpoint, p256dh, auth, time_zone, notify_hour, notify_minute, language, last_sent_on'
const ITEM_COLUMNS = 'id, league_id, kind, title, item_date, start_time, end_time, note, repeat_days, repeat_every, repeat_monthly, repeat_until, skipped_dates, done_dates'

interface Profile { user_id: string; role: string; is_disabled: boolean; features: string[] }
const isCoach = (profile: Profile | undefined | null): profile is Profile => !!profile && profile.role === 'admin' && !profile.is_disabled

export function roundDeps(client: DataClient, send: RoundDeps['send']): RoundDeps {
  return {
    send,

    async subscriptions(): Promise<CoachSub[]> {
      const devices = rowsOf<PushSub>(await client.from('push_subscriptions').select(DEVICE_COLUMNS).order('created_at').order('id'), 'the devices')
      if (devices.length === 0) return []
      const profiles = rowsOf<Profile>(
        await client.from('admin_profiles').select('user_id, role, is_disabled, features').in('user_id', [...new Set(devices.map((d) => d.user_id))]),
        'the coaches',
      )
      const byId = new Map(profiles.map((p) => [p.user_id, p]))
      return devices.map((device) => {
        const profile = byId.get(device.user_id)
        return { ...device, coach: { enabled: isCoach(profile), features: profile?.features ?? [] } }
      })
    },

    // Every league the coach owns, in the order they were made, with what is on that day in it
    async day(userId: string, date: string, withPlans: boolean): Promise<LeagueDay[]> {
      const leagues = rowsOf<{ id: string; name: string; slug: string }>(
        await client.from('leagues').select('id, name, slug, created_at').eq('owner_id', userId).order('created_at').order('id'),
        'the leagues',
      )
      if (leagues.length === 0) return []
      const ids = leagues.map((l) => l.id)
      // Every question goes out at once. Plain items dated that day; repeating ones that have
      // started (those already ended are dropped below, as the app does).
      const [plain, repeating, sessions, plans] = await Promise.all([
        client.from('schedule_items').select(ITEM_COLUMNS).in('league_id', ids).eq('repeats', false).eq('item_date', date),
        client.from('schedule_items').select(ITEM_COLUMNS).in('league_id', ids).eq('repeats', true).lte('item_date', date),
        client.from('sessions').select('id, league_id, date').in('league_id', ids).eq('date', date),
        withPlans
          ? client.from('trainings').select('id, league_id, training_date, title').in('league_id', ids).eq('training_date', date)
          : { data: [], error: null },
      ])
      type InLeague<T> = T & { league_id: string }
      const items = [
        ...rowsOf<InLeague<ScheduleItem>>(plain, 'the schedule'),
        ...rowsOf<InLeague<ScheduleItem>>(repeating, 'the schedule').filter((i) => !i.repeat_until || i.repeat_until >= date),
      ]
      const daySessions = rowsOf<InLeague<{ id: string; date: string }>>(sessions, 'the sessions')
      const dayPlans = rowsOf<InLeague<{ id: string; training_date: string; title: string | null }>>(plans, 'the training plans')
      const of = <T extends { league_id: string }>(list: T[], league: string) => list.filter((row) => row.league_id === league)
      return leagues.map((league) => ({
        name: league.name,
        slug: league.slug,
        rows: todayRows(of(items, league.id), { sessions: of(daySessions, league.id), plans: of(dayPlans, league.id) }, date),
      }))
    },

    async markSent(id: string, date: string): Promise<void> {
      const { error } = await client.from('push_subscriptions').update({ last_sent_on: date }).eq('id', id)
      if (error) throw new Error('the day could not be marked')
    },

    async remove(id: string): Promise<void> {
      const { error } = await client.from('push_subscriptions').delete().eq('id', id)
      if (error) throw new Error('the device could not be removed')
    },
  }
}

// For "Send a test now": the caller must be an enabled admin with the schedule
export async function coachIsAllowed(client: DataClient, userId: string): Promise<boolean> {
  const { data, error } = await client.from('admin_profiles').select('user_id, role, is_disabled, features').eq('user_id', userId).maybeSingle()
  return !error && isCoach(data as Profile | null) && (data as Profile).features.includes('schedule')
}
