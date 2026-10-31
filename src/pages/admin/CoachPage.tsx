import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAdminPath, useLeague } from '../../contexts/LeagueContext'
import { fetchCoachData, type CoachData } from '../../lib/coachApi'
import type { CoachEvent } from '../../lib/types'
import {
  COACH_FILTERS, coachStats, periodStart, rankCoach, type CoachFilter, type CoachPeriod, type CoachStat,
} from '../../utils/coachRating'
import { dayLabel, localToday } from '../../utils/trainingDays'
import { dayTitle } from '../../utils/coachDay'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import PageSkeleton from '../../components/PageSkeleton'

const PERIODS: readonly CoachPeriod[] = ['all', '30', '90']
const RECENT_DAYS = 8

// The coach's own area: the ranking from attendance and the coach's ratings, and the trainings and
// matches behind it. Separate from the leaderboard, which it never changes.
export default function CoachPage() {
  const { t } = useTranslation()
  const league = useLeague()
  const adminPath = useAdminPath()
  const [data, setData] = useState<CoachData | null>(null)
  const [failed, setFailed] = useState(false)
  const [filter, setFilter] = useState<CoachFilter>('all')
  const [period, setPeriod] = useState<CoachPeriod>('all')
  const [allDays, setAllDays] = useState(false)

  // Latest league, so a slow response for a league we have left is dropped
  const currentLeague = useRef(league.id)
  currentLeague.current = league.id

  const load = useCallback(() => {
    const forLeague = league.id
    setFailed(false)
    setData(null)
    fetchCoachData(forLeague)
      .then((d) => { if (forLeague === currentLeague.current) setData(d) })
      .catch(() => { if (forLeague === currentLeague.current) setFailed(true) })
  }, [league.id])

  useEffect(load, [load])

  const header = (
    <div className="flex items-center justify-between gap-2 mb-4">
      <h1 className="text-xl font-bold">{t('coach.title')}</h1>
      <div className="flex gap-2 shrink-0">
        <Link to={adminPath('/coach/new/training')} className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-semibold">
          ＋ {t('coach.newTraining')}
        </Link>
        <Link to={adminPath('/coach/new/match')} className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-semibold">
          ＋ {t('coach.newMatch')}
        </Link>
      </div>
    </div>
  )

  if (failed) {
    return (
      <div className="max-w-lg mx-auto">
        {header}
        <div className="text-center py-8">
          <p className="text-gray-300 mb-3">{t('common.loadFailed')}</p>
          <button onClick={load} className="px-4 py-2 bg-blue-600 rounded font-semibold hover:bg-blue-700">{t('common.retry')}</button>
        </div>
      </div>
    )
  }
  if (!data) return <div className="max-w-lg mx-auto">{header}<PageSkeleton /></div>

  const today = localToday()
  if (data.events.length === 0) {
    return (
      <div className="max-w-lg mx-auto">
        {header}
        <p className="text-gray-500 text-center py-10">{t('coach.empty')}</p>
        <p className="text-xs text-gray-500 text-center">{t('coach.rankingHint')}</p>
      </div>
    )
  }

  const stats = coachStats(data.events, data.entries, { filter, since: periodStart(period, today), today })
  const ranked = rankCoach(
    data.players.flatMap((player) => {
      const stat = stats.get(player.id)
      return stat ? [{ player, name: player.name, stat }] : []
    }),
  )
  const presentBy = new Map<string, number>()
  const squadBy = new Map<string, number>()
  for (const e of data.entries) {
    if (e.attendance === 'present' || e.attendance === 'late') presentBy.set(e.event_id, (presentBy.get(e.event_id) ?? 0) + 1)
    squadBy.set(e.event_id, (squadBy.get(e.event_id) ?? 0) + 1)
  }
  const days = allDays ? data.events : data.events.slice(0, RECENT_DAYS)

  const chip = (on: boolean) =>
    `shrink-0 px-3 py-1.5 rounded-full text-sm border ${on ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:text-white'}`

  return (
    <div className="max-w-lg mx-auto">
      {header}

      <section className="mb-8">
        <h2 className="font-semibold mb-1">{t('coach.ranking')}</h2>
        <p className="text-xs text-gray-400 mb-3">{t('coach.rankingHint')}</p>

        <div role="group" aria-label={t('coach.filterLabel')} className="flex gap-2 overflow-x-auto pb-1 mb-2">
          {COACH_FILTERS.map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={chip(filter === f)}>
              {t(`coach.filter.${f}`)}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-400 mb-3">
          {t('coach.period.label')}
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as CoachPeriod)}
            className="px-2 py-1 rounded-lg bg-gray-800 border border-gray-700 text-base text-white"
          >
            {PERIODS.map((p) => <option key={p} value={p}>{t(`coach.period.${p}`)}</option>)}
          </select>
        </label>

        {ranked.length === 0 ? (
          <p className="text-gray-500 text-center py-6">{t('coach.rankEmpty')}</p>
        ) : (
          <ol className="space-y-2">
            {ranked.map(({ player, stat }, i) => (
              <li key={player.id}>
                <Link to={adminPath(`/coach/players/${player.id}`)} className="flex items-center gap-3 bg-gray-800 hover:bg-gray-700 rounded-xl px-3 py-2.5">
                  <span className="w-6 shrink-0 text-center text-sm font-bold text-gray-400 tabular-nums">{stat.overall === null ? '' : i + 1}</span>
                  <PlayerAvatar player={player} size="sm" />
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold truncate" dir="auto">{player.name}</span>
                    <span className="block text-xs text-gray-400 truncate">{summaryOf(stat, t)}</span>
                  </span>
                  {stat.overall === null ? (
                    <span className="shrink-0 text-xs text-gray-500">{t('coach.noData')}</span>
                  ) : (
                    <span className="shrink-0 text-end">
                      <span className="block text-xl font-bold tabular-nums">{stat.overall}</span>
                      <span className="block text-[10px] text-gray-500">{t('coach.outOf')}</span>
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ol>
        )}
        <p className="text-[11px] text-gray-500 text-center pt-3">{t('coach.formula')}</p>
      </section>

      <section>
        <h2 className="font-semibold mb-2">{t('coach.days')}</h2>
        <ul className="space-y-2">
          {days.map((ev) => (
            <li key={ev.id}>
              <Link to={adminPath(`/coach/days/${ev.id}`)} className="flex items-center gap-3 bg-gray-800 hover:bg-gray-700 rounded-xl px-4 py-3">
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold truncate" dir="auto">{dayTitle(ev, t)}</span>
                  <span className="block text-xs text-gray-400">
                    <DayLine ev={ev} present={presentBy.get(ev.id) ?? 0} squad={squadBy.get(ev.id) ?? 0} />
                  </span>
                </span>
                {ev.kind === 'match' && ev.our_score !== null && (
                  <span className="shrink-0 font-bold tabular-nums" dir="ltr">{ev.our_score}–{ev.their_score}</span>
                )}
                <span className="text-gray-500" aria-hidden="true">›</span>
              </Link>
            </li>
          ))}
        </ul>
        {!allDays && data.events.length > RECENT_DAYS && (
          <button type="button" onClick={() => setAllDays(true)} className="w-full mt-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm">
            {t('coach.showAll')}
          </button>
        )}
      </section>
    </div>
  )
}

type T = ReturnType<typeof useTranslation>['t']

function summaryOf(stat: CoachStat, t: T): string {
  const parts: string[] = []
  if (stat.attendance.pct !== null) parts.push(t('coach.summary.attendance', { value: stat.attendance.pct }))
  if (stat.training.avg !== null) parts.push(t('coach.summary.training', { value: stat.training.avg }))
  if (stat.match.avg !== null) parts.push(t('coach.summary.match', { value: stat.match.avg }))
  return parts.join(' · ')
}

function DayLine({ ev, present, squad }: { ev: CoachEvent; present: number; squad: number }) {
  const { t, i18n } = useTranslation()
  const day = dayLabel(ev.event_date, i18n.language)
  const what = ev.kind === 'match'
    ? `${t(`coach.matchType.${ev.match_type ?? 'friendly'}`)} · ${t('coach.squadCount', { count: squad })}`
    : `${ev.title ? `${t('coach.kind.training')} · ` : ''}${t('coach.presentCount', { count: present })}`
  return <>{day} · {what}</>
}
