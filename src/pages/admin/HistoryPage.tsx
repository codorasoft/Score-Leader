import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import type { Session } from '../../lib/types'

export default function HistoryPage() {
  const { t } = useTranslation()
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeMatchMap, setActiveMatchMap] = useState<Record<string, string>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = async () => {
    const { data } = await supabase
      .from('sessions')
      .select('*')
      .order('date', { ascending: false })
    const rows = (data ?? []) as Session[]
    setSessions(rows)

    const activeIds = rows.filter((s) => s.status === 'active').map((s) => s.id)
    if (activeIds.length === 0) return

    const { data: matchRows } = await supabase
      .from('matches')
      .select('id, session_id, match_number')
      .in('session_id', activeIds)
      .in('status', ['pending', 'active'])
      .order('match_number', { ascending: false })

    const map: Record<string, string> = {}
    for (const m of (matchRows ?? []) as { id: string; session_id: string; match_number: number }[]) {
      if (!map[m.session_id]) map[m.session_id] = m.id
    }
    setActiveMatchMap(map)
  }

  useEffect(() => { load() }, [])

  const startEdit = (s: Session) => {
    setEditingId(s.id)
    setEditDate(s.date)
  }

  const saveEdit = async () => {
    if (!editingId || !editDate.trim()) return
    await supabase.from('sessions').update({ date: editDate.trim() }).eq('id', editingId)
    setEditingId(null)
    load()
  }

  const deleteSession = async (sessionId: string) => {
    setDeleting(true)
    // matches/match_events reference teams without CASCADE, so they must go before the
    // session's cascade removes teams; everything else cascades from the session row.
    const { error } = await supabase.from('matches').delete().eq('session_id', sessionId)
    if (!error) await supabase.from('sessions').delete().eq('id', sessionId)
    setConfirmDeleteId(null)
    setDeleting(false)
    load()
  }

  return (
    <div className="max-w-lg mx-auto p-4">
      <h1 className="text-xl font-bold mb-4">{t('history.title')}</h1>
      {sessions.length === 0 && <p className="text-gray-500 text-center py-8">{t('history.noSessions')}</p>}

      <div className="space-y-3">
        {sessions.map((s) => (
          <div key={s.id} className="bg-gray-800 rounded-xl p-4">
            {/* Date row */}
            <div className="flex items-center justify-between mb-3">
              {editingId === s.id ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="bg-gray-700 border border-gray-500 rounded px-2 py-1 text-sm text-white"
                  />
                  <button onClick={saveEdit} className="px-3 py-1 bg-blue-600 rounded text-xs font-semibold hover:bg-blue-500">
                    {t('common.save')}
                  </button>
                  <button onClick={() => setEditingId(null)} className="px-3 py-1 bg-gray-700 rounded text-xs hover:bg-gray-600">
                    {t('common.cancel')}
                  </button>
                </div>
              ) : (
                <div>
                  <div className="font-semibold">{s.date}</div>
                  <div className={`text-xs mt-0.5 ${
                    s.status === 'completed' ? 'text-green-400' : s.status === 'active' ? 'text-yellow-400' : 'text-gray-400'
                  }`}>
                    {t(`history.status.${s.status}` as const)}
                  </div>
                </div>
              )}
              {editingId !== s.id && (
                <div className="flex gap-1">
                  <button onClick={() => startEdit(s)} className="px-2 py-1 bg-gray-700 rounded text-xs hover:bg-gray-600">
                    {t('history.editDate')}
                  </button>
                  <button onClick={() => setConfirmDeleteId(s.id)} className="px-2 py-1 bg-red-900/60 rounded text-xs text-red-300 hover:bg-red-800">
                    {t('history.deleteSession')}
                  </button>
                </div>
              )}
            </div>

            {/* Action links */}
            {editingId !== s.id && (
              <div className="flex gap-2 flex-wrap">
                <Link to={`/admin/sessions/${s.id}`} className="px-3 py-1 bg-gray-700 rounded text-xs hover:bg-gray-600">
                  {t('history.matches')}
                </Link>
                <Link to={`/s/${s.share_token}`} className="px-3 py-1 bg-gray-700 rounded text-xs hover:bg-gray-600" target="_blank">
                  {t('history.publicLink')}
                </Link>
                {s.status === 'active' && activeMatchMap[s.id] && (
                  <Link to={`/admin/sessions/${s.id}/match/${activeMatchMap[s.id]}`} className="px-3 py-1 bg-green-600 rounded text-xs font-semibold hover:bg-green-500">
                    {t('history.resume')}
                  </Link>
                )}
                {s.status === 'active' && (
                  <Link to={`/admin/sessions/${s.id}/awards`} className="px-3 py-1 bg-blue-600 rounded text-xs hover:bg-blue-500">
                    {t('history.awards')}
                  </Link>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Delete confirmation popup */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setConfirmDeleteId(null)}>
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-xs text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-3xl mb-3">🗑️</div>
            <p className="text-sm text-gray-300 mb-5">{t('history.confirmDeleteSession')}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteId(null)} className="flex-1 py-2 bg-gray-700 rounded font-semibold hover:bg-gray-600">
                {t('common.cancel')}
              </button>
              <button
                onClick={() => deleteSession(confirmDeleteId)}
                disabled={deleting}
                className="flex-1 py-2 bg-red-600 rounded font-semibold hover:bg-red-500 disabled:opacity-50"
              >
                {t('history.deleteSession')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
