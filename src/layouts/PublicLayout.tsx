import { Outlet, Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LanguageToggle } from '../components/LanguageToggle'
import { LeagueLogo } from '../components/LeagueLogo'
import { useLeague, usePublicPath } from '../contexts/LeagueContext'
import type { FeatureKey } from '../lib/features'

const NAV: { rest: string; icon: string; key: string; feature: FeatureKey }[] = [
  { rest: '/leaderboard', icon: '📊', key: 'nav.leaderboard', feature: 'leaderboard' },
  { rest: '/records', icon: '🏆', key: 'nav.records', feature: 'records' },
  { rest: '/cards', icon: '🃏', key: 'nav.cards', feature: 'player_cards' },
]

export default function PublicLayout() {
  const location = useLocation()
  const { t } = useTranslation()
  const league = useLeague()
  const publicPath = usePublicPath()
  const items = NAV
    .filter((n) => league.features.includes(n.feature))
    .map((n) => ({ ...n, to: publicPath(n.rest) }))
  const active = (to: string) => location.pathname.startsWith(to)

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="sticky top-0 z-40 bg-gray-900/95 backdrop-blur border-b border-gray-800">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-4">
          <Link to={publicPath()} className="flex items-center gap-2 font-bold text-lg tracking-tight min-w-0">
            <LeagueLogo league={league} size="sm" />
            <span className="truncate">{league.name}</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-1 text-sm flex-1">
            {items.map(({ to, key }) => (
              <Link key={to} to={to} aria-current={active(to) ? 'page' : undefined}
                className={`px-3 py-2 rounded-lg hover:text-white ${active(to) ? 'bg-gray-800 text-white' : 'text-gray-400'}`}>
                {t(key)}
              </Link>
            ))}
          </nav>
          <div className="ms-auto"><LanguageToggle /></div>
        </div>
        {items.length > 0 && (
          <nav className="sm:hidden grid border-t border-gray-800" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
            {items.map(({ to, icon, key }) => (
              <Link key={to} to={to} aria-current={active(to) ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] text-[11px] font-medium border-b-2 ${
                  active(to) ? 'text-white border-blue-500' : 'text-gray-400 border-transparent'
                }`}>
                <span className="text-lg leading-none" aria-hidden="true">{icon}</span>
                {t(key)}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main className="px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
