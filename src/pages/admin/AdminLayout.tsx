import { NavLink, Outlet } from 'react-router-dom'

const navItems = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/players', label: 'Players' },
  { to: '/admin/history', label: 'History' },
]

export default function AdminLayout() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <nav className="bg-gray-800 px-4 py-3 flex gap-4 items-center">
        <span className="font-bold text-lg mr-4">Score-Leader</span>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `text-sm px-3 py-1 rounded ${isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:text-white'}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <main className="p-4">
        <Outlet />
      </main>
    </div>
  )
}
