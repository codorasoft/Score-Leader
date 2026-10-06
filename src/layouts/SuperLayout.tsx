import { Outlet, NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'
import { LanguageToggle } from '../components/LanguageToggle'

export default function SuperLayout() {
  const { signOut } = useAuth()
  const { t } = useTranslation()
  const tab = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-lg ${isActive ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white'}`

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <header className="sticky top-0 z-40 bg-gray-900/95 backdrop-blur border-b border-gray-800">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-4">
          <span className="font-bold text-sm hidden sm:inline">{t('super.brand')}</span>
          <nav className="flex items-center gap-1 text-sm flex-1">
            <NavLink to="/super" end className={tab}>{t('super.tabs.admins')}</NavLink>
            <NavLink to="/super/leagues" className={tab}>{t('super.tabs.leagues')}</NavLink>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <button
              onClick={signOut}
              className="h-9 px-3 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-gray-800"
            >
              {t('nav.signOut')}
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  )
}
