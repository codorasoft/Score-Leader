import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import type { Session } from '../../lib/types'

export default function HistoryPage() {
  const { t } = useTranslation()
  const [sessions, setSessions] = useState<Session[]>([])
  // Maps sessionId → latest pending matchId so active sessions have a Resume link
  const [activeMatchMap, setActiveMatchMap] = useState<Record<string, string>>({})

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('sessions')
        .select('*')
        .order('date', { ascending: false })
      const rows = (data ?? []) as Session[]
      setSessions(rows)

      const activeIds = rows.filter((s) => s.status === 'active').map((s) => s.id)
      if (activeIds.length === 0) return

      // Find the latest pending match for every active session in one query
      const { data: matchRows } = await supabase
        .from('matches')
        .select('id, session_id, match_number')
        .in('session_id', activeIds)
        .eq('status', 'pending')
        .order('match_number', { ascending: false })

      const map: Record<string, string> = {}
      for (const m of (matchRows ?? []) as { id: string; session_id: string; match_number: number }[]) {
        // keep only the highest match_number per session (first occurrence due to DESC order)
        if (!map[m.session_id]) map[m.session_id] = m.id
      }
      setActiveMatchMap(map)
    }
    load()
  }, [])

  return (
    <div className="max-w-lg mx-auto p-4">
      <h1 className="text-xl font-bold mb-4">{t('history.title')}</h1>
      {sessions.length === 0 && <p className="text-gray-500 text-center py-8">{t('history.noSessions')}</p>}
      <div className="space-y-3">
        {sessions.map((s) => (
          <div key={s.id} className="bg-gray-800 rounded-xl p-4 flex items-center justify-between">
            <div>
              <div className="font-semibold">{s.date}</div>
              <div className={`text-xs mt-1 ${
                s.status === 'completed' ? 'text-green-400' : s.status === 'active' ? 'text-yellow-400' : 'text-gray-400'
              }`}>
                {t(`history.status.${s.status}` as const)}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              <Link
                to={`/s/${s.share_token}`}
                className="px-3 py-1 bg-gray-700 rounded text-xs hover:bg-gray-600"
                target="_blank"
              >
                {t('history.publicLink')}
              </Link>
              {s.status === 'active' && activeMatchMap[s.id] && (
                <Link
                  to={`/admin/sessions/${s.id}/match/${activeMatchMap[s.id]}`}
                  className="px-3 py-1 bg-green-600 rounded text-xs font-semibold hover:bg-green-500"
                >
                  {t('history.resume')}
                </Link>
              )}
              {s.status === 'active' && (
                <Link
                  to={`/admin/sessions/${s.id}/awards`}
                  className="px-3 py-1 bg-blue-600 rounded text-xs hover:bg-blue-500"
                >
                  {t('history.awards')}
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
