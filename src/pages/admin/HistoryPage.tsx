import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLeague, useAdminPath } from '../../contexts/LeagueContext'
import { supabase } from '../../lib/supabase'
import type { Session } from '../../lib/types'

const tile = 'min-h-[56px] rounded-lg bg-gray-700 hover:bg-gray-600 text-[11px] leading-tight font-semibold flex flex-col items-center justify-center gap-0.5 px-1 text-center'

export default function HistoryPage() {
  const { t } = useTranslation()
  const league = useLeague()
  const adminPath = useAdminPath()
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
      .eq('league_id', league.id)
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

  useEffect(() => { load() }, [league.id])

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
          <div key={s.id} className="bg-gray-800 rounded-xl p-4 space-y-3">
            {editingId === s.id ? (
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="bg-gray-700 border border-gray-500 rounded px-2 py-1.5 text-sm text-white"
                />
                <button onClick={saveEdit} className="px-3 py-1.5 bg-blue-600 rounded text-sm font-semibold hover:bg-blue-500">
                  {t('common.save')}
                </button>
                <button onClick={() => setEditingId(null)} className="px-3 py-1.5 bg-gray-700 rounded text-sm hover:bg-gray-600">
                  {t('common.cancel')}
                </button>
              </div>
            ) : (
              <>
                {/* Row 1: date and status */}
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-lg" dir="ltr">{s.date}</span>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    s.status === 'completed' ? 'bg-green-900/50 text-green-300'
                      : s.status === 'active' ? 'bg-yellow-900/50 text-yellow-300'
                      : 'bg-gray-700 text-gray-300'
                  }`}>
                    {t(`history.status.${s.status}` as const)}
                  </span>
                </div>

                {/* Live-session actions get their own prominent row */}
                {s.status === 'active' && (
                  <div className="grid grid-cols-2 gap-2">
                    {activeMatchMap[s.id] ? (
                      <Link to={adminPath(`/sessions/${s.id}/match/${activeMatchMap[s.id]}`)} className="min-h-[44px] rounded-lg bg-green-600 hover:bg-green-500 text-sm font-semibold flex items-center justify-center gap-2">
                        <span aria-hidden="true">▶</span> {t('history.resume')}
                      </Link>
                    ) : <span />}
                    <Link to={adminPath(`/sessions/${s.id}/awards`)} className="min-h-[44px] rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-semibold flex items-center justify-center gap-2">
                      <span aria-hidden="true">🏆</span> {t('history.awards')}
                    </Link>
                  </div>
                )}

                {/* Row 2: the four session buttons */}
                <div className="grid grid-cols-4 gap-2">
                  <Link to={adminPath(`/sessions/${s.id}`)} className={tile}>
                    <span className="text-lg" aria-hidden="true">📋</span>{t('history.matches')}
                  </Link>
                  <Link to={`/s/${s.share_token}`} target="_blank" className={tile}>
                    <span className="text-lg" aria-hidden="true">🔗</span>{t('history.publicLink')}
                  </Link>
                  <button onClick={() => startEdit(s)} className={tile}>
                    <span className="text-lg" aria-hidden="true">✏️</span>{t('history.editDate')}
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(s.id)}
                    aria-label={t('history.deleteSession')}
                    className={`${tile} !bg-red-900/40 border border-red-700/60 text-red-200 hover:!bg-red-900/70`}
                  >
                    <span className="text-lg" aria-hidden="true">🗑️</span>{t('history.deleteShort')}
                  </button>
                </div>
              </>
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
