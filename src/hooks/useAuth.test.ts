import { act, renderHook, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Session } from '@supabase/supabase-js'

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

const session = (id: string) => ({ user: { id } }) as Session
const sessionResult = (value: Session | null) => ({ data: { session: value }, error: null })

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.mocked(supabase.auth.getSession).mockReset().mockResolvedValue(sessionResult(null))
  vi.mocked(supabase.auth.onAuthStateChange).mockClear()
})

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

  it('does not restore an old session after a sign-out event', async () => {
    const initial = deferred<ReturnType<typeof sessionResult>>()
    vi.mocked(supabase.auth.getSession).mockReturnValue(initial.promise)
    const { result } = renderHook(() => useAuth())
    const onChange = vi.mocked(supabase.auth.onAuthStateChange).mock.calls[0][0]

    act(() => { onChange('SIGNED_OUT', null) })
    await act(async () => { initial.resolve(sessionResult(session('old-user'))) })

    expect(result.current.loading).toBe(false)
    expect(result.current.user).toBeNull()
  })

  it('does not overwrite a new sign-in with the initial session lookup', async () => {
    const initial = deferred<ReturnType<typeof sessionResult>>()
    vi.mocked(supabase.auth.getSession).mockReturnValue(initial.promise)
    const { result } = renderHook(() => useAuth())
    const onChange = vi.mocked(supabase.auth.onAuthStateChange).mock.calls[0][0]

    act(() => { onChange('SIGNED_IN', session('new-user')) })
    await act(async () => { initial.resolve(sessionResult(null)) })

    expect(result.current.loading).toBe(false)
    expect(result.current.user?.id).toBe('new-user')
  })

  it('settles loading when the initial session lookup rejects', async () => {
    vi.mocked(supabase.auth.getSession).mockRejectedValue(new Error('session unavailable'))
    const { result } = renderHook(() => useAuth())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).toBeNull()
  })

  it('keeps a newer auth event when the initial session lookup rejects', async () => {
    const initial = deferred<ReturnType<typeof sessionResult>>()
    vi.mocked(supabase.auth.getSession).mockReturnValue(initial.promise)
    const { result } = renderHook(() => useAuth())
    const onChange = vi.mocked(supabase.auth.onAuthStateChange).mock.calls[0][0]

    act(() => { onChange('SIGNED_IN', session('new-user')) })
    await act(async () => { initial.reject(new Error('session unavailable')) })

    expect(result.current.loading).toBe(false)
    expect(result.current.user?.id).toBe('new-user')
  })

  it('ignores results and auth callbacks from an effect that has been cleaned up', async () => {
    const initial = deferred<ReturnType<typeof sessionResult>>()
    vi.mocked(supabase.auth.getSession)
      .mockReturnValueOnce(initial.promise)
      .mockResolvedValueOnce(sessionResult(session('current-user')))
    const { result } = renderHook(() => useAuth(), {
      reactStrictMode: true,
    })
    await waitFor(() => expect(result.current.user?.id).toBe('current-user'))

    const oldOnChange = vi.mocked(supabase.auth.onAuthStateChange).mock.calls[0][0]
    await act(async () => {
      oldOnChange('SIGNED_OUT', null)
      initial.resolve(sessionResult(session('old-user')))
    })
    expect(result.current.user?.id).toBe('current-user')
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
