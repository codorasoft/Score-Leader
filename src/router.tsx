import { createBrowserRouter } from 'react-router-dom'
import AuthGuard from './components/AuthGuard'
import LoginPage from './pages/LoginPage'
import AdminLayout from './layouts/AdminLayout'
import PublicLayout from './layouts/PublicLayout'

import PlayersPage from './pages/admin/PlayersPage'
import NewSessionPage from './pages/admin/NewSessionPage'
import TeamBuilderPage from './pages/admin/TeamBuilderPage'
import MatchTrackerPage from './pages/admin/MatchTrackerPage'
import AwardsPage from './pages/admin/AwardsPage'
import HistoryPage from './pages/admin/HistoryPage'

import LiveSessionPage from './pages/public/LiveSessionPage'
import VotePage from './pages/public/VotePage'
import LeaderboardPage from './pages/public/LeaderboardPage'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/leaderboard', element: <PublicLayout />, children: [{ index: true, element: <LeaderboardPage /> }] },
  { path: '/s/vote/:voteToken', element: <PublicLayout />, children: [{ index: true, element: <VotePage /> }] },
  { path: '/s/:token', element: <PublicLayout />, children: [{ index: true, element: <LiveSessionPage /> }] },
  {
    path: '/admin',
    element: <AuthGuard />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { index: true, element: <HistoryPage /> },
          { path: 'players', element: <PlayersPage /> },
          { path: 'sessions/new', element: <NewSessionPage /> },
          { path: 'sessions/:sessionId/teams', element: <TeamBuilderPage /> },
          { path: 'sessions/:sessionId/match/:matchId', element: <MatchTrackerPage /> },
          { path: 'sessions/:sessionId/awards', element: <AwardsPage /> },
          { path: 'history', element: <HistoryPage /> },
        ],
      },
    ],
  },
  { path: '/', element: <LoginPage /> },
])
