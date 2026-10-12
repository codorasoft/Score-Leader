import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { addType, fetchCatalog, nextSortOrder, swapOrder, type Catalog } from '../../lib/trainingApi'
import MoveButtons from '../../components/MoveButtons'

// The catalog's training types. Every league's coaches pick videos from this one catalog.
export default function TrainingTypesPage() {
  const { t } = useTranslation()
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [failed, setFailed] = useState(false)
  const [name, setName] = useState('')
  // One write at a time, so a second tap cannot add or move twice
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    setFailed(false)
    return fetchCatalog().then(setCatalog).catch(() => setFailed(true))
  }, [])

  useEffect(() => { load() }, [load])

  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (!catalog || busy || !name.trim()) return
    setBusy(true)
    if (await addType(name, nextSortOrder(catalog.types))) {
      setName('')
      await load()
    }
    setBusy(false)
  }

  const move = async (index: number, by: -1 | 1) => {
    if (!catalog || busy) return
    setBusy(true)
    if (await swapOrder('training_types', catalog.types[index], catalog.types[index + by])) await load()
    setBusy(false)
  }

  const videoCount = (typeId: string) => catalog?.videos.filter((v) => v.type_id === typeId).length ?? 0

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">{t('super.training.typesTitle')}</h1>
      {failed ? (
        <div className="text-center py-8">
          <p className="text-gray-300 mb-3">{t('common.loadFailed')}</p>
          <button onClick={load} className="px-4 py-2 bg-blue-600 rounded font-semibold hover:bg-blue-700">{t('common.retry')}</button>
        </div>
      ) : !catalog ? (
        <p className="text-gray-400">{t('common.loading')}</p>
      ) : (
        <>
          <form onSubmit={add} className="flex gap-2 mb-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              aria-label={t('super.training.typeName')}
              placeholder={t('super.training.typeName')}
              className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700"
            />
            <button type="submit" disabled={busy || !name.trim()} className="px-4 py-2 bg-blue-600 rounded-lg font-semibold hover:bg-blue-500 disabled:opacity-50">
              {t('super.training.add')}
            </button>
          </form>

          {catalog.types.length === 0 && <p className="text-gray-400">{t('super.training.typesEmpty')}</p>}

          <ul className="space-y-2">
            {catalog.types.map((type, i) => (
              <li key={type.id} className="flex items-center gap-2 p-3 rounded-lg bg-gray-800">
                <Link to={`/super/training/${type.id}`} className="flex-1 min-w-0">
                  <span className="block font-semibold truncate">{type.name}</span>
                  <span className="block text-xs text-gray-400">{t('training.videoCount', { count: videoCount(type.id) })}</span>
                </Link>
                <MoveButtons
                  canUp={i > 0}
                  canDown={i < catalog.types.length - 1}
                  onUp={() => move(i, -1)}
                  onDown={() => move(i, 1)}
                  disabled={busy}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
