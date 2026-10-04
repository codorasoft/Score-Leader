import { Outlet, Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LanguageToggle } from '../components/LanguageToggle'

export default function PublicLayout() {
  const location = useLocation()
  const { t } = useTranslation()

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="sticky top-0 z-40 bg-gray-900/95 backdrop-blur border-b border-gray-800">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between gap-4">
        <Link to="/" className="font-bold text-lg tracking-tight shrink-0" dir="ltr">Score<span className="text-blue-400">Leader</span></Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link to="/leaderboard" className={`px-3 py-2 rounded-lg hover:text-white ${location.pathname === '/leaderboard' ? 'bg-gray-800 text-white' : 'text-gray-400'}`}>
            {t('nav.leaderboard')}
          </Link>
          <LanguageToggle />
        </nav>
        </div>
      </header>
      <main className="px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
