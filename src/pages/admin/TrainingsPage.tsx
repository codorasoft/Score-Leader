import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAdminPath, useLeague } from '../../contexts/LeagueContext'
import { fetchTrainings, type TrainingSummary } from '../../lib/trainingApi'
import { dayLabel, groupByDay, localToday } from '../../utils/trainingDays'
import PageSkeleton from '../../components/PageSkeleton'

// The league's trainings: today's first, so the coach at the pitch finds it at once.
export default function TrainingsPage() {
  const { t, i18n } = useTranslation()
  const league = useLeague()
  const adminPath = useAdminPath()
  const [trainings, setTrainings] = useState<TrainingSummary[] | null>(null)
  const [failed, setFailed] = useState(false)

  // Latest league, so a slow response for a league we have left is dropped
  const currentLeague = useRef(league.id)
  currentLeague.current = league.id

  const load = useCallback(() => {
    const forLeague = league.id
    setFailed(false)
    setTrainings(null)
    fetchTrainings(forLeague)
      .then((list) => { if (forLeague === currentLeague.current) setTrainings(list) })
      .catch(() => { if (forLeague === currentLeague.current) setFailed(true) })
  }, [league.id])

  useEffect(load, [load])

  const groups = trainings && groupByDay(trainings, localToday())
  const sections = groups && ([
    ['today', groups.today], ['upcoming', groups.upcoming], ['past', groups.past],
  ] as const).filter(([, list]) => list.length > 0)

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">{t('training.title')}</h1>
        <Link to={adminPath('/trainings/new')} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-semibold">
          ＋ {t('training.new')}
        </Link>
      </div>

      {failed ? (
        <div className="text-center py-8">
          <p className="text-gray-300 mb-3">{t('common.loadFailed')}</p>
          <button onClick={load} className="px-4 py-2 bg-blue-600 rounded font-semibold hover:bg-blue-700">{t('common.retry')}</button>
        </div>
      ) : !sections ? (
        <PageSkeleton />
      ) : sections.length === 0 ? (
        <p className="text-gray-500 text-center py-10">{t('training.empty')}</p>
      ) : (
        sections.map(([key, list]) => (
          <section key={key} className="mb-6">
            <h2 className="text-sm font-semibold text-gray-400 mb-2">{t(`training.${key}`)}</h2>
            <ul className="space-y-2">
              {list.map((training) => {
                const day = dayLabel(training.training_date, i18n.language)
                const count = t('training.videoCount', { count: training.video_count })
                return (
                  <li key={training.id}>
                    <Link to={adminPath(`/trainings/${training.id}`)} className="flex items-center gap-3 bg-gray-800 hover:bg-gray-700 rounded-xl px-4 py-3">
                      <span className="flex-1 min-w-0">
                        <span className="block font-semibold truncate">{training.title ?? day}</span>
                        <span className="block text-xs text-gray-400">{training.title ? `${day} · ${count}` : count}</span>
                      </span>
                      <span className="text-gray-500" aria-hidden="true">›</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
