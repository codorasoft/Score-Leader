import { renderHook, act } from '@testing-library/react'
import { vi } from 'vitest'
import type { Match } from '../lib/types'
import { outbox } from '../lib/pitchOutbox'

vi.mock('../lib/pitchOutbox', () => ({
  outbox: { runOrQueue: vi.fn().mockResolvedValue('sent') },
  newId: () => 'op',
}))

import { useMatchTimer } from './useMatchTimer'
import { syncServerClock } from '../lib/serverClock'

afterEach(async () => {
  await syncServerClock(async () => new Date(Date.now()).toISOString())
  vi.useRealTimers()
})

const baseMatch = (o: Partial<Match> = {}): Match => ({
  id: 'm1', session_id: 's1', match_number: 1,
  team1_id: 'red', team2_id: 'blue', waiting_team_id: 'yellow',
  status: 'active', team1_score: 0, team2_score: 0,
  winner_team_id: null, is_draw: false, draw_resolved_by: null,
  timer_started_at: null, timer_elapsed_seconds: 0, timer_status: 'stopped',
  period: 1, period_seconds: [],
  created_at: '',
  ...o,
})

it('elapsed equals timer_elapsed_seconds when paused', () => {
  const match = baseMatch({ timer_elapsed_seconds: 120, timer_status: 'paused', timer_started_at: null })
  const { result } = renderHook(() => useMatchTimer(match))
  expect(result.current.elapsed).toBe(120)
})

it('elapsed equals timer_elapsed_seconds when stopped', () => {
  const match = baseMatch({ timer_elapsed_seconds: 0, timer_status: 'stopped' })
  const { result } = renderHook(() => useMatchTimer(match))
  expect(result.current.elapsed).toBe(0)
})

it('start marks the match active so the public live page can find it', async () => {
  const { result } = renderHook(() => useMatchTimer(baseMatch({ status: 'pending' })))
  await act(() => result.current.start())
  expect(outbox.runOrQueue).toHaveBeenCalledWith(expect.objectContaining({
    kind: 'update', table: 'matches', match: { id: 'm1' },
    values: expect.objectContaining({ status: 'active', timer_status: 'running' }),
  }))
})

it('returns timerStatus from match', () => {
  const match = baseMatch({ timer_status: 'paused' })
  const { result } = renderHook(() => useMatchTimer(match))
  expect(result.current.timerStatus).toBe('paused')
})

describe('devices whose clocks disagree', () => {
  // An admin PC was 66 s fast: it saved a start time in the future, and phones showed a negative clock
  const fastDevice = async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-08T18:01:16Z'))
    await syncServerClock(async () => '2026-10-08T18:00:10Z')
  }

  it('a device with a fast clock shows the same match time as everyone else', async () => {
    await fastDevice()
    const match = baseMatch({ timer_status: 'running', timer_started_at: '2026-10-08T18:00:00.000Z' })
    const { result } = renderHook(() => useMatchTimer(match))
    expect(result.current.elapsed).toBe(10)
  })

  it('start saves the server time, not this device time', async () => {
    await fastDevice()
    const { result } = renderHook(() => useMatchTimer(baseMatch({ status: 'pending' })))
    await act(() => result.current.start())
    expect(outbox.runOrQueue).toHaveBeenLastCalledWith(expect.objectContaining({
      values: expect.objectContaining({ timer_started_at: '2026-10-08T18:00:10.000Z' }),
    }))
  })

  it('never shows a negative time, even for a start time ahead of this clock', () => {
    const ahead = new Date(Date.now() + 66_000).toISOString()
    const match = baseMatch({ timer_status: 'running', timer_started_at: ahead, timer_elapsed_seconds: 30 })
    const { result } = renderHook(() => useMatchTimer(match))
    expect(result.current.elapsed).toBe(30)
  })
})

it('endPeriod freezes the clock and records the period length, also when paused', async () => {
  const { result } = renderHook(() => useMatchTimer(baseMatch({ timer_status: 'paused', timer_elapsed_seconds: 612, period_seconds: [] })))
  await act(() => result.current.endPeriod())
  expect(result.current.timerStatus).toBe('stopped'); expect(result.current.elapsed).toBe(612)
  expect(outbox.runOrQueue).toHaveBeenLastCalledWith(expect.objectContaining({ values: expect.objectContaining({ timer_status: 'stopped', timer_elapsed_seconds: 612, period_seconds: [612] }) }))
})

it('startPeriod moves to the next period with a fresh running clock at server time', async () => {
  const { result } = renderHook(() => useMatchTimer(baseMatch({ timer_status: 'stopped', timer_elapsed_seconds: 612, period_seconds: [612] })))
  await act(() => result.current.startPeriod(2))
  expect(result.current.timerStatus).toBe('running'); expect(result.current.elapsed).toBe(0)
  expect(outbox.runOrQueue).toHaveBeenLastCalledWith(expect.objectContaining({ values: expect.objectContaining({ period: 2, timer_elapsed_seconds: 0, timer_status: 'running', status: 'active' }) }))
})
