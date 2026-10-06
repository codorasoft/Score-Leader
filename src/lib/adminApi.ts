import { supabase } from './supabase'
import type { FeatureKey } from './features'

export type ApiResult = { ok: true } | { error: string }

async function call(name: string, body: Record<string, unknown>): Promise<ApiResult> {
  try {
    const { error } = await supabase.functions.invoke(name, { body })
    if (!error) return { ok: true }
    const context = (error as { context?: Response }).context
    const parsed = context ? await context.json().catch(() => null) : null
    return { error: typeof parsed?.error === 'string' ? parsed.error : 'network' }
  } catch {
    return { error: 'network' }
  }
}

export const createAdmin = (input: {
  email: string
  password: string
  display_name: string
  max_leagues: number
  features: FeatureKey[]
}) => call('create-admin', input)

export const resetAdminPassword = (userId: string, password: string) =>
  call('reset-admin-password', { user_id: userId, password })

export const deleteLeague = (leagueId: string, confirmName: string) =>
  call('delete-league', { league_id: leagueId, confirm_name: confirmName })
