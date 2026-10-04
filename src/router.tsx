import { createBrowserRouter } from 'react-router-dom'

// Lazy placeholders — pages are filled in their respective tasks
const Placeholder = ({ name }: { name: string }) => (
  <div className="p-4 text-gray-400">{name}</div>
)

export const router = createBrowserRouter([
  { path: '/login', element: <Placeholder name="Login" /> },
  {
    path: '/admin',
    element: <Placeholder name="AdminLayout" />,
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
