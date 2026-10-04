import { renderHook } from '@testing-library/react'
import { vi, beforeEach } from 'vitest'
import { useEndAlert } from './useEndAlert'

const vibrate = vi.fn()

beforeEach(() => {
  vibrate.mockClear()
  Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
})

it('alerts once when the end condition becomes true', () => {
  const { rerender } = renderHook(({ end }) => useEndAlert('m1', end), { initialProps: { end: false } })
  rerender({ end: true })
  rerender({ end: true })
  expect(vibrate).toHaveBeenCalledTimes(1)
})

it('does not alert when a match is opened that has already reached its end condition', () => {
  renderHook(() => useEndAlert('m1', true))
  expect(vibrate).not.toHaveBeenCalled()
})

it('does not alert when switching to a different match that is already over', () => {
  const { rerender } = renderHook(({ id, end }) => useEndAlert(id, end), { initialProps: { id: 'm1', end: false } })
  rerender({ id: 'm2', end: true })
  expect(vibrate).not.toHaveBeenCalled()
})
