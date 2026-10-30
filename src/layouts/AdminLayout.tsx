import { useEffect, useState } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'
import { LanguageToggle } from '../components/LanguageToggle'
import { LeagueSwitcher } from '../components/LeagueSwitcher'
import TodayReminder from '../components/TodayReminder'
import { useAdminPath, useFeature, useLeague } from '../contexts/LeagueContext'
import { useMyLeagues } from '../contexts/MyLeaguesContext'
import { keepPushRight } from '../lib/push'

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
)

const ICONS = {
  home: icon('M3 11l9-8 9 8M5 9.5V21h5v-6h4v6h5V9.5'),
  players: icon('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'),
  history: icon('M12 7v5l3 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20'),
  // A pitch: outline, halfway line and centre circle
  lineup: icon('M4 3h16v18H4zM4 12h16M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5'),
  // A screen with a play button
  training: icon('M4 5h16v14H4zM10 9l5 3-5 3z'),
  // A calendar page
  schedule: icon('M5 5h14v15H5zM5 10h14M9 3v4M15 3v4'),
  signOut: icon('M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9'),
  // Three dots
  more: icon('M5 12h.01M12 12h.01M19 12h.01'),
  settings: icon('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'),
}

// A phone's bottom bar has room for four big tabs; with more, the last ones go under More
const BAR_TABS = 4

// The match screen is a focused view: no bottom bar, so nothing sits between the coach and the match
const matchSessionId = (pathname: string) => /\/sessions\/([^/]+)\/match\//.exec(pathname)?.[1] ?? null

// History covers the history list and everything inside an existing session
function activeTab(pathname: string): 'home' | 'players' | 'history' | 'training' | 'lineup' | 'schedule' | null {
  const [page] = pathname.split('/').slice(3)
  if (!page || page === 'home') return 'home'
  if (page === 'settings') return null
  if (page === 'players') return 'players'
  if (page === 'trainings') return 'training'
  if (page === 'lineups') return 'lineup'
  if (page === 'schedule') return 'schedule'
  return 'history'
}

export default function AdminLayout() {
  const { signOut } = useAuth()
  const location = useLocation()
  const { t, i18n } = useTranslation()
  const league = useLeague()
  const { leagues, profile } = useMyLeagues()
  const adminPath = useAdminPath()
  const coachBoard = useFeature('coach_board')
  const training = useFeature('training')
  const schedule = useFeature('schedule')
  const current = activeTab(location.pathname)
  const inMatch = matchSessionId(location.pathname)
  const showBar = !inMatch

  // Pages pin their main button just above the bottom bar (the action-bar class in index.css)
  useEffect(() => {
    document.documentElement.classList.toggle('has-bottom-bar', showBar)
    return () => document.documentElement.classList.remove('has-bottom-bar')
  }, [showBar])

  // A device with the morning notification on follows its coach: a new time zone, another
  // language, or an address the browser renewed is saved again without his doing anything
  useEffect(() => {
    if (schedule) keepPushRight(i18n.language)
  }, [schedule, i18n.language])
  const owned = leagues.find(l => l.id === league.id)

  type Tab = ReturnType<typeof activeTab>
  const nav: { key: NonNullable<Tab>; to: string; label: string }[] = [
    { key: 'home', to: adminPath('/home'), label: t('nav.home') },
    { key: 'players', to: adminPath('/players'), label: t('nav.players') },
    { key: 'history', to: adminPath('/history'), label: t('nav.history') },
    ...(training ? [{ key: 'training' as const, to: adminPath('/trainings'), label: t('nav.training') }] : []),
    ...(coachBoard ? [{ key: 'lineup' as const, to: adminPath('/lineups'), label: t('nav.lineup') }] : []),
    ...(schedule ? [{ key: 'schedule' as const, to: adminPath('/schedule'), label: t('nav.schedule') }] : []),
  ]

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <header className="sticky top-0 z-40 bg-gray-900/95 backdrop-blur border-b border-gray-800">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-4">
          {/* On a phone the match screen has no tab bar; its way out is back to the session */}
          {inMatch && (
            <Link to={adminPath(`/sessions/${inMatch}`)} className="lg:hidden h-10 px-3 -ms-3 flex items-center gap-1 rounded-lg text-gray-200 hover:bg-gray-800 font-semibold">
              <span aria-hidden="true" className="rtl:-scale-x-100">←</span> {t('match.backToSession')}
            </Link>
          )}
          {owned && (
            <div className={`min-w-0 ${inMatch ? 'hidden lg:block' : ''}`}>
              <LeagueSwitcher current={owned} leagues={leagues} maxLeagues={profile.max_leagues} />
            </div>
          )}

          <nav className="hidden lg:flex items-center gap-1 text-sm flex-1 min-w-0">
            {nav.map(({ key, to, label }) => (
              <Link
                key={key}
                to={to}
                aria-current={current === key ? 'page' : undefined}
                className={`px-3 py-2 rounded-lg whitespace-nowrap ${current === key ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2 ms-auto lg:ms-0">
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

      </header>

      <main className="page-enter flex-1 px-4 pt-6 pb-6 max-w-2xl mx-auto w-full">
        <Outlet />
      </main>

      {showBar && <BottomBar nav={nav} current={current} settingsTo={owned ? adminPath('/settings') : null} />}

      <TodayReminder />
    </div>
  )
}

type NavItem = { key: keyof typeof ICONS; to: string; label: string }

// The phone's tab bar, fixed to the bottom of the screen where the thumb is. With more tabs than
// fit, the last ones and the league settings open from More, as a sheet rising from the bar.
function BottomBar({ nav, current, settingsTo }: { nav: NavItem[]; current: string | null; settingsTo: string | null }) {
  const { t } = useTranslation()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const overflow = nav.length > BAR_TABS
  const shown = overflow ? nav.slice(0, BAR_TABS - 1) : nav
  const extra: NavItem[] = overflow ? nav.slice(BAR_TABS - 1) : []
  if (overflow && settingsTo) extra.push({ key: 'settings', to: settingsTo, label: t('league.settings') })
  const moreCurrent = extra.some((item) => item.key === current || (item.key === 'settings' && location.pathname.endsWith('/settings')))
  const columns = shown.length + (overflow ? 1 : 0)

  // Leaving for another page closes the sheet
  useEffect(() => { setMoreOpen(false) }, [location.pathname])

  const tab = (on: boolean) => `flex flex-col items-center justify-center gap-0.5 min-h-[56px] px-1 text-[11px] font-medium ${
    on ? 'text-white' : 'text-gray-400'
  }`
  const mark = (on: boolean) => `flex items-center justify-center w-12 h-7 rounded-full ${on ? 'bg-blue-600/25 text-blue-300' : ''}`

  return (
    <>
      {moreOpen && (
        <div className="dialog-backdrop lg:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setMoreOpen(false)}>
          <div
            id="more-menu"
            className="absolute inset-x-0 bottom-[var(--bottom-bar)] bg-gray-800 rounded-t-2xl p-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <ul className="flex flex-col gap-1">
              {extra.map(({ key, to, label }) => (
                <li key={key}>
                  <Link
                    to={to}
                    aria-current={current === key ? 'page' : undefined}
                    className={`flex items-center gap-3 min-h-[52px] px-4 rounded-xl text-base font-medium ${current === key ? 'bg-gray-700 text-white' : 'text-gray-200 hover:bg-gray-700'}`}
                  >
                    {ICONS[key]}
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <nav
        aria-label={t('nav.tabs')}
        className="lg:hidden fixed inset-x-0 bottom-0 z-40 grid bg-gray-900/95 backdrop-blur border-t border-gray-800 pb-[env(safe-area-inset-bottom)]"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {shown.map(({ key, to, label }) => (
          <Link key={key} to={to} aria-current={current === key ? 'page' : undefined} className={tab(current === key)}>
            <span className={mark(current === key)}>{ICONS[key]}</span>
            <span className="max-w-full px-1 text-center leading-tight line-clamp-2">{label}</span>
          </Link>
        ))}
        {overflow && (
          <button type="button" onClick={() => setMoreOpen((open) => !open)} aria-expanded={moreOpen} aria-controls="more-menu" className={tab(moreCurrent || moreOpen)}>
            <span className={mark(moreCurrent || moreOpen)}>{ICONS.more}</span>
            <span className="max-w-full px-1 text-center leading-tight">{t('nav.more')}</span>
          </button>
        )}
      </nav>
    </>
  )
}
