import { useEffect, useReducer } from 'react'
import { newId } from '../lib/pitchOutbox'
import type { OutboxOp } from '../lib/outbox'
import { serverNow, serverNowIso } from '../lib/serverClock'
import type { Match } from '../lib/types'
import { periodSecondsAtStart } from '../utils/matchFormat'
import { matchElapsed } from '../utils/homeStatus'

export function useMatchTimer(match: Match | null, apply: (ops: OutboxOp[]) => Promise<void>) {
  const timerStatus = match?.timer_status ?? 'stopped'
  const [, tick] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (timerStatus !== 'running') return
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [timerStatus])

  // The match already includes unsent changes. Keeping a second local clock here
  // would let a refused Start keep ticking after the match had been restored.
  const elapsedNow = () => match ? matchElapsed(match, serverNow()) : 0
  const saveClock = async (values: Partial<Match>) => {
    if (!match) return
    await apply([{ id: newId(), kind: 'update', table: 'matches', match: { id: match.id }, values }])
  }

  const start = () => saveClock({ timer_started_at: serverNowIso(), timer_status: 'running', status: 'active' })
  const pause = () => saveClock({ timer_elapsed_seconds: elapsedNow(), timer_status: 'paused', timer_started_at: null })

  const endPeriod = () => {
    const current = elapsedNow()
    return saveClock({
      timer_status: 'stopped', timer_started_at: null, timer_elapsed_seconds: current,
      period_seconds: [...(match?.period_seconds ?? []), current],
    })
  }

  const startPeriod = (period: number) => saveClock({
    period, timer_elapsed_seconds: 0, timer_started_at: serverNowIso(), timer_status: 'running', status: 'active',
    period_seconds: periodSecondsAtStart(match?.period_seconds ?? [], period),
  })

  return { elapsed: elapsedNow(), timerStatus, start, pause, endPeriod, startPeriod }
}
