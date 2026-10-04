import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Session } from '../../lib/types'

export default function HistoryPage() {
  const [sessions, setSessions] = useState<Session[]>([])

  useEffect(() => {
    supabase.from('sessions').select('*').order('date', { ascending: false })
      .then(({ data }) => setSessions((data ?? []) as Session[]))
  }, [])

  return (
    <div className="max-w-lg mx-auto p-4">
      <h1 className="text-xl font-bold mb-4">Session History</h1>
      {sessions.length === 0 && <p className="text-gray-500 text-center py-8">No sessions yet</p>}
      <div className="space-y-3">
        {sessions.map((s) => (
          <div key={s.id} className="bg-gray-800 rounded-xl p-4 flex items-center justify-between">
            <div>
              <div className="font-semibold">{s.date}</div>
              <div className={`text-xs capitalize mt-1 ${
                s.status === 'completed' ? 'text-green-400' : s.status === 'active' ? 'text-yellow-400' : 'text-gray-400'
              }`}>{s.status}</div>
            </div>
            <div className="flex gap-2">
              <Link
                to={`/s/${s.share_token}`}
                className="px-3 py-1 bg-gray-700 rounded text-xs hover:bg-gray-600"
                target="_blank"
              >
                Public link
              </Link>
              {s.status === 'active' && (
                <Link to={`/admin/sessions/${s.id}/awards`}
                  className="px-3 py-1 bg-blue-600 rounded text-xs">
                  Awards
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
