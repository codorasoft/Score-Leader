import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  addVideo, countTrainingsUsing, deleteType, deleteVideo, fetchCatalog, nextSortOrder, renameType, swapOrder, updateVideo,
  type Catalog, type TrainingVideo as Video, type WriteResult,
} from '../../lib/trainingApi'
import ConfirmDialog from '../../components/ConfirmDialog'
import MoveButtons from '../../components/MoveButtons'
import TrainingVideo from '../../components/TrainingVideo'
import TrainingVideoForm from '../../components/TrainingVideoForm'
import NotAvailablePage from '../NotAvailablePage'
import PageSkeleton from '../../components/PageSkeleton'

// One training type of the catalog and its videos.
export default function TrainingTypePage() {
  const { typeId } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [failed, setFailed] = useState(false)
  // One write at a time, so a second tap cannot add, move or delete twice
  const [busy, setBusy] = useState(false)
  const [playing, setPlaying] = useState<string | null>(null)
  // The new name while the type is being renamed
  const [newName, setNewName] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  // The video about to be deleted, and how many trainings use it: undefined while that is being
  // counted, null when it could not be
  const [deleting, setDeleting] = useState<{ video: Video; uses?: number | null } | null>(null)
  const [confirmDeleteType, setConfirmDeleteType] = useState(false)

  const load = useCallback(() => {
    setFailed(false)
    return fetchCatalog().then(setCatalog).catch(() => setFailed(true))
  }, [])

  useEffect(() => { load() }, [load])

  if (failed) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-300 mb-3">{t('common.loadFailed')}</p>
        <button onClick={load} className="px-4 py-2 bg-blue-600 rounded font-semibold hover:bg-blue-700">{t('common.retry')}</button>
      </div>
    )
  }
  if (!catalog) return <PageSkeleton />

  const type = catalog.types.find((x) => x.id === typeId)
  if (!type) return <NotAvailablePage kind="page" embedded />
  const videos = catalog.videos.filter((v) => v.type_id === type.id)

  // Runs one write; the catalog is read again when it worked
  const write = async <T,>(run: () => Promise<T>, worked: (outcome: T) => boolean): Promise<T> => {
    setBusy(true)
    const outcome = await run()
    if (worked(outcome)) await load()
    setBusy(false)
    return outcome
  }
  const isOk = (outcome: WriteResult) => outcome === 'ok'

  const rename = async (e: FormEvent) => {
    e.preventDefault()
    if (busy || !newName?.trim()) return
    if (await write(() => renameType(type.id, newName), Boolean)) setNewName(null)
  }

  const removeType = async () => {
    if (busy) return
    setBusy(true)
    const ok = await deleteType(type.id)
    setBusy(false)
    if (ok) navigate('/super/training', { replace: true })
    else setConfirmDeleteType(false)
  }

  const askDeleteVideo = (video: Video) => {
    setDeleting({ video })
    const counted = (uses: number | null) => setDeleting((d) => (d?.video.id === video.id ? { video, uses } : d))
    // Without a count the question is still asked, just without the warning
    countTrainingsUsing(video.id).then(counted).catch(() => counted(null))
  }

  const removeVideo = async () => {
    if (!deleting || busy) return
    await write(() => deleteVideo(deleting.video.id), Boolean)
    setDeleting(null)
  }

  const move = (index: number, by: -1 | 1) => {
    if (!busy) write(() => swapOrder('training_videos', videos[index], videos[index + by]), Boolean)
  }

  return (
    <div>
      <Link to="/super/training" className="text-sm text-blue-400 hover:underline">
        <span aria-hidden="true">‹</span> {t('super.training.typesTitle')}
      </Link>

      {newName === null ? (
        <div className="flex items-center gap-2 mt-2 mb-4">
          <h1 className="text-xl font-bold flex-1 min-w-0 truncate">{type.name}</h1>
          <button onClick={() => setNewName(type.name)} className="px-3 py-1.5 rounded-lg bg-gray-800 text-sm text-gray-300 hover:text-white">
            {t('super.training.rename')}
          </button>
          <button onClick={() => setConfirmDeleteType(true)} className="px-3 py-1.5 rounded-lg text-sm text-red-300 hover:bg-red-900/40">
            {t('super.training.deleteType')}
          </button>
        </div>
      ) : (
        <form onSubmit={rename} className="flex gap-2 mt-2 mb-4">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={80}
            autoFocus
            aria-label={t('super.training.typeName')}
            className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700"
          />
          <button type="submit" disabled={busy || !newName.trim()} className="px-4 py-2 bg-blue-600 rounded-lg font-semibold disabled:opacity-50">{t('common.save')}</button>
          <button type="button" onClick={() => setNewName(null)} className="px-4 py-2 bg-gray-700 rounded-lg font-semibold">{t('common.cancel')}</button>
        </form>
      )}

      <div className="p-3 rounded-lg bg-gray-800/50 mb-4">
        <TrainingVideoForm
          label={t('super.training.add')}
          submitLabel={t('super.training.add')}
          busy={busy}
          onSubmit={(video) => write(() => addVideo({ type_id: type.id, ...video, sort_order: nextSortOrder(videos) }), isOk)}
        />
      </div>

      {videos.length === 0 && <p className="text-gray-400">{t('super.training.noVideos')}</p>}

      <ul className="space-y-4">
        {videos.map((video, i) => (
          <li key={video.id} className="p-3 rounded-lg bg-gray-800">
            <TrainingVideo
              youtubeId={video.youtube_id}
              title={video.title}
              playing={playing === video.id}
              onPlay={() => setPlaying(video.id)}
            />
            {editing === video.id ? (
              <div className="mt-2">
                <TrainingVideoForm
                  label={t('common.edit')}
                  submitLabel={t('common.save')}
                  initial={video}
                  busy={busy}
                  onSubmit={async (changed) => {
                    const outcome = await write(() => updateVideo(video.id, changed), isOk)
                    if (outcome === 'ok') setEditing(null)
                    return outcome
                  }}
                  onCancel={() => setEditing(null)}
                />
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-2">
                <p className="flex-1 min-w-0 font-semibold truncate">{video.title}</p>
                <MoveButtons
                  canUp={i > 0}
                  canDown={i < videos.length - 1}
                  onUp={() => move(i, -1)}
                  onDown={() => move(i, 1)}
                  disabled={busy}
                />
                <button onClick={() => setEditing(video.id)} className="h-9 px-3 rounded-lg bg-gray-700 text-sm text-gray-300 hover:text-white">
                  {t('common.edit')}
                </button>
                <button onClick={() => askDeleteVideo(video)} className="h-9 px-3 rounded-lg text-sm text-red-300 hover:bg-red-900/40">
                  {t('super.training.deleteVideo')}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {deleting && (
        <ConfirmDialog
          message={t('super.training.confirmDeleteVideo', { title: deleting.video.title })}
          detail={deleting.uses ? t('super.training.usedIn', { count: deleting.uses }) : undefined}
          confirmLabel={t('super.training.deleteVideo')}
          onConfirm={removeVideo}
          onCancel={() => setDeleting(null)}
          // Not before the warning above can be shown
          busy={busy || deleting.uses === undefined}
        />
      )}
      {confirmDeleteType && (
        <ConfirmDialog
          message={t('super.training.confirmDeleteType', { name: type.name, count: videos.length })}
          confirmLabel={t('super.training.deleteType')}
          onConfirm={removeType}
          onCancel={() => setConfirmDeleteType(false)}
          busy={busy}
        />
      )}
    </div>
  )
}
