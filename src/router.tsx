import { createBrowserRouter } from 'react-router-dom'
import AuthGuard from './components/AuthGuard'
import LoginPage from './pages/LoginPage'

const Placeholder = ({ name }: { name: string }) => (
  <div className="p-4 text-gray-400">{name}</div>
)

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/admin',
    element: <AuthGuard />,
    children: [
      { index: true, element: <Placeholder name="Dashboard" /> },
      { path: 'players', element: <Placeholder name="Players" /> },
      { path: 'sessions/new', element: <Placeholder name="NewSession" /> },
      { path: 'sessions/:sessionId/teams', element: <Placeholder name="TeamBuilder" /> },
      { path: 'sessions/:sessionId/match/:matchId', element: <Placeholder name="MatchTracker" /> },
      { path: 'sessions/:sessionId/awards', element: <Placeholder name="Awards" /> },
      { path: 'history', element: <Placeholder name="History" /> },
    ],
  },
  { path: '/s/:token', element: <Placeholder name="PublicSession" /> },
  { path: '/s/vote/:voteToken', element: <Placeholder name="VotePage" /> },
])
