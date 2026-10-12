import { supabase } from './supabase'
import { selectAllOrThrow as allRows } from './selectAll'
import type { ScheduleExtras, ScheduleItem, ScheduleRow } from '../utils/schedule'

// The coach's schedule in the database. Which day an item is on is worked out in
// src/utils/schedule.ts; here the rows are read for a range of days and written.

const COLUMNS = 'id, kind, title, item_date, start_time, end_time, note, repeat_days, repeat_every, repeat_monthly, repeat_until, skipped_dates, done_dates'

// Throws when a request fails. Every item that can be on a day between `from` and `to`:
// plain items dated inside the range, and repeating ones that have started and not yet ended.
export async function fetchScheduleItems(leagueId: string, from: string, to: string): Promise<ScheduleItem[]> {
  const [plain, repeating] = await Promise.all([
    allRows<ScheduleItem>((a, b) =>
      supabase.from('schedule_items').select(COLUMNS).eq('league_id', leagueId).eq('repeats', false)
        .gte('item_date', from).lte('item_date', to).order('item_date').order('id').range(a, b)),
    allRows<ScheduleItem>((a, b) =>
      supabase.from('schedule_items').select(COLUMNS).eq('league_id', leagueId).eq('repeats', true)
        .lte('item_date', to).order('item_date').order('id').range(a, b)),
  ])
  return [...plain, ...repeating.filter((i) => !i.repeat_until || i.repeat_until >= from)]
}

// Throws when a request fails. The league's match sessions and, when it has training, its
// training plans dated inside the range.
export async function fetchScheduleExtras(leagueId: string, from: string, to: string, withPlans: boolean): Promise<ScheduleExtras> {
  const [sessions, plans] = await Promise.all([
    allRows<{ id: string; date: string }>((a, b) =>
      supabase.from('sessions').select('id, date').eq('league_id', leagueId)
        .gte('date', from).lte('date', to).order('date').order('id').range(a, b)),
    withPlans
      ? allRows<{ id: string; training_date: string; title: string | null }>((a, b) =>
        supabase.from('trainings').select('id, training_date, title').eq('league_id', leagueId)
          .gte('training_date', from).lte('training_date', to).order('training_date').order('id').range(a, b))
      : [],
  ])
  return {
    sessions: sessions.map(({ id, date }) => ({ id, date })),
    plans: plans.map(({ id, training_date, title }) => ({ id, training_date, title })),
  }
}

// id null adds a new item to the league; otherwise the item is changed where it is
export async function saveScheduleItem(leagueId: string, id: string | null, row: ScheduleRow): Promise<boolean> {
  const { error } = id
    ? await supabase.from('schedule_items').update({ ...row, updated_at: new Date().toISOString() }).eq('id', id)
    : await supabase.from('schedule_items').insert({ league_id: leagueId, ...row })
  return !error
}

// The whole item, every day of it
export async function deleteScheduleItem(id: string): Promise<boolean> {
  const { error } = await supabase.from('schedule_items').delete().eq('id', id)
  return !error
}

// One day of a repeating item; its other days stay
export async function skipDay(item: ScheduleItem, date: string): Promise<boolean> {
  const skipped_dates = [...new Set([...item.skipped_dates, date])]
  const { error } = await supabase.from('schedule_items').update({ skipped_dates }).eq('id', item.id)
  return !error
}

// Ticks or unticks the item on one day
export async function setDone(item: ScheduleItem, date: string, done: boolean): Promise<boolean> {
  const others = item.done_dates.filter((d) => d !== date)
  const done_dates = done ? [...others, date] : others
  const { error } = await supabase.from('schedule_items').update({ done_dates }).eq('id', item.id)
  return !error
}
