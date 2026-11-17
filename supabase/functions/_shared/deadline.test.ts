import { vi } from 'vitest'
import { deadline } from './deadline'

afterEach(() => { vi.useRealTimers() })

it('cancels the work when the time runs out, and says so', () => {
  vi.useFakeTimers()
  const d = deadline(new AbortController().signal, 10_000)
  vi.advanceTimersByTime(9_999)
  expect(d.signal.aborted).toBe(false)
  vi.advanceTimersByTime(1)
  expect(d.signal.aborted).toBe(true)
  expect(d.reason()).toBe('timeout')
})

it('cancels the work when the caller goes away', () => {
  const caller = new AbortController()
  const d = deadline(caller.signal, 10_000)
  caller.abort()
  expect(d.signal.aborted).toBe(true)
  expect(d.reason()).toBe('cancelled')
  d.done()
})

it('starts cancelled for a caller already gone', () => {
  const caller = new AbortController()
  caller.abort()
  expect(deadline(caller.signal, 10_000).reason()).toBe('cancelled')
})

it('leaves nothing running once the work is done', () => {
  vi.useFakeTimers()
  const caller = new AbortController()
  const d = deadline(caller.signal, 10_000)
  d.done()
  expect(vi.getTimerCount()).toBe(0)
  caller.abort()
  vi.advanceTimersByTime(20_000)
  expect(d.signal.aborted).toBe(false)
  expect(d.reason()).toBeNull()
})
