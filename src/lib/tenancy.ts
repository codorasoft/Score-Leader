import { supabase } from './supabase'
import type { FeatureKey } from './features'

export type Role = 'superadmin' | 'admin'

export interface AdminProfile {
  user_id: string
  role: Role
  email: string
  display_name: string
  max_leagues: number
  features: FeatureKey[]
  is_disabled: boolean
  created_at: string
}

export interface League {
  id: string
  owner_id: string
  name: string
  slug: string
  logo_url: string | null
  created_at: string
}

export interface LeagueInfo {
  id: string
  slug: string
  name: string
  logo_url: string | null
  features: FeatureKey[]
  is_available: boolean
}

export async function fetchMyProfile(userId: string): Promise<AdminProfile | null> {
  const { data } = await supabase.from('admin_profiles').select('*').eq('user_id', userId).maybeSingle()
  return (data as AdminProfile | null) ?? null
}

export async function fetchMyLeagues(): Promise<League[]> {
  const { data } = await supabase.from('leagues').select('*').order('created_at')
  return (data as League[] | null) ?? []
}

async function fetchInfo(column: 'slug' | 'id', value: string): Promise<LeagueInfo | null> {
  const { data } = await supabase.from('league_directory').select('*').eq(column, value).maybeSingle()
  return (data as LeagueInfo | null) ?? null
}
export const fetchLeagueInfoBySlug = (slug: string) => fetchInfo('slug', slug)
export const fetchLeagueInfoById = (id: string) => fetchInfo('id', id)

export async function isSlugTaken(slug: string): Promise<boolean> {
  const { data } = await supabase.from('league_directory').select('id').eq('slug', slug).maybeSingle()
  return !!data
}

export async function createLeague(
  input: { owner_id: string; name: string; slug: string },
): Promise<{ league: League } | { error: 'limit' | 'taken' | 'other' }> {
  const { data, error } = await supabase.from('leagues').insert(input).select().single()
  if (error) {
    if (error.message?.includes('league limit reached')) return { error: 'limit' }
    if (error.code === '23505') return { error: 'taken' }
    return { error: 'other' }
  }
  return { league: data as League }
}

export async function updateLeague(id: string, values: { name?: string; logo_url?: string | null }): Promise<boolean> {
  const { error } = await supabase.from('leagues').update(values).eq('id', id)
  return !error
}

export async function fetchAdmins(): Promise<AdminProfile[]> {
  const { data } = await supabase.from('admin_profiles').select('*').eq('role', 'admin').order('created_at')
  return (data as AdminProfile[] | null) ?? []
}

export async function fetchAllLeagues(): Promise<(League & { session_count: number })[]> {
  const { data } = await supabase.from('leagues').select('*, sessions(count)').order('created_at')
  return ((data as (League & { sessions: { count: number }[] })[] | null) ?? []).map(({ sessions, ...league }) => ({
    ...league,
    session_count: sessions?.[0]?.count ?? 0,
  }))
}

export async function updateAdmin(
  userId: string,
  values: Partial<Pick<AdminProfile, 'features' | 'max_leagues' | 'is_disabled' | 'display_name'>>,
): Promise<boolean> {
  const { error } = await supabase.from('admin_profiles').update(values).eq('user_id', userId)
  return !error
}
