import { renderHook, act } from '@testing-library/react'
import { vi } from 'vitest'
import type { Match } from '../lib/types'
import { outbox } from '../lib/pitchOutbox'

vi.mock('../lib/pitchOutbox', () => ({
  outbox: { runOrQueue: vi.fn().mockResolvedValue('sent') },
  newId: () => 'op',
}))

import { useMatchTimer } from './useMatchTimer'

const baseMatch = (o: Partial<Match> = {}): Match => ({
  id: 'm1', session_id: 's1', match_number: 1,
  team1_id: 'red', team2_id: 'blue', waiting_team_id: 'yellow',
  status: 'active', team1_score: 0, team2_score: 0,
  winner_team_id: null, is_draw: false, draw_resolved_by: null,
  timer_started_at: null, timer_elapsed_seconds: 0, timer_status: 'stopped',
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
