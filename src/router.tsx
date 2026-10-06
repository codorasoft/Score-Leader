import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom'
import { Suspense, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import NotAvailablePage from './pages/NotAvailablePage'
import PublicLeagueRoute from './routes/PublicLeagueRoute'
import SessionLeagueRoute from './routes/SessionLeagueRoute'
import FeatureRoute from './routes/FeatureRoute'
import { LegacyAdminRedirect, LegacyPublicRedirect } from './routes/LegacyRedirects'
import { MyLeaguesRoute } from './contexts/MyLeaguesContext'
import { lazyPage } from './lib/lazyPage'

const RequireRole = lazyPage(() => import('./components/RequireRole'))
const LoginPage = lazyPage(() => import('./pages/LoginPage'))
const AdminHome = lazyPage(() => import('./routes/AdminHome'))
const AdminLeagueRoute = lazyPage(() => import('./routes/AdminLeagueRoute'))
const PlayersPage = lazyPage(() => import('./pages/admin/PlayersPage'))
const AttendancePage = lazyPage(() => import('./pages/admin/AttendancePage'))
const TeamBuilderPage = lazyPage(() => import('./pages/admin/TeamBuilderPage'))
const MatchTrackerPage = lazyPage(() => import('./pages/admin/MatchTrackerPage'))
const AwardsPage = lazyPage(() => import('./pages/admin/AwardsPage'))
const SessionDetailPage = lazyPage(() => import('./pages/admin/SessionDetailPage'))
const HistoryPage = lazyPage(() => import('./pages/admin/HistoryPage'))
const LineupsPage = lazyPage(() => import('./pages/admin/LineupsPage'))
const LineupEditorPage = lazyPage(() => import('./pages/admin/LineupEditorPage'))
const SuperLayout = lazyPage(() => import('./layouts/SuperLayout'))
const AdminsPage = lazyPage(() => import('./pages/super/AdminsPage'))
const NewAdminPage = lazyPage(() => import('./pages/super/NewAdminPage'))
const AdminDetailPage = lazyPage(() => import('./pages/super/AdminDetailPage'))
const LeaguesPage = lazyPage(() => import('./pages/super/LeaguesPage'))
const NewLeaguePage = lazyPage(() => import('./pages/admin/NewLeaguePage'))
const LeagueSettingsPage = lazyPage(() => import('./pages/admin/LeagueSettingsPage'))
const HomePage = lazyPage(() => import('./pages/admin/HomePage'))

const LiveSessionPage = lazyPage(() => import('./pages/public/LiveSessionPage'))
const VotePage = lazyPage(() => import('./pages/public/VotePage'))
const LeaderboardPage = lazyPage(() => import('./pages/public/LeaderboardPage'))
const PlayerProfilePage = lazyPage(() => import('./pages/public/PlayerProfilePage'))
const RecordsPage = lazyPage(() => import('./pages/public/RecordsPage'))
const CardsPage = lazyPage(() => import('./pages/public/CardsPage'))
const LeagueHomePage = lazyPage(() => import('./pages/public/LeagueHomePage'))

// Each page's code is fetched when it is first opened, so a player opening a vote or live link
// doesn't download the admin app
function PageLoading() {
  const { t } = useTranslation()
  return <div className="p-4 text-gray-400">{t('common.loading')}</div>
}
const page = (node: ReactNode) => <Suspense fallback={<PageLoading />}>{node}</Suspense>

const legacyPublic = { element: <LegacyPublicRedirect /> }
const legacyAdmin = { element: <LegacyAdminRedirect /> }
const coachBoard = (page: ReactNode) => <FeatureRoute name="coach_board" fallback="history">{page}</FeatureRoute>

export const routes: RouteObject[] = [
  { path: '/login', element: page(<LoginPage />) },
  { path: '/', element: page(<LoginPage />) },
  {
    path: '/super',
    element: page(<RequireRole role="superadmin" />),
    children: [
      {
        element: page(<SuperLayout />),
        children: [
          { index: true, element: page(<AdminsPage />) },
          { path: 'admins/new', element: page(<NewAdminPage />) },
          { path: 'admins/:userId', element: page(<AdminDetailPage />) },
          { path: 'leagues', element: page(<LeaguesPage />) },
        ],
      },
    ],
  },
  {
    path: '/admin',
    element: page(<RequireRole role="admin" />),
    children: [
      {
        element: <MyLeaguesRoute />,
        children: [
          { index: true, element: page(<AdminHome />) },
          { path: 'leagues/new', element: page(<NewLeaguePage />) },
          { path: 'players', ...legacyAdmin },
          { path: 'history', ...legacyAdmin },
          { path: 'lineups/*', ...legacyAdmin },
          { path: 'sessions/*', ...legacyAdmin },
          {
            path: ':slug',
            element: page(<AdminLeagueRoute />),
            children: [
              { index: true, element: <Navigate to="home" replace /> },
              { path: 'home', element: page(<HomePage />) },
              { path: 'history', element: page(<HistoryPage />) },
              { path: 'players', element: page(<PlayersPage />) },
              { path: 'settings', element: page(<LeagueSettingsPage />) },
              // Sessions start from the Home popup; old links open it there
              { path: 'sessions/new', element: <Navigate to="../home?new=1" replace /> },
              { path: 'sessions/:sessionId/players', element: page(<AttendancePage />) },
              { path: 'sessions/:sessionId', element: page(<SessionDetailPage />) },
              { path: 'sessions/:sessionId/teams', element: page(<TeamBuilderPage />) },
              { path: 'sessions/:sessionId/match/:matchId', element: page(<MatchTrackerPage />) },
              {
                path: 'sessions/:sessionId/awards',
                element: <FeatureRoute name="awards" fallback="history">{page(<AwardsPage />)}</FeatureRoute>,
              },
              { path: 'lineups', element: coachBoard(page(<LineupsPage />)) },
              { path: 'lineups/new', element: coachBoard(page(<LineupEditorPage />)) },
              { path: 'lineups/:lineupId', element: coachBoard(page(<LineupEditorPage />)) },
            ],
          },
        ],
      },
    ],
  },
  {
    path: '/l/:slug',
    element: <PublicLeagueRoute />,
    children: [
      { index: true, element: page(<LeagueHomePage />) },
      { path: 'leaderboard', element: <FeatureRoute name="leaderboard" fallback="notFound">{page(<LeaderboardPage />)}</FeatureRoute> },
      { path: 'records', element: <FeatureRoute name="records" fallback="notFound">{page(<RecordsPage />)}</FeatureRoute> },
      { path: 'cards', element: <FeatureRoute name="player_cards" fallback="notFound">{page(<CardsPage />)}</FeatureRoute> },
      { path: 'players/:playerId', element: <FeatureRoute name="profiles" fallback="notFound">{page(<PlayerProfilePage />)}</FeatureRoute> },
    ],
  },
  { path: '/s/vote/:voteToken', element: <SessionLeagueRoute />, children: [{ index: true, element: page(<VotePage />) }] },
  { path: '/s/:token', element: <SessionLeagueRoute />, children: [{ index: true, element: page(<LiveSessionPage />) }] },
  { path: '/leaderboard', ...legacyPublic },
  { path: '/records', ...legacyPublic },
  { path: '/cards', ...legacyPublic },
  { path: '/players/:playerId', ...legacyPublic },
  { path: '*', element: <NotAvailablePage kind="page" /> },
]

export const router = createBrowserRouter(routes)
