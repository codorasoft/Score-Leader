import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { onToast, type ToastMessage } from '../lib/toast'

const DISMISS_MS = 6000

export function Toaster() {
  const { t } = useTranslation()
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  useEffect(() => onToast((toast) => {
    setToasts((list) =>
      list.some((x) => x.kind === toast.kind && x.detail === toast.detail) ? list : [...list, toast],
    )
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== toast.id)), DISMISS_MS)
  }), [])

  const dismiss = (id: number) => setToasts((list) => list.filter((x) => x.id !== id))

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 inset-x-4 z-[100] flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          role="alert"
          onClick={() => dismiss(toast.id)}
          className="pointer-events-auto w-full max-w-sm bg-red-700 text-white text-sm font-semibold rounded-xl px-4 py-3 shadow-lg text-start"
        >
          {toast.kind === 'network'
            ? t('errors.network')
            : t('errors.requestFailed', { detail: toast.detail ?? t('errors.unknown') })}
        </button>
      ))}
    </div>
  )
}
