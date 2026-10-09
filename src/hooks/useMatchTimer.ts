import { useState, useEffect, useCallback } from 'react'
import { outbox, newId } from '../lib/pitchOutbox'
import { serverNow, serverNowIso } from '../lib/serverClock'
import type { Match, TimerStatus } from '../lib/types'

interface MatchTimerResult {
  elapsed: number
  timerStatus: TimerStatus
  start: () => Promise<void>
  pause: () => Promise<void>
  endPeriod: () => Promise<void>
  startPeriod: (period: number) => Promise<void>
}

function computeElapsed(
  baseSeconds: number,
  status: TimerStatus,
  startedAt: string | null,
): number {
  if (status !== 'running' || !startedAt) return baseSeconds
  // Server time on both sides; never below the time already played, whatever the clocks say
  return baseSeconds + Math.max(0, Math.floor((serverNow() - new Date(startedAt).getTime()) / 1000))
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
    const now = serverNowIso()
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

  // Works from a running or a paused clock: freezes it and records how long the period lasted
  const endPeriod = useCallback(async () => {
    const current = computeElapsed(baseElapsed, timerStatus, startedAt)
    setTimerStatus('stopped')
    setStartedAt(null)
    setBaseElapsed(current)
    setElapsed(current)
    await outbox.runOrQueue({
      id: newId(), kind: 'update', table: 'matches', match: { id: match.id },
      values: {
        timer_status: 'stopped', timer_started_at: null, timer_elapsed_seconds: current,
        period_seconds: [...match.period_seconds, current],
      },
    })
  }, [match.id, match.period_seconds, baseElapsed, timerStatus, startedAt])

  const startPeriod = useCallback(async (period: number) => {
    const now = serverNowIso()
    setTimerStatus('running')
    setStartedAt(now)
    setBaseElapsed(0)
    setElapsed(0)
    await outbox.runOrQueue({
      id: newId(), kind: 'update', table: 'matches', match: { id: match.id },
      values: { period, timer_elapsed_seconds: 0, timer_started_at: now, timer_status: 'running', status: 'active' },
    })
  }, [match.id])

  return { elapsed, timerStatus, start, pause, endPeriod, startPeriod }
}
