import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useRealtime } from '../../hooks/useRealtime'
import type { Session, Match, Team, MatchEvent, Player } from '../../lib/types'

const colorBg: Record<string, string> = {
  red: 'bg-red-900/40 border-red-600',
  blue: 'bg-blue-900/40 border-blue-600',
  yellow: 'bg-yellow-900/40 border-yellow-600',
}

export default function LiveSessionPage() {
  const { token } = useParams<{ token: string }>()
  const { t } = useTranslation()
  const [session, setSession] = useState<Session | null>(null)
  const [match, setMatch] = useState<Match | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [events, setEvents] = useState<MatchEvent[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [elapsed, setElapsed] = useState(0)

  const load = useCallback(async () => {
    const { data: sess } = await supabase
      .from('sessions').select('*').eq('share_token', token).single()
    if (!sess) return
    setSession(sess as Session)

    const [{ data: teamsData }, { data: matchData }] = await Promise.all([
      supabase.from('teams').select('*').eq('session_id', (sess as Session).id),
      supabase.from('matches').select('*').eq('session_id', (sess as Session).id)
        .eq('status', 'active').maybeSingle(),
    ])
    setTeams((teamsData ?? []) as Team[])

    if (matchData) {
      setMatch(matchData as Match)
      const { data: evData } = await supabase.from('match_events').select('*').eq('match_id', (matchData as Match).id)
      setEvents((evData ?? []) as MatchEvent[])

      const pIds = [...new Set((evData ?? []).map((e: MatchEvent) => e.player_id))]
      if (pIds.length > 0) {
        const { data: pData } = await supabase.from('players').select('*').in('id', pIds)
        setPlayers((pData ?? []) as Player[])
      }
    }
  }, [token])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!match || match.timer_status !== 'running') return
    const base = match.timer_elapsed_seconds
    const startedAt = match.timer_started_at ? new Date(match.timer_started_at).getTime() : Date.now()
    const tick = () => setElapsed(base + Math.floor((Date.now() - startedAt) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [match])

  useRealtime('matches', { column: 'session_id', value: session?.id ?? '' }, load)

  if (!session) return <div className="p-4 text-gray-400">{t('common.loading')}</div>
  if (!match) return (
    <div className="max-w-lg mx-auto p-4 text-center">
      <h1 className="text-xl font-bold mb-2">{session.date}</h1>
      <p className="text-gray-400">{t('live.noActiveMatch')}</p>
    </div>
  )

  const team1 = teams.find((tm) => tm.id === match.team1_id)
  const team2 = teams.find((tm) => tm.id === match.team2_id)
  const waitingTeam = teams.find((tm) => tm.id === match.waiting_team_id)

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')

  const goalEvents = events.filter((e) => e.event_type === 'goal' || e.event_type === 'penalty_goal')

  return (
    <div className="max-w-lg mx-auto p-4">
      <div className="text-center text-4xl font-mono font-bold mb-2">{mm}:{ss}</div>
      <div className="text-center text-xs text-gray-400 mb-4 uppercase">
        {match.timer_status === 'running' ? t('live.live') : match.timer_status}
      </div>

      <div className="flex gap-4 mb-6">
        <div className={`flex-1 text-center p-4 rounded-xl border ${colorBg[team1?.color ?? 'red']}`}>
          <div className="text-xs text-gray-400 uppercase mb-1">
            {team1 ? t('common.teamName', { color: t(`common.teamColor.${team1.color}`) }) : ''}
          </div>
          <div className="text-4xl font-bold">{match.team1_score}</div>
        </div>
        <div className="text-gray-500 font-bold self-center">{t('common.vs')}</div>
        <div className={`flex-1 text-center p-4 rounded-xl border ${colorBg[team2?.color ?? 'blue']}`}>
          <div className="text-xs text-gray-400 uppercase mb-1">
            {team2 ? t('common.teamName', { color: t(`common.teamColor.${team2.color}`) }) : ''}
          </div>
          <div className="text-4xl font-bold">{match.team2_score}</div>
        </div>
      </div>

      {waitingTeam && (
        <p className="text-center text-sm text-gray-400 mb-4">
          {t('common.waiting')}: <span className="font-semibold text-gray-300">
            {t('common.teamName', { color: t(`common.teamColor.${waitingTeam.color}`) })}
          </span>
        </p>
      )}

      {goalEvents.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs uppercase text-gray-400 mb-2">{t('live.goals')}</h3>
          {goalEvents.map((e) => {
            const scorer = players.find((p) => p.id === e.player_id)
            return (
              <div key={e.id} className="text-sm py-1 flex gap-2">
                <span className="text-gray-400">{e.minute ?? 0}'</span>
                <span>{scorer?.name ?? t('live.unknown')}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
