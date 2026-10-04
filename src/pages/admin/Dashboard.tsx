import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Session } from '../../lib/types'

export default function Dashboard() {
  const navigate = useNavigate()
  const [activeSession, setActiveSession] = useState<Session | null>(null)
  const [recentSessions, setRecentSessions] = useState<Session[]>([])

  useEffect(() => {
    supabase
      .from('sessions')
      .select('*')
      .in('status', ['draft', 'active'])
      .order('date', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => setActiveSession(data as Session | null))

    supabase
      .from('sessions')
      .select('*')
      .eq('status', 'completed')
      .order('date', { ascending: false })
      .limit(3)
      .then(({ data }) => setRecentSessions((data as Session[]) ?? []))
  }, [])

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">Dashboard</h1>

      {activeSession ? (
        <div className="bg-blue-900/40 border border-blue-600 rounded-xl p-4 mb-6">
          <p className="text-sm text-blue-300 mb-1">Active session</p>
          <p className="font-bold text-lg">{activeSession.date}</p>
          <button
            onClick={() => navigate(`/admin/sessions/${activeSession.id}/teams`)}
            className="mt-3 px-4 py-2 bg-blue-600 rounded text-sm font-semibold hover:bg-blue-700"
          >
            Continue →
          </button>
        </div>
      ) : (
        <Link
          to="/admin/sessions/new"
          className="inline-block px-6 py-3 bg-green-600 rounded-xl font-bold hover:bg-green-700 mb-6"
        >
          + New Session
        </Link>
      )}

      {recentSessions.length > 0 && (
        <div>
          <h2 className="text-sm text-gray-400 uppercase tracking-wider mb-3">Recent Sessions</h2>
          <div className="space-y-2">
            {recentSessions.map((s) => (
              <div key={s.id} className="bg-gray-800 rounded-lg px-4 py-3 flex items-center justify-between">
                <span className="font-medium">{s.date}</span>
                <span className="text-xs text-gray-400 capitalize">{s.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
