import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useRealtime } from '../../hooks/useRealtime'
import { formatMatchClock, MATCH_DURATION_SECONDS } from '../../utils/matchClock'
import { MatchTimeline } from '../../components/MatchTimeline'
import { SessionMatchList } from '../../components/SessionMatchList'
import type { Session, Match, Team, MatchEvent, Player, TeamPlayer } from '../../lib/types'

const colorBg: Record<string, string> = {
  green: 'bg-green-900/40 border-green-600',
  blue: 'bg-blue-900/40 border-blue-600',
  yellow: 'bg-yellow-900/40 border-yellow-600',
}

export default function LiveSessionPage() {
  const { token } = useParams<{ token: string }>()
  const { t } = useTranslation()
  const [session, setSession] = useState<Session | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [events, setEvents] = useState<MatchEvent[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [elapsed, setElapsed] = useState(0)

  const load = useCallback(async () => {
    const { data: sess } = await supabase.from('sessions').select('*').eq('share_token', token).single()
    if (!sess) return
    const sessionId = (sess as Session).id
    setSession(sess as Session)

    const [{ data: teamsData }, { data: matchData }] = await Promise.all([
      supabase.from('teams').select('*').eq('session_id', sessionId),
      supabase.from('matches').select('*').eq('session_id', sessionId),
    ])
    const teamRows = (teamsData ?? []) as Team[]
    const matchRows = (matchData ?? []) as Match[]
    setTeams(teamRows)
    setMatches(matchRows)
    if (teamRows.length === 0 || matchRows.length === 0) return

    const [{ data: evData }, { data: tpData }] = await Promise.all([
      supabase.from('match_events').select('*').in('match_id', matchRows.map((m) => m.id)),
      supabase.from('team_players').select('player_id').in('team_id', teamRows.map((tm) => tm.id)),
    ])
    const evRows = (evData ?? []) as MatchEvent[]
    setEvents(evRows)

    // Session roster plus anyone named in an event, so swapped players still have names
    const pIds = [...new Set([
      ...((tpData ?? []) as Pick<TeamPlayer, 'player_id'>[]).map((r) => r.player_id),
      ...evRows.map((e) => e.player_id),
    ])]
    if (pIds.length > 0) {
      const { data: pData } = await supabase.from('players').select('*').in('id', pIds)
      setPlayers((pData ?? []) as Player[])
    }
  }, [token])

  useEffect(() => { load() }, [load])

  const match = matches
    .filter((m) => m.status !== 'completed')
    .sort((a, b) => b.match_number - a.match_number)[0] ?? null

  useEffect(() => {
    if (!match) return
    if (match.timer_status !== 'running' || !match.timer_started_at) {
      setElapsed(match.timer_elapsed_seconds)
      return
    }
    const startedAt = new Date(match.timer_started_at).getTime()
    const tick = () => setElapsed(match.timer_elapsed_seconds + Math.floor((Date.now() - startedAt) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [match?.id, match?.timer_status, match?.timer_started_at, match?.timer_elapsed_seconds])

  useRealtime('matches', { column: 'session_id', value: session?.id ?? '' }, load)
  useRealtime('match_events', { column: 'match_id', value: match?.id ?? '' }, load)

  if (!session) return <div className="p-4 text-gray-400">{t('common.loading')}</div>

  const teamName = (team: Team | undefined) =>
    team ? t('common.teamName', { color: t(`common.teamColor.${team.color}`) }) : ''
  const team1 = teams.find((tm) => tm.id === match?.team1_id)
  const team2 = teams.find((tm) => tm.id === match?.team2_id)
  const waitingTeam = teams.find((tm) => tm.id === match?.waiting_team_id)

  return (
    <div className="max-w-lg mx-auto">
      {!match ? (
        <div className="text-center mb-8">
          <h1 className="text-xl font-bold mb-2">{session.date}</h1>
          <p className="text-gray-400">{t('live.noActiveMatch')}</p>
        </div>
      ) : (
        <div className="mb-8">
          <div className="text-center text-xs text-gray-400 font-mono mb-1">{t('common.match', { number: match.match_number })}</div>
          <div className="text-center text-4xl font-mono font-bold" dir="ltr">
            {formatMatchClock(Math.min(elapsed, MATCH_DURATION_SECONDS))}
            {elapsed > MATCH_DURATION_SECONDS && (
              <span className="block text-xl text-red-400">+{formatMatchClock(elapsed - MATCH_DURATION_SECONDS)}</span>
            )}
          </div>
          <div className="text-center text-xs text-gray-400 mt-1 mb-4 uppercase">
            {match.timer_status === 'running'
              ? <span className="text-green-400">● {t('live.live')}</span>
              : match.timer_status === 'stopped' ? t('live.notStarted') : t('live.paused')}
          </div>

          <div className="flex gap-4 mb-4">
            <div className={`flex-1 text-center p-4 rounded-xl border ${colorBg[team1?.color ?? 'green']}`}>
              <div className="text-xs text-gray-400 uppercase mb-1">{teamName(team1)}</div>
              <div className="text-4xl font-bold">{match.team1_score}</div>
            </div>
            <div className="text-gray-500 font-bold self-center">{t('common.vs')}</div>
            <div className={`flex-1 text-center p-4 rounded-xl border ${colorBg[team2?.color ?? 'blue']}`}>
              <div className="text-xs text-gray-400 uppercase mb-1">{teamName(team2)}</div>
              <div className="text-4xl font-bold">{match.team2_score}</div>
            </div>
          </div>

          {waitingTeam && (
            <p className="text-center text-sm text-gray-400 mb-4">
              {t('common.waiting')}: <span className="font-semibold text-gray-300">{teamName(waitingTeam)}</span>
            </p>
          )}

          <section className="bg-gray-800 rounded-xl p-3">
            <h3 className="text-xs uppercase text-gray-400 mb-2">{t('timeline.title')}</h3>
            <MatchTimeline events={events.filter((e) => e.match_id === match.id)} teams={teams} players={players} />
          </section>
        </div>
      )}

      <SessionMatchList matches={matches} events={events} teams={teams} players={players} />
    </div>
  )
}
