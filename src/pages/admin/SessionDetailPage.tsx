import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import type { Match, Team, Session } from '../../lib/types'

const colorDot: Record<string, string> = {
  red: 'bg-red-500',
  blue: 'bg-blue-500',
  yellow: 'bg-yellow-400',
}

interface EditState {
  matchId: string
  team1Score: number
  team2Score: number
  winnerId: string | null
}

export default function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { t } = useTranslation()
  const [session, setSession] = useState<Session | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [editState, setEditState] = useState<EditState | null>(null)
  const [confirmDeleteMatchId, setConfirmDeleteMatchId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const [{ data: sess }, { data: matchData }, { data: teamData }] = await Promise.all([
      supabase.from('sessions').select('*').eq('id', sessionId).single(),
      supabase.from('matches').select('*').eq('session_id', sessionId).order('match_number'),
      supabase.from('teams').select('*').eq('session_id', sessionId),
    ])
    setSession(sess as Session)
    setMatches((matchData ?? []) as Match[])
    setTeams((teamData ?? []) as Team[])
  }

  useEffect(() => { load() }, [sessionId])

  const teamById = Object.fromEntries(teams.map((tm) => [tm.id, tm]))
  const completed = matches.filter((m) => m.status === 'completed')
  const pending = matches.filter((m) => m.status === 'pending')

  const startEdit = (m: Match) => {
    setEditState({
      matchId: m.id,
      team1Score: m.team1_score,
      team2Score: m.team2_score,
      winnerId: m.winner_team_id,
    })
  }

  const saveEdit = async () => {
    if (!editState) return
    setSaving(true)
    const { team1Score, team2Score, winnerId } = editState
    const isDraw = team1Score === team2Score
    await supabase.from('matches').update({
      team1_score: team1Score,
      team2_score: team2Score,
      is_draw: isDraw,
      winner_team_id: isDraw ? winnerId : (team1Score > team2Score
        ? matches.find((m) => m.id === editState.matchId)!.team1_id
        : matches.find((m) => m.id === editState.matchId)!.team2_id),
    }).eq('id', editState.matchId)
    setSaving(false)
    setEditState(null)
    load()
  }

  const deleteMatch = async (matchId: string) => {
    await supabase.from('match_events').delete().eq('match_id', matchId)
    await supabase.from('matches').delete().eq('id', matchId)
    setConfirmDeleteMatchId(null)
    load()
  }

  return (
    <div className="max-w-lg mx-auto p-4">
      <div className="flex items-center gap-3 mb-5">
        <Link to="/admin" className="text-gray-400 hover:text-white text-sm">← {t('sessionDetail.back')}</Link>
        <h1 className="text-xl font-bold">{session?.date ?? '…'}</h1>
      </div>

      {completed.length === 0 && (
        <p className="text-gray-500 text-center py-8">{t('sessionDetail.noMatches')}</p>
      )}

      <div className="space-y-3">
        {completed.map((m) => {
          const t1 = teamById[m.team1_id]
          const t2 = teamById[m.team2_id]
          const waiting = teamById[m.waiting_team_id]
          const winner = m.winner_team_id ? teamById[m.winner_team_id] : null
          const isEditing = editState?.matchId === m.id

          return (
            <div key={m.id} className="bg-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-gray-400 font-mono">
                  {t('common.match', { number: m.match_number })}
                </span>
                <div className="flex items-center gap-2">
                  {winner && !isEditing && (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-green-400">
                      <span className={`w-2 h-2 rounded-full ${colorDot[winner.color] ?? 'bg-gray-400'}`} />
                      {t('common.teamName', { color: t(`common.teamColor.${winner.color}`) })} {t('sessionDetail.wins')}
                    </span>
                  )}
                  {!isEditing && (
                    <>
                      <button onClick={() => startEdit(m)} className="px-2 py-1 bg-gray-700 rounded text-xs hover:bg-gray-600">
                        {t('sessionDetail.editMatch')}
                      </button>
                      <button onClick={() => setConfirmDeleteMatchId(m.id)} className="px-2 py-1 bg-red-900/60 rounded text-xs text-red-300 hover:bg-red-800">
                        {t('sessionDetail.deleteMatch')}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {isEditing && editState ? (
                <div className="space-y-3">
                  {/* Score editors */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 text-center">
                      <div className="text-xs text-gray-400 mb-1">{t1 ? t('common.teamName', { color: t(`common.teamColor.${t1.color}`) }) : '?'}</div>
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => setEditState((s) => s && { ...s, team1Score: Math.max(0, s.team1Score - 1) })} className="w-8 h-8 bg-gray-700 rounded font-bold hover:bg-gray-600">−</button>
                        <span className="text-2xl font-bold w-8 text-center">{editState.team1Score}</span>
                        <button onClick={() => setEditState((s) => s && { ...s, team1Score: s.team1Score + 1 })} className="w-8 h-8 bg-gray-700 rounded font-bold hover:bg-gray-600">+</button>
                      </div>
                    </div>
                    <div className="text-gray-500 font-bold">–</div>
                    <div className="flex-1 text-center">
                      <div className="text-xs text-gray-400 mb-1">{t2 ? t('common.teamName', { color: t(`common.teamColor.${t2.color}`) }) : '?'}</div>
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => setEditState((s) => s && { ...s, team2Score: Math.max(0, s.team2Score - 1) })} className="w-8 h-8 bg-gray-700 rounded font-bold hover:bg-gray-600">−</button>
                        <span className="text-2xl font-bold w-8 text-center">{editState.team2Score}</span>
                        <button onClick={() => setEditState((s) => s && { ...s, team2Score: s.team2Score + 1 })} className="w-8 h-8 bg-gray-700 rounded font-bold hover:bg-gray-600">+</button>
                      </div>
                    </div>
                  </div>

                  {/* Winner override — only shown on a draw */}
                  {editState.team1Score === editState.team2Score && (
                    <div>
                      <p className="text-xs text-gray-400 mb-2">{t('sessionDetail.winner')}</p>
                      <div className="flex gap-2">
                        {[m.team1_id, m.team2_id].map((tid) => {
                          const team = teamById[tid]
                          return (
                            <button
                              key={tid}
                              onClick={() => setEditState((s) => s && { ...s, winnerId: tid })}
                              className={`flex-1 py-2 rounded text-sm font-semibold flex items-center justify-center gap-2 ${editState.winnerId === tid ? 'bg-green-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                            >
                              {team && <span className={`w-2.5 h-2.5 rounded-full ${colorDot[team.color] ?? 'bg-gray-400'}`} />}
                              {team ? t('common.teamName', { color: t(`common.teamColor.${team.color}`) }) : '?'}
                            </button>
                          )
                        })}
                        <button
                          onClick={() => setEditState((s) => s && { ...s, winnerId: null })}
                          className={`flex-1 py-2 rounded text-sm font-semibold ${editState.winnerId === null ? 'bg-yellow-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                        >
                          {t('sessionDetail.noWinner')}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 justify-end pt-1">
                    <button onClick={() => setEditState(null)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">
                      {t('common.cancel')}
                    </button>
                    <button onClick={saveEdit} disabled={saving} className="px-4 py-2 bg-blue-600 rounded text-sm font-semibold disabled:opacity-50">
                      {t('sessionDetail.saveMatch')}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <TeamChip team={t1} />
                    <div className="flex-1 text-center font-mono font-bold text-lg tracking-widest">
                      {m.team1_score} – {m.team2_score}
                    </div>
                    <TeamChip team={t2} />
                  </div>
                  {waiting && (
                    <p className="text-xs text-gray-500 mt-2 text-center">
                      {t('common.waiting')}: {t('common.teamName', { color: t(`common.teamColor.${waiting.color}`) })}
                    </p>
                  )}
                  {m.draw_resolved_by === 'penalties' && (
                    <p className="text-xs text-blue-400 mt-1 text-center">{t('sessionDetail.resolvedPenalties')}</p>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      {pending.length > 0 && (
        <div className="mt-4">
          <h2 className="text-xs uppercase text-gray-500 mb-2">{t('sessionDetail.upcoming')}</h2>
          {pending.map((m) => {
            const t1 = teamById[m.team1_id]
            const t2 = teamById[m.team2_id]
            return (
              <div key={m.id} className="bg-gray-800/50 rounded-xl p-3 flex items-center gap-3 mb-2">
                <span className="text-xs text-gray-500 font-mono w-16">
                  {t('common.match', { number: m.match_number })}
                </span>
                <TeamChip team={t1} />
                <span className="text-gray-600 text-sm">vs</span>
                <TeamChip team={t2} />
                <button
                  onClick={() => setConfirmDeleteMatchId(m.id)}
                  className="ms-auto px-2 py-1 bg-red-900/60 rounded text-xs text-red-300 hover:bg-red-800"
                >
                  {t('sessionDetail.deleteMatch')}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Delete match confirmation */}
      {confirmDeleteMatchId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setConfirmDeleteMatchId(null)}>
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-xs text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-3xl mb-3">🗑️</div>
            <p className="text-sm text-gray-300 mb-5">{t('sessionDetail.confirmDeleteMatch')}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteMatchId(null)} className="flex-1 py-2 bg-gray-700 rounded font-semibold hover:bg-gray-600">
                {t('common.cancel')}
              </button>
              <button onClick={() => deleteMatch(confirmDeleteMatchId)} className="flex-1 py-2 bg-red-600 rounded font-semibold hover:bg-red-500">
                {t('sessionDetail.deleteMatch')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TeamChip({ team }: { team: Team | undefined }) {
  const { t } = useTranslation()
  if (!team) return <span className="flex-1 text-center text-gray-500 text-sm">?</span>
  return (
    <div className="flex-1 flex items-center gap-1.5">
      <span className={`w-3 h-3 rounded-full flex-shrink-0 ${colorDot[team.color] ?? 'bg-gray-400'}`} />
      <span className="text-sm font-semibold truncate">
        {t('common.teamName', { color: t(`common.teamColor.${team.color}`) })}
      </span>
    </div>
  )
}
