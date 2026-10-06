import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom'
import type { ReactNode } from 'react'
import RequireRole from './components/RequireRole'
import LoginPage from './pages/LoginPage'
import NotAvailablePage from './pages/NotAvailablePage'
import { MyLeaguesRoute } from './contexts/MyLeaguesContext'
import AdminHome from './routes/AdminHome'
import AdminLeagueRoute from './routes/AdminLeagueRoute'
import PublicLeagueRoute from './routes/PublicLeagueRoute'
import SessionLeagueRoute from './routes/SessionLeagueRoute'
import FeatureRoute from './routes/FeatureRoute'
import { LegacyAdminRedirect, LegacyPublicRedirect } from './routes/LegacyRedirects'

import PlayersPage from './pages/admin/PlayersPage'
import NewSessionPage from './pages/admin/NewSessionPage'
import TeamBuilderPage from './pages/admin/TeamBuilderPage'
import MatchTrackerPage from './pages/admin/MatchTrackerPage'
import AwardsPage from './pages/admin/AwardsPage'
import SessionDetailPage from './pages/admin/SessionDetailPage'
import HistoryPage from './pages/admin/HistoryPage'
import LineupsPage from './pages/admin/LineupsPage'
import LineupEditorPage from './pages/admin/LineupEditorPage'
import SuperLayout from './layouts/SuperLayout'
import AdminsPage from './pages/super/AdminsPage'
import NewAdminPage from './pages/super/NewAdminPage'
import NewLeaguePage from './pages/admin/NewLeaguePage'
import LeagueSettingsPage from './pages/admin/LeagueSettingsPage'

import LiveSessionPage from './pages/public/LiveSessionPage'
import VotePage from './pages/public/VotePage'
import LeaderboardPage from './pages/public/LeaderboardPage'
import PlayerProfilePage from './pages/public/PlayerProfilePage'
import RecordsPage from './pages/public/RecordsPage'
import CardsPage from './pages/public/CardsPage'
import LeagueHomePage from './pages/public/LeagueHomePage'

const legacyPublic = { element: <LegacyPublicRedirect /> }
const legacyAdmin = { element: <LegacyAdminRedirect /> }
const coachBoard = (page: ReactNode) => <FeatureRoute name="coach_board" fallback="history">{page}</FeatureRoute>

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/', element: <LoginPage /> },
  {
    path: '/super',
    element: <RequireRole role="superadmin" />,
    children: [
      {
        element: <SuperLayout />,
        children: [
          { index: true, element: <AdminsPage /> },
          { path: 'admins/new', element: <NewAdminPage /> },
        ],
      },
    ],
  },
  {
    path: '/admin',
    element: <RequireRole role="admin" />,
    children: [
      {
        element: <MyLeaguesRoute />,
        children: [
          { index: true, element: <AdminHome /> },
          { path: 'leagues/new', element: <NewLeaguePage /> },
          { path: 'players', ...legacyAdmin },
          { path: 'history', ...legacyAdmin },
          { path: 'lineups/*', ...legacyAdmin },
          { path: 'sessions/*', ...legacyAdmin },
          {
            path: ':slug',
            element: <AdminLeagueRoute />,
            children: [
              { index: true, element: <Navigate to="history" replace /> },
              { path: 'history', element: <HistoryPage /> },
              { path: 'players', element: <PlayersPage /> },
              { path: 'settings', element: <LeagueSettingsPage /> },
              { path: 'sessions/new', element: <NewSessionPage /> },
              { path: 'sessions/:sessionId', element: <SessionDetailPage /> },
              { path: 'sessions/:sessionId/teams', element: <TeamBuilderPage /> },
              { path: 'sessions/:sessionId/match/:matchId', element: <MatchTrackerPage /> },
              {
                path: 'sessions/:sessionId/awards',
                element: <FeatureRoute name="awards" fallback="history"><AwardsPage /></FeatureRoute>,
              },
              { path: 'lineups', element: coachBoard(<LineupsPage />) },
              { path: 'lineups/new', element: coachBoard(<LineupEditorPage />) },
              { path: 'lineups/:lineupId', element: coachBoard(<LineupEditorPage />) },
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
      { index: true, element: <LeagueHomePage /> },
      { path: 'leaderboard', element: <FeatureRoute name="leaderboard" fallback="notFound"><LeaderboardPage /></FeatureRoute> },
      { path: 'records', element: <FeatureRoute name="records" fallback="notFound"><RecordsPage /></FeatureRoute> },
      { path: 'cards', element: <FeatureRoute name="player_cards" fallback="notFound"><CardsPage /></FeatureRoute> },
      { path: 'players/:playerId', element: <FeatureRoute name="profiles" fallback="notFound"><PlayerProfilePage /></FeatureRoute> },
    ],
  },
  { path: '/s/vote/:voteToken', element: <SessionLeagueRoute />, children: [{ index: true, element: <VotePage /> }] },
  { path: '/s/:token', element: <SessionLeagueRoute />, children: [{ index: true, element: <LiveSessionPage /> }] },
  { path: '/leaderboard', ...legacyPublic },
  { path: '/records', ...legacyPublic },
  { path: '/cards', ...legacyPublic },
  { path: '/players/:playerId', ...legacyPublic },
  { path: '*', element: <NotAvailablePage kind="page" /> },
]

export const router = createBrowserRouter(routes)
