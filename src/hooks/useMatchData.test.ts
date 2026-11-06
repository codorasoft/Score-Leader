import { act, renderHook, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { event, match, players, session, teamPlayers, teams } from '../test/fixtures'
import { db, resetDb } from '../test/fakeSupabase'
import type { SessionData } from '../lib/sessionData'
import type { OutboxOp } from '../lib/outbox'

vi.mock('../lib/supabase', async () => (await import('../test/fakeSupabase')).supabaseModule)
vi.mock('../lib/sessionData', () => ({ fetchSession: vi.fn() }))
vi.mock('../lib/pitchOutbox', () => ({
  outbox: {
    rejected: vi.fn(() => 0),
    pending: vi.fn(() => []),
    isFlushing: vi.fn(() => false),
    subscribe: vi.fn(() => () => {}),
    runBatchOrQueue: vi.fn(async () => 'queued'),
  },
}))

import { fetchSession } from '../lib/sessionData'
import { outbox } from '../lib/pitchOutbox'
import { useMatchData } from './useMatchData'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function snapshot(id = 'm1', elapsed = 0, sessionId = 's1'): SessionData {
  return {
    session: { ...session, id: sessionId, status: 'active' },
    matches: [match(id, { session_id: sessionId, timer_elapsed_seconds: elapsed })],
    events: [], teams, teamPlayers, players,
  }
}

beforeEach(() => {
  resetDb({ matches: [match('m1')] })
  vi.mocked(fetchSession).mockReset().mockResolvedValue(snapshot())
  vi.mocked(outbox.pending).mockReset().mockReturnValue([])
  vi.mocked(outbox.runBatchOrQueue).mockReset().mockResolvedValue('queued')
})

it('exposes an initial request failure and recovers when retried', async () => {
  vi.mocked(fetchSession).mockRejectedValueOnce(new Error('offline'))
  const { result } = renderHook(() => useMatchData('s1', 'm1', 'L1'))
  await waitFor(() => expect(result.current.loadFailed).toBe(true))
  expect(result.current.match).toBeNull()
  expect(result.current.missing).toBe(false)

  await act(() => result.current.load())
  expect(result.current.match?.id).toBe('m1')
  expect(result.current.loadFailed).toBe(false)
})

it('keeps the current match visible when a background refresh fails', async () => {
  const { result } = renderHook(() => useMatchData('s1', 'm1', 'L1'))
  await waitFor(() => expect(result.current.match?.id).toBe('m1'))
  vi.mocked(fetchSession).mockRejectedValueOnce(new Error('offline'))

  await act(() => result.current.load())
  expect(result.current.match?.id).toBe('m1')
  expect(result.current.teams).toEqual(teams)
  expect(result.current.loadFailed).toBe(true)
})

it('ignores an older response that finishes after a newer refresh', async () => {
  const old = deferred<SessionData | null>()
  vi.mocked(fetchSession).mockReturnValueOnce(old.promise).mockResolvedValueOnce(snapshot('m1', 20))
  const { result } = renderHook(() => useMatchData('s1', 'm1', 'L1'))
  await act(() => result.current.load())
  expect(result.current.match?.timer_elapsed_seconds).toBe(20)

  await act(async () => { old.resolve(snapshot('m1', 10)) })
  expect(result.current.match?.timer_elapsed_seconds).toBe(20)
})

it.each(['missing', 'failed'])('ignores an older %s response after a successful refresh', async (outcome) => {
  const old = deferred<SessionData | null>()
  vi.mocked(fetchSession).mockReturnValueOnce(old.promise)
  const { result } = renderHook(() => useMatchData('s1', 'm1', 'L1'))
  await act(() => result.current.load())
  await act(async () => {
    if (outcome === 'missing') old.resolve(null)
    else old.reject(new Error('offline'))
  })

  expect(result.current.match?.id).toBe('m1')
  expect(result.current.missing).toBe(false)
  expect(result.current.loadFailed).toBe(false)
})

it('clears the previous route and ignores its late refresh after switching matches', async () => {
  const { result, rerender } = renderHook(
    ({ sessionId, matchId }) => useMatchData(sessionId, matchId, 'L1'),
    { initialProps: { sessionId: 's1', matchId: 'm1' } },
  )
  await waitFor(() => expect(result.current.match?.id).toBe('m1'))
  const old = deferred<SessionData | null>()
  const next = deferred<SessionData | null>()
  vi.mocked(fetchSession).mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise)
  let oldLoad!: Promise<void>
  act(() => { oldLoad = result.current.load() })
  rerender({ sessionId: 's2', matchId: 'm2' })
  expect(result.current.match).toBeNull()
  expect(result.current.teams).toEqual([])
  await act(async () => { next.resolve(snapshot('m2', 30, 's2')) })
  await act(async () => { old.resolve(snapshot('m1', 10)); await oldLoad })

  expect(result.current.match?.id).toBe('m2')
  expect(result.current.session?.id).toBe('s2')
  expect(result.current.match?.timer_elapsed_seconds).toBe(30)
})

it('does not replace an optimistic goal with a response requested before that goal', async () => {
  const { result } = renderHook(() => useMatchData('s1', 'm1', 'L1'))
  await waitFor(() => expect(result.current.match?.id).toBe('m1'))
  const old = deferred<SessionData | null>()
  vi.mocked(fetchSession).mockReturnValueOnce(old.promise)
  let oldLoad!: Promise<void>
  act(() => { oldLoad = result.current.load() })
  const goal = event('goal1', 'm1', 'p2', 'tg', 'goal')
  const ops: OutboxOp[] = [
    { id: 'goal1', kind: 'insert', table: 'match_events', row: { ...goal } },
    { id: 'score1', kind: 'update', table: 'matches', match: { id: 'm1' }, values: { team1_score: 1 } },
  ]
  await act(() => result.current.apply(ops))
  await act(async () => { old.resolve(snapshot()); await oldLoad })

  expect(result.current.match?.team1_score).toBe(1)
  expect(result.current.events).toEqual([goal])
})

it('still overlays queued changes on the latest server response', async () => {
  vi.mocked(outbox.pending).mockReturnValue([
    { id: 'score1', kind: 'update', table: 'matches', match: { id: 'm1' }, values: { team1_score: 1 } },
  ])
  const { result } = renderHook(() => useMatchData('s1', 'm1', 'L1'))
  await waitFor(() => expect(result.current.match?.team1_score).toBe(1))
  await act(() => result.current.load())
  expect(result.current.match?.team1_score).toBe(1)
})

it('ignores a superseded response even when it was waiting for a score repair', async () => {
  const repair = deferred<void>()
  db.holds.matches = repair.promise
  const old = snapshot()
  old.matches[0].team1_score = 1
  vi.mocked(fetchSession).mockResolvedValueOnce(old).mockResolvedValueOnce(snapshot('m1', 20))
  const { result } = renderHook(() => useMatchData('s1', 'm1', 'L1'))
  // The initial snapshot disagrees with its goal timeline, so it waits for the repair.
  await waitFor(() => expect(fetchSession).toHaveBeenCalledTimes(1))
  await act(() => result.current.load())
  expect(result.current.match?.timer_elapsed_seconds).toBe(20)
  await act(async () => { repair.resolve() })
  expect(result.current.match?.timer_elapsed_seconds).toBe(20)
})

it.each(['refused', 'changed elsewhere'])('keeps finishing blocked when a score repair is %s', async (reason) => {
  const inconsistent = snapshot()
  inconsistent.matches[0].team1_score = 1
  // The server's match is already 0–0, so the conditional update of 1–0 hits no row.
  if (reason === 'refused') db.errors.matches = { message: 'update refused' }
  vi.mocked(fetchSession).mockResolvedValueOnce(inconsistent)
  const { result } = renderHook(() => useMatchData('s1', 'm1', 'L1'))
  await waitFor(() => expect(result.current.match?.id).toBe('m1'))
  expect(result.current.staleRef.current).toBe(true)

  await act(() => result.current.load())
  expect(result.current.match?.team1_score).toBe(0)
  expect(result.current.staleRef.current).toBe(false)
})

it('ignores a response from an effect cleaned up by StrictMode', async () => {
  const old = deferred<SessionData | null>()
  vi.mocked(fetchSession).mockReturnValueOnce(old.promise).mockResolvedValueOnce(snapshot('m1', 20))
  const { result } = renderHook(() => useMatchData('s1', 'm1', 'L1'), { reactStrictMode: true })
  await waitFor(() => expect(result.current.match?.timer_elapsed_seconds).toBe(20))
  await act(async () => { old.resolve(snapshot('m1', 10)) })
  expect(result.current.match?.timer_elapsed_seconds).toBe(20)
})
