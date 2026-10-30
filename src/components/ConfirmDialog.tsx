import { useTranslation } from 'react-i18next'

interface Props {
  message: string
  // A second, quieter line: what else the action takes with it
  detail?: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
}

// "Are you sure?" for an action that deletes something. Tapping outside cancels.
export default function ConfirmDialog({ message, detail, confirmLabel, onConfirm, onCancel, busy }: Props) {
  const { t } = useTranslation()
  return (
    <div className="dialog-backdrop fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div role="dialog" aria-modal="true" className="bg-gray-800 rounded-xl p-6 w-full max-w-xs text-center" onClick={(e) => e.stopPropagation()}>
        <p className="font-bold">{message}</p>
        {detail && <p className="text-sm text-gray-300 mt-2">{detail}</p>}
        <div className="flex gap-3 mt-5">
          <button type="button" onClick={onCancel} className="flex-1 py-2 bg-gray-700 rounded font-semibold">{t('common.cancel')}</button>
          <button type="button" onClick={onConfirm} disabled={busy} className="flex-1 py-2 bg-red-600 rounded font-semibold disabled:opacity-50">{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
