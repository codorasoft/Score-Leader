import { supabase } from './supabase'
import { selectAllOrThrow as allRows } from './selectAll'
import type { CoachEntry, CoachEvent, CoachEventKind, MatchType, Player } from './types'

// The coach's trainings and matches (supabase/migrations/20261031000001_coach_evaluation.sql).

const EVENT_COLUMNS = 'id, league_id, kind, event_date, title, match_type, our_score, their_score, lineup_id'
const ENTRY_COLUMNS = 'event_id, player_id, attendance, role, position, rating, goals, assists'

export interface CoachData { players: Player[]; events: CoachEvent[]; entries: CoachEntry[] }

// Throws when a request fails. Days newest first.
export async function fetchCoachData(leagueId: string): Promise<CoachData> {
  const [players, events, entries] = await Promise.all([
    allRows<Player>((from, to) =>
      supabase.from('players').select('*').eq('league_id', leagueId).order('name').order('id').range(from, to)),
    allRows<CoachEvent>((from, to) =>
      supabase.from('coach_events').select(EVENT_COLUMNS).eq('league_id', leagueId)
        .order('event_date', { ascending: false }).order('created_at', { ascending: false }).order('id').range(from, to)),
    allRows<CoachEntry>((from, to) =>
      supabase.from('coach_event_players').select(ENTRY_COLUMNS).eq('league_id', leagueId)
        .order('event_id').order('player_id').range(from, to)),
  ])
  return { players, events, entries }
}

// Throws when a request fails; null means this league has no such day.
export async function fetchCoachEvent(id: string, leagueId: string): Promise<{ event: CoachEvent; entries: CoachEntry[] } | null> {
  const { data, error } = await supabase.from('coach_events').select(EVENT_COLUMNS).eq('id', id).eq('league_id', leagueId).maybeSingle()
  if (error) throw error
  if (!data) return null
  const rows = await supabase.from('coach_event_players').select(ENTRY_COLUMNS).eq('event_id', id)
  if (rows.error) throw rows.error
  return { event: data as CoachEvent, entries: (rows.data ?? []) as CoachEntry[] }
}

export interface CoachEventInput {
  kind: CoachEventKind
  event_date: string
  title: string
  match_type: MatchType | null
  our_score: number | null
  their_score: number | null
  lineup_id: string | null
  players: Omit<CoachEntry, 'event_id'>[]
}

// Saves a day and its players together (public.save_coach_event); id null makes a new one.
// The day's id, or null when it could not be saved.
export async function saveCoachEvent(id: string | null, leagueId: string, input: CoachEventInput): Promise<string | null> {
  const { data, error } = await supabase.rpc('save_coach_event', {
    p_id: id,
    p_league_id: leagueId,
    p_kind: input.kind,
    p_date: input.event_date,
    p_title: input.title,
    p_match_type: input.kind === 'match' ? input.match_type : null,
    p_our_score: input.kind === 'match' ? input.our_score : null,
    p_their_score: input.kind === 'match' ? input.their_score : null,
    p_lineup_id: input.kind === 'match' ? input.lineup_id : null,
    p_players: input.players,
  })
  if (error) return null
  return typeof data === 'string' ? data : id
}

export async function deleteCoachEvent(id: string): Promise<boolean> {
  const { error } = await supabase.from('coach_events').delete().eq('id', id)
  return !error
}

export interface LineupOption { id: string; name: string }

// The league's coach boards, to line a match up from. Throws when the request fails.
export async function fetchLineupOptions(leagueId: string): Promise<LineupOption[]> {
  const { data, error } = await supabase.from('lineups').select('id, name').eq('league_id', leagueId).order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as LineupOption[]
}

export interface LineupSpot { player_id: string; y: number; bench_order: number | null }

// Who is on a board's pitch and who is on its bench. Throws when the request fails.
export async function fetchLineupSpots(lineupId: string): Promise<LineupSpot[]> {
  const { data, error } = await supabase.from('lineup_players').select('player_id, y, bench_order').eq('lineup_id', lineupId)
  if (error) throw error
  return (data ?? []) as LineupSpot[]
}
