import { vi } from 'vitest'

let result: unknown
const query = {
  select: () => query,
  eq: () => query,
  order: () => Promise.resolve(result),
  maybeSingle: () => Promise.resolve(result),
}
vi.mock('./supabase', () => ({ supabase: { from: () => query } }))

import { fetchMyLeagues, fetchMyProfile } from './tenancy'

describe('fetchMyProfile', () => {
  it('returns null when there is no profile row', async () => {
    result = { data: null, error: null }
    expect(await fetchMyProfile('u')).toBeNull()
  })
  it('throws when the request fails', async () => {
    result = { data: null, error: { message: 'Failed to fetch' } }
    await expect(fetchMyProfile('u')).rejects.toBeTruthy()
  })
})

describe('fetchMyLeagues', () => {
  it('returns an empty list when the admin has no league', async () => {
    result = { data: [], error: null }
    expect(await fetchMyLeagues()).toEqual([])
  })
  it('throws when the request fails', async () => {
    result = { data: null, error: { message: 'Failed to fetch' } }
    await expect(fetchMyLeagues()).rejects.toBeTruthy()
  })
})
