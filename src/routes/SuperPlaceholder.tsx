import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'

// Stands in for the superadmin area until its pages exist.
export default function SuperPlaceholder() {
  const { t } = useTranslation()
  const { signOut } = useAuth()
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-900 text-white">
      <h1 className="text-2xl font-bold">{t('super.title')}</h1>
      <button onClick={signOut} className="text-sm text-gray-400 hover:text-white">{t('nav.signOut')}</button>
    </div>
  )
}
