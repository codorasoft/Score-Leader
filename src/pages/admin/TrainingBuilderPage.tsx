import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAdminPath, useLeague } from '../../contexts/LeagueContext'
import { deleteTraining, fetchCatalog, fetchTraining, saveTraining, type Catalog } from '../../lib/trainingApi'
import { localToday } from '../../utils/trainingDays'
import { youtubeThumbnail } from '../../utils/youtube'
import ConfirmDialog from '../../components/ConfirmDialog'
import MoveButtons from '../../components/MoveButtons'
import NotAvailablePage from '../NotAvailablePage'

// Builds a training (a new one, or an existing one under /edit): a day, an optional title and
// the catalog videos picked for it, in the order the team will do them.
export default function TrainingBuilderPage() {
  // Missing on "new"
  const { trainingId } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const league = useLeague()
  const adminPath = useAdminPath()
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed' | 'notFound'>('loading')
  const [catalog, setCatalog] = useState<Catalog>({ types: [], videos: [] })
  const [date, setDate] = useState(localToday)
  const [title, setTitle] = useState('')
  // Video ids in training order
  const [picked, setPicked] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // The one training type whose videos the catalog shows; null shows every type
  const [typeFilter, setTypeFilter] = useState<string | null>(null)

  // Latest request, so a slow response for a training or league we have left is dropped
  const current = useRef('')
  const load = useCallback(() => {
    const request = `${league.id}/${trainingId ?? ''}`
    current.current = request
    setStatus('loading')
    Promise.all([fetchCatalog(), trainingId ? fetchTraining(trainingId, league.id) : null])
      .then(([loaded, training]) => {
        if (current.current !== request) return
        if (trainingId && !training) { setStatus('notFound'); return }
        setCatalog(loaded)
        setDate(training?.training_date ?? localToday())
        setTitle(training?.title ?? '')
        setPicked(training?.videos.map((v) => v.id) ?? [])
        setStatus('ready')
      })
      .catch(() => { if (current.current === request) setStatus('failed') })
  }, [league.id, trainingId])

  useEffect(load, [load])

  if (status === 'failed') {
    return (
      <div className="text-center py-8">
        <p className="text-gray-300 mb-3">{t('common.loadFailed')}</p>
        <button onClick={load} className="px-4 py-2 bg-blue-600 rounded font-semibold hover:bg-blue-700">{t('common.retry')}</button>
      </div>
    )
  }
  if (status === 'loading') return <p className="text-gray-400">{t('common.loading')}</p>
  if (status === 'notFound') return <NotAvailablePage kind="page" embedded />

  const videoById = new Map(catalog.videos.map((v) => [v.id, v]))
  // Types in catalog order, without the ones that hold no video
  const groups = catalog.types
    .map((type) => ({ type, videos: catalog.videos.filter((v) => v.type_id === type.id) }))
    .filter((g) => g.videos.length > 0)
  // A type that is no longer in the catalog filters nothing
  const filtered = groups.filter((g) => g.type.id === typeFilter)
  const shown = filtered.length > 0 ? filtered : groups
  const badge = (on: boolean) =>
    `shrink-0 px-3 py-1.5 rounded-full text-sm border ${on ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:text-white'}`

  const toggle = (id: string) => setPicked((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  const move = (index: number, by: -1 | 1) => setPicked((ids) => {
    const next = [...ids]
    ;[next[index], next[index + by]] = [next[index + by], next[index]]
    return next
  })

  const save = async () => {
    if (saving || !date) return
    setSaving(true)
    const id = await saveTraining({ id: trainingId ?? null, leagueId: league.id, date, title, videoIds: picked })
    // A refused save keeps the form as typed; the failure itself is already on screen as a toast
    // Replaces this page, so Back does not reopen the form that was just saved
    if (id) navigate(adminPath(`/trainings/${id}`), { replace: true })
    else setSaving(false)
  }

  const remove = async () => {
    if (!trainingId || saving) return
    setSaving(true)
    if (await deleteTraining(trainingId)) navigate(adminPath('/trainings'), { replace: true })
    else { setSaving(false); setConfirmDelete(false) }
  }

  // 16px text: an iPhone zooms the whole page when a field with smaller text is tapped
  const field = 'block mt-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-base text-white'
  return (
    <div className="max-w-lg mx-auto">
      <Link to={adminPath(trainingId ? `/trainings/${trainingId}` : '/trainings')} className="text-sm text-blue-400 hover:underline">
        <span aria-hidden="true">‹</span> {t('training.title')}
      </Link>
      <h1 className="text-xl font-bold mt-2 mb-4">{trainingId ? t('common.edit') : t('training.new')}</h1>

      {/* Not a form: Enter in the title (the phone keyboard's Go key) must not save a half-built training */}
      <div>
        {/* One row on every screen. A phone's own date field does not shrink into a fixed width,
            and its Arabic text is long, so the date column is as wide as that field needs and the
            title shrinks into the rest. The wrapper cuts off anything a browser still draws too
            wide instead of letting it widen the page; its padding leaves room for focus rings. */}
        <div className="overflow-hidden p-1 -m-1 mb-5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
            <label className="block min-w-0 text-sm text-gray-400">
              {t('training.titleLabel')}
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className={`${field} w-full min-w-0`} />
            </label>
            <label className="block min-w-0 text-sm text-gray-400">
              {t('training.date')}
              {/* appearance-none: without it an iPhone ignores the widths given to a date field */}
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${field} appearance-none min-w-0 max-w-full`} />
            </label>
          </div>
        </div>

        <h2 className="text-sm font-semibold text-gray-400 mb-2">{t('training.picked')}</h2>
        <ol aria-label={t('training.picked')} className="space-y-2 mb-6">
          {picked.map((id, i) => (
            <li key={id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-800">
              <span className="w-7 h-7 shrink-0 rounded-full bg-blue-600 text-sm font-bold flex items-center justify-center">{i + 1}</span>
              <span className="flex-1 min-w-0 truncate">{videoById.get(id)?.title}</span>
              <MoveButtons canUp={i > 0} canDown={i < picked.length - 1} onUp={() => move(i, -1)} onDown={() => move(i, 1)} />
              <button type="button" onClick={() => toggle(id)} className="h-9 px-3 rounded-lg text-sm text-red-300 hover:bg-red-900/40">
                {t('common.remove')}
              </button>
            </li>
          ))}
        </ol>

        <h2 className="text-sm font-semibold text-gray-400 mb-2">{t('training.catalog')}</h2>
        {groups.length === 0 && <p className="text-gray-500 text-center py-6">{t('training.catalogEmpty')}</p>}
        {groups.length > 0 && (
          // One badge per type, in one line that scrolls sideways on a phone. Picks are kept when the badge changes.
          <div role="group" aria-label={t('training.filter')} className="flex gap-2 overflow-x-auto pb-2 mb-3">
            <button type="button" aria-pressed={shown === groups} onClick={() => setTypeFilter(null)} className={badge(shown === groups)}>
              {t('training.all')}
              <span className="ms-1.5 text-xs opacity-70">{catalog.videos.length}</span>
            </button>
            {groups.map(({ type, videos }) => {
              const on = shown !== groups && type.id === typeFilter
              return (
                <button key={type.id} type="button" aria-pressed={on} onClick={() => setTypeFilter(type.id)} className={badge(on)}>
                  {type.name}
                  <span className="ms-1.5 text-xs opacity-70">{videos.length}</span>
                </button>
              )
            })}
          </div>
        )}
        {shown.map(({ type, videos }) => (
          <section key={type.id} className="mb-4">
            <h3 className="font-semibold mb-2">{type.name}</h3>
            <ul className="space-y-2">
              {videos.map((video) => {
                const on = picked.includes(video.id)
                return (
                  <li key={video.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(video.id)}
                      className={`w-full flex items-center gap-3 p-2 rounded-lg text-start border ${on ? 'bg-blue-900/40 border-blue-500' : 'bg-gray-800 border-transparent hover:bg-gray-700'}`}
                    >
                      <img src={youtubeThumbnail(video.youtube_id)} alt="" loading="lazy" className="w-24 aspect-video object-cover rounded bg-gray-700 shrink-0" />
                      <span className="flex-1 min-w-0">{video.title}</span>
                      {on && (
                        <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0 text-blue-400" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M5 12l5 5 9-10" />
                        </svg>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}

        {/* Stays in reach under a long catalog */}
        <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-gray-900/95 backdrop-blur border-t border-gray-800">
          <button type="button" onClick={save} disabled={saving || !date} className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-semibold disabled:opacity-50">
            {t('common.save')}
          </button>
        </div>
      </div>

      {trainingId && (
        <button onClick={() => setConfirmDelete(true)} className="w-full mt-6 py-2 rounded-lg text-sm text-red-300 hover:bg-red-900/40">
          {t('training.delete')}
        </button>
      )}
      {confirmDelete && (
        <ConfirmDialog
          message={t('training.confirmDelete')}
          confirmLabel={t('training.delete')}
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
          busy={saving}
        />
      )}
    </div>
  )
}
