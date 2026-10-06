import { vi } from 'vitest'
import { cachedLoad, forgetCachedLeagues, forgetOnWrite, LEAGUE_CACHE_MS } from './leagueCache'

beforeEach(() => forgetCachedLeagues())

it('reuses a complete download while it is fresh', async () => {
  const load = vi.fn(async () => ({ value: 'data', complete: true }))
  let now = 1000
  expect(await cachedLoad('L1', load, () => now)).toBe('data')
  now += LEAGUE_CACHE_MS - 1
  expect(await cachedLoad('L1', load, () => now)).toBe('data')
  expect(load).toHaveBeenCalledTimes(1)
})

it('downloads again once the copy is stale', async () => {
  const load = vi.fn(async () => ({ value: 'data', complete: true }))
  let now = 1000
  await cachedLoad('L1', load, () => now)
  now += LEAGUE_CACHE_MS
  await cachedLoad('L1', load, () => now)
  expect(load).toHaveBeenCalledTimes(2)
})

it('shares one download between pages asking at the same time', async () => {
  const load = vi.fn(async () => ({ value: 'data', complete: true }))
  await Promise.all([cachedLoad('L1', load), cachedLoad('L1', load)])
  expect(load).toHaveBeenCalledTimes(1)
})

it('keeps leagues apart', async () => {
  const load = vi.fn(async () => ({ value: 'data', complete: true }))
  await cachedLoad('L1', load)
  await cachedLoad('L2', load)
  expect(load).toHaveBeenCalledTimes(2)
})

it('does not keep a download that had failed requests', async () => {
  const load = vi.fn(async () => ({ value: 'partial', complete: false }))
  expect(await cachedLoad('L1', load)).toBe('partial')
  await cachedLoad('L1', load)
  expect(load).toHaveBeenCalledTimes(2)
})

it('does not keep a download that threw', async () => {
  const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ value: 'data', complete: true })
  await expect(cachedLoad('L1', load)).rejects.toThrow('offline')
  expect(await cachedLoad('L1', load)).toBe('data')
})

it('forgets everything when asked (after the app saves a change)', async () => {
  const load = vi.fn(async () => ({ value: 'data', complete: true }))
  await cachedLoad('L1', load)
  forgetCachedLeagues()
  await cachedLoad('L1', load)
  expect(load).toHaveBeenCalledTimes(2)
})

it('a request that changes something clears the copies; reads do not', async () => {
  const load = vi.fn(async () => ({ value: 'data', complete: true }))
  const base = vi.fn(async () => new Response('{}'))
  const wrapped = forgetOnWrite(base as unknown as typeof fetch)

  await cachedLoad('L1', load)
  await wrapped('https://x.supabase.co/rest/v1/players?select=*')
  await wrapped('https://x.supabase.co/rest/v1/players', { method: 'HEAD' })
  await cachedLoad('L1', load)
  expect(load).toHaveBeenCalledTimes(1)

  await wrapped('https://x.supabase.co/rest/v1/match_events', { method: 'POST', body: '{}' })
  await cachedLoad('L1', load)
  expect(load).toHaveBeenCalledTimes(2)
  expect(base).toHaveBeenCalledTimes(3)
})
