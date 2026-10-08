import { afterEach, vi } from 'vitest'
import { serverNow, serverNowIso, syncServerClock } from './serverClock'

vi.mock('./supabase', () => ({ supabase: { rpc: async () => ({ data: null, error: null }) } }))

afterEach(async () => {
  await syncServerClock(async () => new Date(Date.now()).toISOString())
  vi.useRealTimers()
})

it('follows the server when this device clock is wrong', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-08T18:01:16Z')) // this device is 66 s fast
  await syncServerClock(async () => '2026-10-08T18:00:10Z')
  expect(serverNowIso()).toBe('2026-10-08T18:00:10.000Z')
  vi.advanceTimersByTime(5000)
  expect(serverNow()).toBe(Date.parse('2026-10-08T18:00:15Z'))
})

it('takes the middle of the round trip as the moment the server answered', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-08T18:00:00Z'))
  await syncServerClock(async () => {
    vi.advanceTimersByTime(200) // the answer took 200 ms to come back
    return '2026-10-08T18:00:00.100Z'
  })
  expect(serverNow() - Date.now()).toBe(0)
})

it('keeps the last known difference when the server cannot be reached', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-08T18:01:16Z'))
  await syncServerClock(async () => '2026-10-08T18:00:10Z')
  await syncServerClock(async () => null)
  expect(serverNowIso()).toBe('2026-10-08T18:00:10.000Z')
})
