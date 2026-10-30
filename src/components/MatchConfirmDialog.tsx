import { useTranslation } from 'react-i18next'

// "Are you sure?" on the match screen, for undoing an event or ending a period early. Tapping outside cancels.
export function MatchConfirmDialog({ warning = false, title, body, confirmLabel, onConfirm, onCancel }: {
  // Ending early is shown as a warning, with an icon above the title
  warning?: boolean
  title: string
  body: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="dialog-backdrop fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-xs text-center" onClick={(e) => e.stopPropagation()}>
        {warning && <div className="text-2xl mb-3">⚠️</div>}
        <h2 className="text-lg font-bold mb-2">{title}</h2>
        <p className={`text-sm ${warning ? 'text-gray-400' : 'text-gray-300'} mb-5`}>{body}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2 bg-gray-700 rounded font-semibold hover:bg-gray-600">
            {t('common.cancel')}
          </button>
          <button onClick={onConfirm} className="flex-1 py-2 bg-red-600 rounded font-semibold hover:bg-red-500">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
