import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { deleteLeague } from '../lib/adminApi'
import { serverErrorKey } from '../lib/errorText'
import type { League } from '../lib/tenancy'

export default function DeleteLeagueDialog({ league, onDeleted }: { league: Pick<League, 'id' | 'name'>; onDeleted: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function close() {
    setOpen(false)
    setTyped('')
    setError('')
  }

  async function confirm() {
    if (busy || typed !== league.name) return
    setBusy(true)
    setError('')
    const res = await deleteLeague(league.id, typed)
    setBusy(false)
    if ('error' in res) {
      setError(t(serverErrorKey(res.error)))
      return
    }
    close()
    onDeleted()
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="px-3 py-1.5 rounded-lg bg-red-900/60 text-red-300 text-sm hover:bg-red-900">
        {t('super.deleteLeague.open')}
      </button>
    )
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm bg-gray-900 rounded-xl p-4 space-y-3">
        <h2 className="font-bold">{t('super.deleteLeague.title', { name: league.name })}</h2>
        <p className="text-sm text-gray-300">{t('super.deleteLeague.warning')}</p>
        <label className="block">
          <span className="block text-sm text-gray-300 mb-1">{t('super.deleteLeague.typeName', { name: league.name })}</span>
          <input
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
          />
        </label>
        {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={close} className="px-3 py-2 rounded-lg bg-gray-800 text-sm">{t('common.cancel')}</button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy || typed !== league.name}
            className="px-3 py-2 rounded-lg bg-red-700 text-sm font-semibold disabled:opacity-50"
          >
            {busy ? t('super.deleteLeague.deleting') : t('super.deleteLeague.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
