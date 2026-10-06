import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function NotAvailablePage({ kind }: { kind: 'league' | 'page' | 'disabled' }) {
  const { t } = useTranslation()
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-900 text-white px-4 text-center">
      <p className="text-lg text-gray-300">{t(`notAvailable.${kind}`)}</p>
      {kind === 'disabled' && (
        <Link to="/login" className="text-sm text-blue-400 hover:text-blue-300">{t('login.signIn')}</Link>
      )}
    </div>
  )
}
