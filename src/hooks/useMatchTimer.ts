import { useState, useEffect, useCallback } from 'react'
import { outbox, newId } from '../lib/pitchOutbox'
import type { Match, TimerStatus } from '../lib/types'

interface MatchTimerResult {
  elapsed: number
  timerStatus: TimerStatus
  start: () => Promise<void>
  pause: () => Promise<void>
}

function computeElapsed(
  baseSeconds: number,
  status: TimerStatus,
  startedAt: string | null,
): number {
  if (status !== 'running' || !startedAt) return baseSeconds
  return baseSeconds + Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
}

export function useMatchTimer(match: Match): MatchTimerResult {
  // Local state so start/pause update UI immediately without waiting for a DB reload
  const [timerStatus, setTimerStatus] = useState<TimerStatus>(match.timer_status)
  const [startedAt, setStartedAt] = useState<string | null>(match.timer_started_at ?? null)
  const [baseElapsed, setBaseElapsed] = useState(match.timer_elapsed_seconds)
  const [elapsed, setElapsed] = useState(() =>
    computeElapsed(match.timer_elapsed_seconds, match.timer_status, match.timer_started_at ?? null),
  )

  // Sync from parent when the match prop is refreshed (after load())
  useEffect(() => {
    setTimerStatus(match.timer_status)
    setStartedAt(match.timer_started_at ?? null)
    setBaseElapsed(match.timer_elapsed_seconds)
    setElapsed(
      computeElapsed(match.timer_elapsed_seconds, match.timer_status, match.timer_started_at ?? null),
    )
  }, [match.id, match.timer_status, match.timer_elapsed_seconds, match.timer_started_at])

  // Tick every second while running
  useEffect(() => {
    if (timerStatus !== 'running') return
    const interval = setInterval(() => {
      setElapsed(computeElapsed(baseElapsed, timerStatus, startedAt))
    }, 1000)
    return () => clearInterval(interval)
  }, [timerStatus, baseElapsed, startedAt])

  const start = useCallback(async () => {
    const now = new Date().toISOString()
    setTimerStatus('running')
    setStartedAt(now)
    await outbox.runOrQueue({
      id: newId(), kind: 'update', table: 'matches', match: { id: match.id },
      values: { timer_started_at: now, timer_status: 'running', status: 'active' },
    })
  }, [match.id])

  const pause = useCallback(async () => {
    const current = computeElapsed(baseElapsed, timerStatus, startedAt)
    setTimerStatus('paused')
    setStartedAt(null)
    setBaseElapsed(current)
    setElapsed(current)
    await outbox.runOrQueue({
      id: newId(), kind: 'update', table: 'matches', match: { id: match.id },
      values: { timer_elapsed_seconds: current, timer_status: 'paused', timer_started_at: null },
    })
  }, [match.id, baseElapsed, timerStatus, startedAt])

  return { elapsed, timerStatus, start, pause }
}
