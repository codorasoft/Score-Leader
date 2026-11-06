import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { vi } from 'vitest'
import type { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js'

interface Channel {
  change: () => void
  status: (status: REALTIME_SUBSCRIBE_STATES) => void
  on: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
}

const channels: Channel[] = []
const createChannel = vi.fn((_name: string, _options: unknown) => {
  const channel: Channel = {
    change: () => {},
    status: () => {},
    on: vi.fn((_event, _filter, cb: () => void) => { channel.change = cb; return channel }),
    subscribe: vi.fn((cb: Channel['status']) => { channel.status = cb; return channel }),
  }
  channels.push(channel)
  return channel
})
const removeChannel = vi.fn(async (_channel: unknown) => 'ok')
vi.mock('../lib/supabase', () => ({
  supabase: { channel: (name: string, options: unknown) => createChannel(name, options), removeChannel: (channel: unknown) => removeChannel(channel) },
}))

import { useRealtime } from './useRealtime'

const status = (channel: Channel, value: string) => act(() => channel.status(value as REALTIME_SUBSCRIBE_STATES))
const show = (value: 'visible' | 'hidden') => act(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value })
  document.dispatchEvent(new Event('visibilitychange'))
})

beforeEach(() => {
  channels.length = 0
  createChannel.mockClear()
  removeChannel.mockClear()
})
afterEach(() => {
  Reflect.deleteProperty(document, 'visibilityState')
  vi.restoreAllMocks()
})

it('listens for changes and catches up once the database subscription is ready', () => {
  const update = vi.fn()
  renderHook(() => useRealtime('matches', { column: 'session_id', value: 's1' }, update))
  expect(createChannel).toHaveBeenCalledWith('matches:session_id=eq.s1', {
    config: { postgres_changes_options: { wait: true } },
  })
  expect(channels[0].on).toHaveBeenCalledWith('postgres_changes', {
    event: '*', schema: 'public', table: 'matches', filter: 'session_id=eq.s1',
  }, expect.any(Function))
  expect(update).not.toHaveBeenCalled()
  status(channels[0], 'SUBSCRIBED')
  act(() => channels[0].change())
  expect(update).toHaveBeenCalledTimes(2)
})

it.each(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'])('recovers a missed score update after %s without waiting for another change event', (failure) => {
  let serverScore = 0
  const { result } = renderHook(() => {
    const [score, setScore] = useState(serverScore)
    useRealtime('matches', { column: 'session_id', value: 's1' }, () => setScore(serverScore))
    return score
  })
  status(channels[0], 'SUBSCRIBED')
  status(channels[0], failure)
  serverScore = 2 // Goal notifications were missed while the socket was disconnected.
  expect(result.current).toBe(0)
  status(channels[0], 'SUBSCRIBED')
  expect(result.current).toBe(2)
  expect(createChannel).toHaveBeenCalledTimes(1)
})

it('catches up on reconnect and foreground wake, ignoring moves to the background', () => {
  const update = vi.fn()
  renderHook(() => useRealtime('matches', { column: 'session_id', value: 's1' }, update))
  show('hidden')
  expect(update).not.toHaveBeenCalled()
  act(() => window.dispatchEvent(new Event('online')))
  show('visible')
  expect(update).toHaveBeenCalledTimes(2)
  expect(createChannel).toHaveBeenCalledTimes(1)
})

it('uses the latest refresh callback without reopening the channel on render', () => {
  const first = vi.fn()
  const latest = vi.fn()
  const { rerender } = renderHook(({ update }) => useRealtime('matches', { column: 'session_id', value: 's1' }, update), {
    initialProps: { update: first },
  })
  rerender({ update: latest })
  act(() => channels[0].change())
  status(channels[0], 'SUBSCRIBED')
  expect(first).not.toHaveBeenCalled()
  expect(latest).toHaveBeenCalledTimes(2)
  expect(createChannel).toHaveBeenCalledTimes(1)
  expect(removeChannel).not.toHaveBeenCalled()
})

it('stops the previous subscription when the session changes and ignores its late callbacks', () => {
  const update = vi.fn()
  const { rerender } = renderHook(({ value }) => useRealtime('matches', { column: 'session_id', value }, update), {
    initialProps: { value: 's1' },
  })
  rerender({ value: 's2' })
  expect(removeChannel).toHaveBeenCalledWith(channels[0])
  act(() => channels[0].change())
  status(channels[0], 'SUBSCRIBED')
  expect(update).not.toHaveBeenCalled()
  status(channels[1], 'SUBSCRIBED')
  expect(update).toHaveBeenCalledTimes(1)
})

it('cleans up wake listeners and ignores all callbacks after unmount', () => {
  const removeWindow = vi.spyOn(window, 'removeEventListener')
  const removeDocument = vi.spyOn(document, 'removeEventListener')
  const update = vi.fn()
  renderHook(() => useRealtime('matches', { column: 'session_id', value: 's1' }, update)).unmount()
  expect(removeChannel).toHaveBeenCalledExactlyOnceWith(channels[0])
  expect(removeWindow).toHaveBeenCalledWith('online', expect.any(Function))
  expect(removeDocument).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  act(() => { channels[0].change(); window.dispatchEvent(new Event('online')) })
  status(channels[0], 'SUBSCRIBED')
  show('visible')
  expect(update).not.toHaveBeenCalled()
})

it('does not subscribe or refresh before the session is known', () => {
  const update = vi.fn()
  renderHook(() => useRealtime('matches', { column: 'session_id', value: '' }, update))
  act(() => window.dispatchEvent(new Event('online')))
  show('visible')
  expect(createChannel).not.toHaveBeenCalled()
  expect(update).not.toHaveBeenCalled()
})
