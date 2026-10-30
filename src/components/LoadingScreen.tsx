import { useTranslation } from 'react-i18next'

export default function LoadingScreen() {
  const { t } = useTranslation()
  return (
    <div className="min-h-dvh flex items-center justify-center bg-gray-900">
      <div className="text-gray-400">{t('common.loading')}</div>
    </div>
  )
}
