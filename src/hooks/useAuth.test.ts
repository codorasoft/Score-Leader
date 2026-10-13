import { act, renderHook, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signOut: vi.fn(),
    },
  },
}))
vi.mock('../lib/push', () => ({ forgetPush: vi.fn() }))

import { supabase } from '../lib/supabase'
import { forgetPush } from '../lib/push'
import { useAuth } from './useAuth'

describe('useAuth', () => {
  it('loading starts true', () => {
    const { result } = renderHook(() => useAuth())
    expect(result.current.loading).toBe(true)
  })

  it('user is null when no session', async () => {
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).toBeNull()
  })
})

// Signing out also stops this browser getting the coach's morning notification
describe('signOut', () => {
  const order: string[] = []
  beforeEach(() => {
    order.length = 0
    vi.mocked(supabase.auth.signOut).mockReset().mockImplementation(async () => { order.push('signed out'); return { error: null } })
    vi.mocked(forgetPush).mockReset()
  })
  afterEach(() => vi.useRealTimers())

  it("forgets this device's notification first, while the coach is still signed in", async () => {
    vi.mocked(forgetPush).mockImplementation(async () => { order.push('forgotten') })
    const { result } = renderHook(() => useAuth())
    await act(() => result.current.signOut())
    expect(order).toEqual(['forgotten', 'signed out'])
  })

  it('still signs out when forgetting fails', async () => {
    vi.mocked(forgetPush).mockRejectedValue(new Error('no connection'))
    const { result } = renderHook(() => useAuth())
    await act(() => result.current.signOut())
    expect(order).toEqual(['signed out'])
  })

  it('signs out after two seconds when forgetting never answers', async () => {
    vi.useFakeTimers()
    vi.mocked(forgetPush).mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useAuth())
    const signingOut = result.current.signOut()
    await vi.advanceTimersByTimeAsync(1999)
    expect(order).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    await signingOut
    expect(order).toEqual(['signed out'])
  })
})
