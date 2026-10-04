import { renderHook, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { useWakeLock } from './useWakeLock'

it('holds a screen wake lock while enabled and releases it when disabled', async () => {
  const release = vi.fn().mockResolvedValue(undefined)
  const request = vi.fn().mockResolvedValue({ release })
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })

  const { rerender } = renderHook(({ on }) => useWakeLock(on), { initialProps: { on: true } })
  await waitFor(() => expect(request).toHaveBeenCalledWith('screen'))

  rerender({ on: false })
  expect(release).toHaveBeenCalled()
})

it('does nothing on browsers without the Wake Lock API', () => {
  Object.defineProperty(navigator, 'wakeLock', { value: undefined, configurable: true })
  expect(() => renderHook(() => useWakeLock(true))).not.toThrow()
})
