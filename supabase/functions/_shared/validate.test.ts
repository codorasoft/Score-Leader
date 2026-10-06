import { describe, it, expect } from 'vitest'
import { validateCreateAdmin, validateResetPassword, validateDeleteLeague } from './validate.ts'

const UUID = '123e4567-e89b-42d3-a456-426614174000'
const good = { email: '  Bob@Example.COM ', password: 'abcdefgh', display_name: ' Bob ', max_leagues: 2, features: ['awards', 'voting'] }

describe('validateCreateAdmin', () => {
  it('accepts a valid body and normalises', () => {
    const r = validateCreateAdmin(good)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.email).toBe('bob@example.com')
      expect(r.value.display_name).toBe('Bob')
    }
  })
  it.each([
    ['bad email', { ...good, email: 'nope' }],
    ['short password', { ...good, password: '1234567' }],
    ['empty name', { ...good, display_name: '   ' }],
    ['fractional max', { ...good, max_leagues: 1.5 }],
    ['negative max', { ...good, max_leagues: -1 }],
    ['missing dependency', { ...good, features: ['voting'] }],
    ['non-object', null],
  ])('rejects %s', (_n, body) => {
    expect(validateCreateAdmin(body).ok).toBe(false)
  })
})

describe('validateResetPassword', () => {
  it('accepts valid', () => {
    expect(validateResetPassword({ user_id: UUID, password: 'abcdefgh' }).ok).toBe(true)
  })
  it('rejects non-uuid', () => {
    expect(validateResetPassword({ user_id: 'x', password: 'abcdefgh' }).ok).toBe(false)
  })
  it('rejects short password', () => {
    expect(validateResetPassword({ user_id: UUID, password: 'abc' }).ok).toBe(false)
  })
})

describe('validateDeleteLeague', () => {
  it('accepts valid', () => {
    expect(validateDeleteLeague({ league_id: UUID, confirm_name: 'Eagles' }).ok).toBe(true)
  })
  it('lowercases league_id', () => {
    const r = validateDeleteLeague({ league_id: UUID.toUpperCase(), confirm_name: 'Eagles' })
    expect(r.ok && r.value.league_id).toBe(UUID)
  })
  it('rejects missing confirm_name', () => {
    expect(validateDeleteLeague({ league_id: UUID }).ok).toBe(false)
  })
})
