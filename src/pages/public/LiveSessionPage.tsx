import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchSession, type SessionData } from '../../lib/sessionData'
import { useRealtime } from '../../hooks/useRealtime'
import { serverNow } from '../../lib/serverClock'
import { formatMatchClock, MATCH_DURATION_SECONDS } from '../../utils/matchClock'
import { MatchTimeline } from '../../components/MatchTimeline'
import { SessionMatchList } from '../../components/SessionMatchList'
import { SessionStandings } from '../../components/SessionStandings'
import { SessionTopPlayers } from '../../components/SessionTopPlayers'
import LoadFailed from '../../components/LoadFailed'
import { NextUp } from '../../components/NextUp'
import { waitingQueue } from '../../utils/matchRotation'
import NotAvailablePage from '../NotAvailablePage'
import type { Session, Match, Team, MatchEvent, Player } from '../../lib/types'
import { styleMap } from '../../lib/teamColors'

const colorBg = styleMap('card')

export default function LiveSessionPage() {
  const { token } = useParams<{ token: string }>()
  const { t } = useTranslation()
  const [session, setSession] = useState<Session | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [events, setEvents] = useState<MatchEvent[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [status, setStatus] = useState<'loading' | 'missing' | 'failed' | 'ready'>('loading')

  const load = useCallback(async () => {
    let live: SessionData | null
    try {
      live = await fetchSession('share_token', token ?? '')
    } catch {
      // A failed live refresh keeps what is on screen; only a failed first load needs the retry screen
      setStatus((s) => (s === 'ready' ? s : 'failed'))
      return
    }
    if (!live) { setStatus('missing'); return }
    setSession(live.session)
    setTeams(live.teams)
    setMatches(live.matches)
    setEvents(live.events)
    setPlayers(live.players)
    setStatus('ready')
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
    const tick = () => setElapsed(match.timer_elapsed_seconds + Math.max(0, Math.floor((serverNow() - startedAt) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [match?.id, match?.timer_status, match?.timer_started_at, match?.timer_elapsed_seconds])

  useRealtime('matches', { column: 'session_id', value: session?.id ?? '' }, load)
  useRealtime('match_events', { column: 'match_id', value: match?.id ?? '' }, load)

  if (status === 'failed') return <LoadFailed onRetry={() => { setStatus('loading'); load() }} />
  if (status === 'missing') return <NotAvailablePage kind="page" embedded />
  if (!session) return <div className="p-4 text-gray-400">{t('common.loading')}</div>

  const teamName = (team: Team | undefined) =>
    team ? t('common.teamName', { color: t(`common.teamColor.${team.color}`) }) : ''
  const team1 = teams.find((tm) => tm.id === match?.team1_id)
  const team2 = teams.find((tm) => tm.id === match?.team2_id)

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

          <NextUp queue={waitingQueue(match)} teams={teams} className="text-center text-sm text-gray-400 mb-4" />

          <section className="bg-gray-800 rounded-xl p-3">
            <h3 className="text-xs uppercase text-gray-400 mb-2">{t('timeline.title')}</h3>
            <MatchTimeline events={events.filter((e) => e.match_id === match.id)} teams={teams} players={players} />
          </section>
        </div>
      )}

      <div className="mb-6"><SessionStandings teams={teams} matches={matches} /></div>
      <div className="mb-6"><SessionTopPlayers players={players} events={events} matches={matches} /></div>
      <SessionMatchList matches={matches} events={events} teams={teams} players={players} />
    </div>
  )
}
