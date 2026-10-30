import { useEffect } from 'react'
import { useRouteError } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

// Shown instead of the router's own English error screen when a page crashes, or when its
// file still fails to load after lazyPage's one reload
export default function ErrorPage({ reload = () => window.location.reload() }: { reload?: () => void }) {
  const { t } = useTranslation()
  const error = useRouteError()
  useEffect(() => { console.error(error) }, [error])
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-4 bg-gray-900 text-white px-4 text-center">
      <p className="text-gray-300">{t('errorPage.message')}</p>
      <button
        onClick={reload}
        className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
      >
        {t('errorPage.reload')}
      </button>
    </div>
  )
}
