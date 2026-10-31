import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAdminPath, useLeague } from '../../contexts/LeagueContext'
import { fetchCoachData, type CoachData } from '../../lib/coachApi'
import { COACH_WEIGHTS, MATCH_TYPES, POSITIONS, coachStats, type Average, type CoachPart } from '../../utils/coachRating'
import { dayTitle } from '../../utils/coachDay'
import { dayLabel, localToday } from '../../utils/trainingDays'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import PageSkeleton from '../../components/PageSkeleton'
import NotAvailablePage from '../NotAvailablePage'

const PARTS = Object.keys(COACH_WEIGHTS) as CoachPart[]

// One player as the coach sees them: the Coach Rating and what it is made of, how they do by match
// type, as a starter or a substitute, and in each position, and every day on record.
export default function CoachPlayerPage() {
  const { playerId = '' } = useParams()
  const { t, i18n } = useTranslation()
  const league = useLeague()
  const adminPath = useAdminPath()
  const [data, setData] = useState<CoachData | null>(null)
  const [failed, setFailed] = useState(false)

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

  if (failed) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-300 mb-3">{t('common.loadFailed')}</p>
        <button onClick={load} className="px-4 py-2 bg-blue-600 rounded font-semibold hover:bg-blue-700">{t('common.retry')}</button>
      </div>
    )
  }
  if (!data) return <PageSkeleton />
  const player = data.players.find((p) => p.id === playerId)
  if (!player) return <NotAvailablePage kind="page" embedded />

  const today = localToday()
  const stat = coachStats(data.events, data.entries, { today }).get(player.id)
  const eventsById = new Map(data.events.map((e) => [e.id, e]))
  const history = data.entries
    .filter((e) => e.player_id === player.id && eventsById.has(e.event_id))
    .map((entry) => ({ entry, ev: eventsById.get(entry.event_id)! }))
    .sort((a, b) => b.ev.event_date.localeCompare(a.ev.event_date))

  const avg = (a: Average) => (a.avg === null ? '–' : String(a.avg))
  const bestPosition = stat
    ? POSITIONS.filter((p) => stat.byPosition[p].avg !== null)
      .sort((a, b) => stat.byPosition[b].avg! - stat.byPosition[a].avg! || stat.byPosition[b].apps - stat.byPosition[a].apps)[0]
    : undefined

  return (
    <div className="max-w-lg mx-auto">
      <Link to={adminPath('/coach')} className="text-sm text-blue-400 hover:underline">
        <span aria-hidden="true">‹</span> {t('coach.title')}
      </Link>

      <div className="flex items-center gap-4 mt-3 mb-5">
        <PlayerAvatar player={player} size="lg" />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold break-words" dir="auto">{player.name}</h1>
          <p className="text-sm text-gray-400">{t(`coach.position.${player.position}`)}</p>
        </div>
        <div className="text-center shrink-0">
          <p className="text-xs text-gray-400">{t('coach.coachRating')}</p>
          {stat?.overall != null ? (
            <>
              <p className="text-4xl font-bold tabular-nums">{stat.overall}</p>
              <p className="text-[10px] text-gray-500">{t('coach.outOf')}</p>
            </>
          ) : (
            <p className="text-sm text-gray-500 mt-1">{t('coach.noData')}</p>
          )}
        </div>
      </div>

      {!stat ? (
        <p className="text-gray-500 text-center py-8">{t('coach.nothing')}</p>
      ) : (
        <>
          <ul className="space-y-2 mb-6">
            {PARTS.map((part) => {
              const value = stat.parts[part]
              return (
                <li key={part}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span>{t(`coach.parts.${part}`)} <span className="text-xs text-gray-500">({t('coach.weight', { value: COACH_WEIGHTS[part] * 100 })})</span></span>
                    <span className="font-semibold tabular-nums">{value ?? '–'}</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-800 overflow-hidden" aria-hidden="true">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${value ?? 0}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>

          <Section title={t('coach.attendanceTitle')}>
            <p className="text-sm text-gray-300">{t('coach.counts.training', stat.attendance)}</p>
          </Section>

          <Section title={t('coach.byType')}>
            <Rows rows={MATCH_TYPES.map((type) => ({
              key: type, label: t(`coach.matchType.${type}`), games: stat.byType[type].apps, value: avg(stat.byType[type]),
            }))} />
          </Section>

          <Section title={t('coach.byRole')}>
            <Rows rows={(['starter', 'sub'] as const).map((role) => ({
              key: role, label: t(`coach.role.${role}`), games: stat.byRole[role].apps, value: avg(stat.byRole[role]),
            }))} />
          </Section>

          <Section title={t('coach.byPosition')}>
            <Rows rows={POSITIONS.filter((pos) => stat.byPosition[pos].apps > 0).map((pos) => ({
              key: pos, label: t(`coach.position.${pos}`), games: stat.byPosition[pos].apps, value: avg(stat.byPosition[pos]),
              best: pos === bestPosition,
            }))} />
          </Section>

          <Section title={t('coach.history')}>
            <ul className="divide-y divide-gray-800 rounded-xl bg-gray-800/50">
              {history.map(({ entry, ev }) => {
                const detail = ev.kind === 'training'
                  ? t(`coach.attendance.${entry.attendance}`)
                  : [
                    t(`coach.role.${entry.role ?? 'starter'}`),
                    entry.position && entry.role !== 'unused' ? t(`coach.position.${entry.position}`) : null,
                    entry.goals || entry.assists ? t('coach.goalsAssists', { goals: entry.goals, assists: entry.assists }) : null,
                  ].filter(Boolean).join(' · ')
                return (
                  <li key={ev.id}>
                    <Link to={adminPath(`/coach/days/${ev.id}`)} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-800">
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium truncate" dir="auto">{dayTitle(ev, t)}</span>
                        <span className="block text-xs text-gray-400 truncate">{dayLabel(ev.event_date, i18n.language)} · {detail}</span>
                      </span>
                      <span className="shrink-0 w-8 text-center font-bold tabular-nums">{entry.rating ?? '–'}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </Section>
        </>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="text-sm font-semibold text-gray-400 mb-2">{title}</h2>
      {children}
    </section>
  )
}

function Rows({ rows }: { rows: { key: string; label: string; games: number; value: string; best?: boolean }[] }) {
  const { t } = useTranslation()
  if (rows.length === 0) return <p className="text-sm text-gray-500">–</p>
  return (
    <ul className="divide-y divide-gray-800 rounded-xl bg-gray-800/50">
      {rows.map((r) => (
        <li key={r.key} className="flex items-center gap-3 px-3 py-2 text-sm">
          <span className="flex-1 min-w-0">
            {r.label}
            {r.best && <span className="ms-2 px-1.5 py-0.5 rounded bg-green-800 text-green-100 text-[10px] font-semibold">{t('coach.best')}</span>}
          </span>
          <span className="text-xs text-gray-400">{t('coach.games', { count: r.games })}</span>
          <span className="w-20 text-end font-semibold tabular-nums">{r.value === '–' ? '–' : t('coach.avg', { value: r.value })}</span>
        </li>
      ))}
    </ul>
  )
}
