import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Match, TimerStatus } from '../lib/types'

interface MatchTimerResult {
  elapsed: number
  timerStatus: TimerStatus
  start: () => Promise<void>
  pause: () => Promise<void>
}

function computeElapsed(match: Match): number {
  if (match.timer_status !== 'running' || !match.timer_started_at) {
    return match.timer_elapsed_seconds
  }
  const delta = Math.floor((Date.now() - new Date(match.timer_started_at).getTime()) / 1000)
  return match.timer_elapsed_seconds + delta
}

export function useMatchTimer(match: Match): MatchTimerResult {
  const [elapsed, setElapsed] = useState(() => computeElapsed(match))

  useEffect(() => {
    setElapsed(computeElapsed(match))
    if (match.timer_status !== 'running') return

    const interval = setInterval(() => {
      setElapsed(computeElapsed(match))
    }, 1000)

    return () => clearInterval(interval)
  }, [match])

  const start = useCallback(async () => {
    await supabase
      .from('matches')
      .update({ timer_started_at: new Date().toISOString(), timer_status: 'running' })
      .eq('id', match.id)
  }, [match.id])

  const pause = useCallback(async () => {
    const currentElapsed = computeElapsed(match)
    await supabase
      .from('matches')
      .update({
        timer_elapsed_seconds: currentElapsed,
        timer_status: 'paused',
        timer_started_at: null,
      })
      .eq('id', match.id)
  }, [match])

  return { elapsed, timerStatus: match.timer_status, start, pause }
}
