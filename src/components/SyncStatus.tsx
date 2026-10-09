import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Outbox } from '../lib/outbox'

export function useOutboxStatus(outbox: Outbox) {
  const read = () => ({ pending: outbox.pending().length, flushing: outbox.isFlushing(), rejected: outbox.rejected() })
  const [status, setStatus] = useState(read)
  useEffect(() => outbox.subscribe(() => setStatus(read())), [outbox])
  return status
}

// Shown on the match screen while changes are waiting on this phone for a signal, and afterwards
// if the server refused any of them: that warning stays until the admin dismisses it.
export function SyncStatus({ outbox }: { outbox: Outbox }) {
  const { t } = useTranslation()
  const { pending, flushing, rejected } = useOutboxStatus(outbox)

  return (
    <>
      {rejected > 0 && (
        <div role="alert" className="mb-4 rounded-xl border border-red-500/70 bg-red-900/30 px-3 py-2.5 flex items-center gap-3">
          <span className="text-xl" aria-hidden="true">⚠️</span>
          <span className="flex-1 text-sm">
            <span className="block font-semibold text-red-200">{t('offline.rejected', { count: rejected })}</span>
            <span className="block text-xs text-red-100/80">{t('offline.rejectedCheck')}</span>
          </span>
          <button onClick={() => outbox.dismissRejected()} className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold shrink-0">
            {t('offline.rejectedOk')}
          </button>
        </div>
      )}
      {pending > 0 && <Waiting outbox={outbox} pending={pending} flushing={flushing} />}
    </>
  )
}

function Waiting({ outbox, pending, flushing }: { outbox: Outbox; pending: number; flushing: boolean }) {
  const { t } = useTranslation()
  return (
    <div role="status" className="mb-4 rounded-xl border border-orange-500/70 bg-orange-900/30 px-3 py-2.5 flex items-center gap-3">
      <span className="text-xl" aria-hidden="true">{flushing ? '🔄' : '📶'}</span>
      <span className="flex-1 text-sm">
        <span className="block font-semibold text-orange-200">
          {flushing ? t('offline.sending') : t('offline.noSignal')}
        </span>
        <span className="block text-xs text-orange-100/80">{t('offline.saved', { count: pending })}</span>
      </span>
      {!flushing && (
        <button onClick={() => outbox.flush()} className="px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-xs font-semibold shrink-0">
          {t('offline.retry')}
        </button>
      )}
    </div>
  )
}
