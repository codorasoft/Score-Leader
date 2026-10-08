import { vi } from 'vitest'
import { db, resetDb } from '../test/fakeSupabase'
import { finishedLeague } from '../test/fixtures'

vi.mock('./supabase', async () => (await import('../test/fakeSupabase')).supabaseModule)

import { fetchLiveLink, fetchSession } from './sessionData'

const eagles = { id: 'L1', slug: 'eagles', name: 'Eagles', logo_url: null, features: ['leaderboard'], is_available: true }

beforeEach(() => resetDb({ ...finishedLeague(), league_directory: [eagles] }))

it('a live link fetches the league and the whole session in one request', async () => {
  const link = await fetchLiveLink('tok1')
  expect(link?.league).toEqual(eagles)
  expect(link?.session.session.id).toBe('s1')
  expect(link?.session.teams).toHaveLength(3)
  expect(link?.session.players.length).toBeGreaterThan(0)
  expect(db.reads).toBe(1)
})

it('the live page then gets that session without asking again, but only once', async () => {
  await fetchLiveLink('tok1')
  const first = await fetchSession('share_token', 'tok1')
  expect(first?.session.id).toBe('s1')
  expect(db.reads).toBe(1)
  // A live refresh must see fresh data
  await fetchSession('share_token', 'tok1')
  expect(db.reads).toBe(2)
})

it('an unknown link gives null, and no stale session is kept for it', async () => {
  expect(await fetchLiveLink('nope')).toBeNull()
  await fetchSession('share_token', 'tok1')
  expect(db.reads).toBe(2)
})
