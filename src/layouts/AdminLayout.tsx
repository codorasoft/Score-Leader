import { Outlet, Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'
import { LanguageToggle } from '../components/LanguageToggle'
import { LeagueSwitcher } from '../components/LeagueSwitcher'
import { useAdminPath, useFeature, useLeague } from '../contexts/LeagueContext'
import { useMyLeagues } from '../contexts/MyLeaguesContext'

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
)

const ICONS = {
  players: icon('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'),
  newSession: icon('M12 8v8M8 12h8M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20'),
  history: icon('M12 7v5l3 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20'),
  // A pitch: outline, halfway line and centre circle
  lineup: icon('M4 3h16v18H4zM4 12h16M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5'),
  signOut: icon('M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9'),
}

// History is home: the league root, history and everything inside an existing session
function activeTab(pathname: string): 'players' | 'newSession' | 'history' | 'lineup' {
  const [page, sub] = pathname.split('/').slice(3)
  if (page === 'players') return 'players'
  if (page === 'lineups') return 'lineup'
  if (page === 'sessions' && sub === 'new') return 'newSession'
  return 'history'
}

export default function AdminLayout() {
  const { signOut } = useAuth()
  const location = useLocation()
  const { t } = useTranslation()
  const league = useLeague()
  const { leagues, profile } = useMyLeagues()
  const adminPath = useAdminPath()
  const coachBoard = useFeature('coach_board')
  const current = activeTab(location.pathname)
  const owned = leagues.find(l => l.id === league.id)

  type Tab = ReturnType<typeof activeTab>
  const nav: { key: Tab; to: string; label: string }[] = [
    { key: 'players', to: adminPath('/players'), label: t('nav.players') },
    { key: 'newSession', to: adminPath('/sessions/new'), label: t('nav.newSession') },
    { key: 'history', to: adminPath('/history'), label: t('nav.history') },
    ...(coachBoard ? [{ key: 'lineup' as Tab, to: adminPath('/lineups'), label: t('nav.lineup') }] : []),
  ]

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <header className="sticky top-0 z-40 bg-gray-900/95 backdrop-blur border-b border-gray-800">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-4">
          {owned && <LeagueSwitcher current={owned} leagues={leagues} maxLeagues={profile.max_leagues} />}

          <nav className="hidden sm:flex items-center gap-1 text-sm flex-1">
            {nav.map(({ key, to, label }) => (
              <Link
                key={key}
                to={to}
                aria-current={current === key ? 'page' : undefined}
                className={`px-3 py-2 rounded-lg ${current === key ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2 ms-auto sm:ms-0">
            <LanguageToggle />
            <button
              onClick={signOut}
              aria-label={t('nav.signOut')}
              title={t('nav.signOut')}
              className="h-9 px-2 sm:px-3 flex items-center gap-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800"
            >
              <span className="rtl:-scale-x-100">{ICONS.signOut}</span>
              <span className="hidden sm:inline text-xs">{t('nav.signOut')}</span>
            </button>
          </div>
        </div>

        <nav className={`sm:hidden grid ${coachBoard ? 'grid-cols-4' : 'grid-cols-3'} border-t border-gray-800`}>
          {nav.map(({ key, to, label }) => (
            <Link
              key={key}
              to={to}
              aria-current={current === key ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] text-[11px] font-medium border-b-2 ${
                current === key ? 'text-white border-blue-500' : 'text-gray-400 border-transparent'
              }`}
            >
              {ICONS[key]}
              <span className="truncate max-w-full px-1">{label}</span>
            </Link>
          ))}
        </nav>
      </header>

      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  )
}
