import { act, renderHook } from '@testing-library/react'
import { vi } from 'vitest'
import { useLocalToday } from './useLocalToday'

const show = (state: 'visible' | 'hidden') => act(() => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
})

// Only the date is faked. It is half past eleven at night on Monday 12 October 2026
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 12, 23, 30))
})
afterEach(() => vi.useRealTimers())

it("gives the device's date, and the new day when the app comes back to the front after midnight", () => {
  const { result } = renderHook(() => useLocalToday())
  expect(result.current).toEqual({ today: '2026-10-12', wakes: 0 })
  vi.setSystemTime(new Date(2026, 9, 13, 0, 30))
  show('visible')
  expect(result.current).toEqual({ today: '2026-10-13', wakes: 1 })
})

it('counts every return to the front, also on the same day', () => {
  const { result } = renderHook(() => useLocalToday())
  show('visible')
  show('visible')
  expect(result.current).toEqual({ today: '2026-10-12', wakes: 2 })
})

it('going to the back changes nothing', () => {
  const { result } = renderHook(() => useLocalToday())
  vi.setSystemTime(new Date(2026, 9, 13, 0, 30))
  show('hidden')
  expect(result.current).toEqual({ today: '2026-10-12', wakes: 0 })
})

it('stops listening when it is no longer used', () => {
  const remove = vi.spyOn(document, 'removeEventListener')
  renderHook(() => useLocalToday()).unmount()
  expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  remove.mockRestore()
})
