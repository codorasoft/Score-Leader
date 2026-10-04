import { Outlet, Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'
import { LanguageToggle } from '../components/LanguageToggle'

export default function AdminLayout() {
  const { signOut } = useAuth()
  const location = useLocation()
  const { t } = useTranslation()

  const nav = [
    { to: '/admin/players', label: t('nav.players') },
    { to: '/admin/sessions/new', label: t('nav.newSession') },
    { to: '/admin/history', label: t('nav.history') },
  ]

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <header className="border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <Link to="/admin" className="font-bold text-lg">Score<span className="text-blue-400">Leader</span></Link>
        <nav className="flex gap-4 text-sm">
          {nav.map(({ to, label }) => (
            <Link key={to} to={to}
              className={`hover:text-white ${location.pathname.startsWith(to) ? 'text-white' : 'text-gray-400'}`}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <LanguageToggle />
          <button onClick={signOut} className="text-xs text-gray-400 hover:text-white">{t('nav.signOut')}</button>
        </div>
      </header>
      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  )
}
