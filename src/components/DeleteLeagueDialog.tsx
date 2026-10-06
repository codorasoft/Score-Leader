import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
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
  const titleId = useId()
  const warningId = useId()
  const openerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(false)

  // Return focus to the button that opened the dialog once it closes.
  useEffect(() => {
    if (wasOpen.current && !open) openerRef.current?.focus()
    wasOpen.current = open
  }, [open])

  function close() {
    setOpen(false)
    setTyped('')
    setError('')
  }

  // Escape closes (unless a delete is in flight); Tab and Shift+Tab wrap inside the dialog.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape' && !busy) { e.preventDefault(); close(); return }
    if (e.key !== 'Tab' || !dialogRef.current) return
    const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('input, button:not([disabled])')]
    if (focusable.length === 0) return
    const first = focusable[0], last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
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
      <button ref={openerRef} type="button" onClick={() => setOpen(true)} className="px-3 py-1.5 rounded-lg bg-red-900/60 text-red-300 text-sm hover:bg-red-900">
        {t('super.deleteLeague.open')}
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={warningId}
        onKeyDown={onKeyDown}
        onSubmit={(e) => { e.preventDefault(); confirm() }}
        className="w-full max-w-sm bg-gray-900 rounded-xl p-4 space-y-3"
      >
        <h2 id={titleId} className="font-bold">{t('super.deleteLeague.title', { name: league.name })}</h2>
        <p id={warningId} className="text-sm text-gray-300">{t('super.deleteLeague.warning')}</p>
        <label className="block">
          <span className="block text-sm text-gray-300 mb-1">{t('super.deleteLeague.typeName', { name: league.name })}</span>
          <input
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoFocus
          />
        </label>
        {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={close} className="px-3 py-2 rounded-lg bg-gray-800 text-sm">{t('common.cancel')}</button>
          <button
            type="submit"
            disabled={busy || typed !== league.name}
            className="px-3 py-2 rounded-lg bg-red-700 text-sm font-semibold disabled:opacity-50"
          >
            {busy ? t('super.deleteLeague.deleting') : t('super.deleteLeague.confirm')}
          </button>
        </div>
      </form>
    </div>
  )
}
