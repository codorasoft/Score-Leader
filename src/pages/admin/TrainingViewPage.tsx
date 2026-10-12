import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAdminPath, useLeague } from '../../contexts/LeagueContext'
import { fetchTraining, type TrainingDetail } from '../../lib/trainingApi'
import { dayLabel } from '../../utils/trainingDays'
import TrainingVideo from '../../components/TrainingVideo'
import NotAvailablePage from '../NotAvailablePage'

// One training as the coach shows it at the pitch: its videos in order, played in the page.
export default function TrainingViewPage() {
  const { trainingId = '' } = useParams()
  const { t, i18n } = useTranslation()
  const league = useLeague()
  const adminPath = useAdminPath()
  // undefined while loading, null when this league has no such training
  const [training, setTraining] = useState<TrainingDetail | null | undefined>(undefined)
  const [failed, setFailed] = useState(false)
  const [playing, setPlaying] = useState<string | null>(null)

  // Latest request, so a slow response for a training or league we have left is dropped
  const current = useRef('')
  const load = useCallback(() => {
    const request = `${league.id}/${trainingId}`
    current.current = request
    setFailed(false)
    setTraining(undefined)
    setPlaying(null)
    fetchTraining(trainingId, league.id)
      .then((found) => { if (current.current === request) setTraining(found) })
      .catch(() => { if (current.current === request) setFailed(true) })
  }, [league.id, trainingId])

  useEffect(load, [load])

  if (failed) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-300 mb-3">{t('common.loadFailed')}</p>
        <button onClick={load} className="px-4 py-2 bg-blue-600 rounded font-semibold hover:bg-blue-700">{t('common.retry')}</button>
      </div>
    )
  }
  if (training === undefined) return <p className="text-gray-400">{t('common.loading')}</p>
  if (training === null) return <NotAvailablePage kind="page" embedded />

  const day = dayLabel(training.training_date, i18n.language)
  return (
    <div className="max-w-lg mx-auto">
      <Link to={adminPath('/trainings')} className="text-sm text-blue-400 hover:underline">
        <span aria-hidden="true">‹</span> {t('training.title')}
      </Link>

      <div className="flex items-start gap-3 mt-2 mb-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold break-words">{training.title ?? day}</h1>
          {training.title && <p className="text-sm text-gray-400">{day}</p>}
        </div>
        <Link to={adminPath(`/trainings/${training.id}/edit`)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm font-semibold">
          {t('common.edit')}
        </Link>
      </div>

      {training.videos.length === 0 && <p className="text-gray-500 text-center py-10">{t('training.noVideos')}</p>}

      <ol className="space-y-5">
        {training.videos.map((video, i) => (
          <li key={video.id}>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="w-7 h-7 shrink-0 rounded-full bg-blue-600 text-sm font-bold flex items-center justify-center">{i + 1}</span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold">{video.title}</span>
                <span className="block text-xs text-gray-400">{video.type_name}</span>
              </span>
            </div>
            <TrainingVideo
              youtubeId={video.youtube_id}
              title={video.title}
              playing={playing === video.id}
              onPlay={() => setPlaying(video.id)}
            />
          </li>
        ))}
      </ol>
    </div>
  )
}
