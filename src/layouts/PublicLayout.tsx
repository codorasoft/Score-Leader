import { Outlet, Link, useLocation } from 'react-router-dom'

export default function PublicLayout() {
  const location = useLocation()

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <Link to="/" className="font-bold text-lg tracking-tight">Score<span className="text-blue-400">Leader</span></Link>
        <nav className="flex gap-4 text-sm">
          <Link to="/leaderboard" className={`hover:text-white ${location.pathname === '/leaderboard' ? 'text-white' : 'text-gray-400'}`}>Leaderboard</Link>
        </nav>
      </header>
      <main className="px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
