import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLeague, useAdminPath, useFeature } from '../../contexts/LeagueContext'
import { supabase } from '../../lib/supabase'
import type { Session } from '../../lib/types'
import { sessionDate } from '../../utils/sessionDate'

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
)
const MATCHES_ICON = icon('M9 5h10M9 12h10M9 19h10M4 5h.01M4 12h.01M4 19h.01')
const LINK_ICON = icon('M10 14a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1M14 10a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1')
const EDIT_ICON = icon('M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z')
const DELETE_ICON = icon('M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6')
const iconButton = 'w-9 h-9 shrink-0 rounded-lg flex items-center justify-center bg-gray-700 text-gray-200 hover:bg-gray-600'

export default function HistoryPage() {
  const { t, i18n } = useTranslation()
  const league = useLeague()
  const adminPath = useAdminPath()
  const awardsOn = useFeature('awards')
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeMatchMap, setActiveMatchMap] = useState<Record<string, string>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
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
  }, [league.id])

  useEffect(() => { load() }, [load])

  const startEdit = (s: Session) => {
    setEditingId(s.id)
    setEditDate(s.date)
  }

  const finishSession = async (id: string) => {
    const { error } = await supabase.from('sessions').update({ status: 'completed' }).eq('id', id)
    if (!error) load()
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

  // The layout already pads the sides on phones; more would squeeze the date beside the buttons
  return (
    <div className="max-w-lg mx-auto py-4 sm:p-4">
      <h1 className="text-xl font-bold mb-4">{t('history.title')}</h1>
      {sessions.length === 0 && <p className="text-gray-500 text-center py-8">{t('history.noSessions')}</p>}

      <div className="space-y-2">
        {sessions.map((s) => (
          <div key={s.id} className="bg-gray-800 rounded-xl px-3 py-2.5">
            {editingId === s.id ? (
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="h-9 bg-gray-700 border border-gray-500 rounded-lg px-2 text-sm text-white"
                />
                <button onClick={saveEdit} className="h-9 px-3 bg-blue-600 rounded-lg text-sm font-semibold hover:bg-blue-500">
                  {t('common.save')}
                </button>
                <button onClick={() => setEditingId(null)} className="h-9 px-3 bg-gray-700 rounded-lg text-sm hover:bg-gray-600">
                  {t('common.cancel')}
                </button>
              </div>
            ) : (
              <>
                {/* One line: date and status, then icon buttons on the trailing side (right in English, left in Arabic) */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold leading-snug">{sessionDate(s.date, i18n.language)}</div>
                    <span className={`inline-block mt-0.5 text-[10px] leading-4 font-semibold px-1.5 rounded-full ${
                      s.status === 'completed' ? 'bg-green-900/50 text-green-300'
                        : s.status === 'active' ? 'bg-yellow-900/50 text-yellow-300'
                        : 'bg-gray-700 text-gray-300'
                    }`}>
                      {t(`history.status.${s.status}` as const)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Link to={adminPath(`/sessions/${s.id}`)} aria-label={t('history.matches')} title={t('history.matches')} className={iconButton}>
                      {MATCHES_ICON}
                    </Link>
                    <Link to={`/s/${s.share_token}`} target="_blank" aria-label={t('history.publicLink')} title={t('history.publicLink')} className={iconButton}>
                      {LINK_ICON}
                    </Link>
                    <button onClick={() => startEdit(s)} aria-label={t('history.editDate')} title={t('history.editDate')} className={iconButton}>
                      {EDIT_ICON}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(s.id)}
                      aria-label={t('history.deleteSession')}
                      title={t('history.deleteSession')}
                      className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center bg-red-900/40 border border-red-700/60 text-red-300 hover:bg-red-900/70"
                    >
                      {DELETE_ICON}
                    </button>
                  </div>
                </div>

                {/* Live-booking actions get their own row */}
                {s.status === 'active' && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {activeMatchMap[s.id] ? (
                      <Link to={adminPath(`/sessions/${s.id}/match/${activeMatchMap[s.id]}`)} className="min-h-[40px] rounded-lg bg-green-600 hover:bg-green-500 text-[13px] font-semibold flex items-center justify-center gap-1.5">
                        <span aria-hidden="true">▶</span> {t('history.resume')}
                      </Link>
                    ) : <span />}
                    {awardsOn ? (
                      <Link to={adminPath(`/sessions/${s.id}/awards`)} className="min-h-[40px] rounded-lg bg-blue-600 hover:bg-blue-500 text-[13px] font-semibold flex items-center justify-center gap-1.5">
                        <span aria-hidden="true">🏆</span> {t('history.awards')}
                      </Link>
                    ) : (
                      <button onClick={() => finishSession(s.id)} className="min-h-[40px] rounded-lg bg-blue-600 hover:bg-blue-500 text-[13px] font-semibold flex items-center justify-center gap-1.5">
                        {t('awards.finishSession')}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Delete confirmation popup */}
      {confirmDeleteId && (
        <div className="dialog-backdrop fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setConfirmDeleteId(null)}>
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
