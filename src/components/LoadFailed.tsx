import { useTranslation } from 'react-i18next'

export default function LoadFailed({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-900 text-white px-4 text-center">
      <p className="text-gray-300">{t('common.loadFailed')}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
      >
        {t('common.retry')}
      </button>
    </div>
  )
}
