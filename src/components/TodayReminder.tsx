import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useFeature, useLeague } from '../contexts/LeagueContext'
import { fetchToday } from '../lib/scheduleApi'
import { isHandled, markHandled } from '../lib/todaySeen'
import { withNetworkToastsMuted } from '../lib/toast'
import { localToday } from '../utils/trainingDays'
import type { TodayRow } from '../utils/schedule'
import TodayDialog from './TodayDialog'

// The match tracker: a popup there would cover the goal and card buttons
const MATCH_PAGE = /\/sessions\/[^/]+\/match\//

// Once a day for each league, the first time the app is opened, shows what is on today in the
// coach's schedule. The day counts as handled as soon as it was read, also with nothing on it,
// so an item added for today afterwards brings up no popup about what was just typed.
export default function TodayReminder() {
  const league = useLeague()
  const schedule = useFeature('schedule')
  const withPlans = useFeature('training')
  const onMatch = MATCH_PAGE.test(useLocation().pathname)
  const [today, setToday] = useState(() => localToday())
  // Goes up each time the app comes back to the front, so a read that failed is tried again
  const [wakes, setWakes] = useState(0)
  const [shown, setShown] = useState<{ leagueId: string; date: string; rows: TodayRow[] } | null>(null)

  // An app left open past midnight is on a new day when it comes back to the front
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      setToday(localToday())
      setWakes((n) => n + 1)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  useEffect(() => {
    if (!schedule || onMatch || isHandled(league.id, today)) return
    // An answer for a league or a day we have left is dropped, and its day is not remembered
    let dropped = false
    withNetworkToastsMuted(() => fetchToday(league.id, today, withPlans)).then(
      (rows) => {
        if (dropped) return
        markHandled(league.id, today)
        if (rows.length > 0) setShown({ leagueId: league.id, date: today, rows })
      },
      () => { /* nothing was asked for, so nothing is said: tried again on the next open */ },
    )
    return () => { dropped = true }
  }, [league.id, schedule, withPlans, today, onMatch, wakes])

  if (!shown || shown.leagueId !== league.id) return null
  return <TodayDialog date={shown.date} rows={shown.rows} onClose={() => setShown(null)} />
}
