import { vi } from 'vitest'

let result: unknown
const single = vi.fn(() => Promise.resolve(result))
vi.mock('./supabase', () => ({
  supabase: { from: () => ({ insert: () => ({ select: () => ({ single }) }) }) },
}))

import { createLeague } from './tenancy'

const input = { owner_id: 'u', name: 'N', slug: 'abc' }

describe('createLeague', () => {
  it('maps the league limit error', async () => {
    result = { data: null, error: { message: 'league limit reached' } }
    expect(await createLeague(input)).toEqual({ error: 'limit' })
  })
  it('maps a duplicate slug', async () => {
    result = { data: null, error: { code: '23505' } }
    expect(await createLeague(input)).toEqual({ error: 'taken' })
  })
  it('maps anything else to other', async () => {
    result = { data: null, error: { message: 'boom' } }
    expect(await createLeague(input)).toEqual({ error: 'other' })
  })
  it('returns the created league', async () => {
    result = { data: { id: 'L' }, error: null }
    expect(await createLeague(input)).toEqual({ league: { id: 'L' } })
  })
})
