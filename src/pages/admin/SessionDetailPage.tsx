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

export default function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { t } = useTranslation()
  const [session, setSession] = useState<Session | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [teams, setTeams] = useState<Team[]>([])

  useEffect(() => {
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
    load()
  }, [sessionId])

  const teamById = Object.fromEntries(teams.map((tm) => [tm.id, tm]))

  const completed = matches.filter((m) => m.status === 'completed')
  const pending = matches.filter((m) => m.status === 'pending')

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
          const isDraw = m.is_draw && !winner

          return (
            <div key={m.id} className="bg-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-gray-400 font-mono">
                  {t('common.match', { number: m.match_number })}
                </span>
                {winner ? (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-green-400">
                    <span className={`w-2 h-2 rounded-full ${colorDot[winner.color] ?? 'bg-gray-400'}`} />
                    {t('common.teamName', { color: t(`common.teamColor.${winner.color}`) })} {t('sessionDetail.wins')}
                  </span>
                ) : isDraw ? (
                  <span className="text-xs text-yellow-400 font-semibold">{t('sessionDetail.draw')}</span>
                ) : null}
              </div>

              {/* Scoreboard */}
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
              </div>
            )
          })}
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
