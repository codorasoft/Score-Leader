import { isValidFeatureList, type FeatureKey } from './features.ts'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function asRecord(body: unknown): Record<string, unknown> | null {
  return body !== null && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null
}

export function validateCreateAdmin(body: unknown): Result<{
  email: string
  password: string
  display_name: string
  max_leagues: number
  features: FeatureKey[]
}> {
  const b = asRecord(body)
  if (!b) return { ok: false, error: 'invalid body' }
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : ''
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'invalid email' }
  if (typeof b.password !== 'string' || b.password.length < 8) {
    return { ok: false, error: 'password must be at least 8 characters' }
  }
  const display_name = typeof b.display_name === 'string' ? b.display_name.trim() : ''
  if (display_name.length < 1 || display_name.length > 80) {
    return { ok: false, error: 'display_name must be 1-80 characters' }
  }
  const max = b.max_leagues
  if (typeof max !== 'number' || !Number.isInteger(max) || max < 0 || max > 100) {
    return { ok: false, error: 'max_leagues must be an integer 0-100' }
  }
  if (!isValidFeatureList(b.features)) return { ok: false, error: 'invalid features' }
  return { ok: true, value: { email, password: b.password, display_name, max_leagues: max, features: b.features } }
}

export function validateResetPassword(body: unknown): Result<{ user_id: string; password: string }> {
  const b = asRecord(body)
  if (!b) return { ok: false, error: 'invalid body' }
  if (typeof b.user_id !== 'string' || !UUID_RE.test(b.user_id)) return { ok: false, error: 'invalid user_id' }
  if (typeof b.password !== 'string' || b.password.length < 8) {
    return { ok: false, error: 'password must be at least 8 characters' }
  }
  return { ok: true, value: { user_id: b.user_id, password: b.password } }
}

export function validateDeleteLeague(body: unknown): Result<{ league_id: string; confirm_name: string }> {
  const b = asRecord(body)
  if (!b) return { ok: false, error: 'invalid body' }
  if (typeof b.league_id !== 'string' || !UUID_RE.test(b.league_id)) return { ok: false, error: 'invalid league_id' }
  if (typeof b.confirm_name !== 'string' || b.confirm_name === '') return { ok: false, error: 'confirm_name required' }
  return { ok: true, value: { league_id: b.league_id.toLowerCase(), confirm_name: b.confirm_name } }
}
