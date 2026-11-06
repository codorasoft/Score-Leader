import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchSession, type SessionData } from '../../lib/sessionData'
import { useRealtime } from '../../hooks/useRealtime'
import { serverNow } from '../../lib/serverClock'
import { formatDuration } from '../../utils/matchClock'
import { periodLabelKey, periodLength } from '../../utils/matchFormat'
import { MatchTimeline } from '../../components/MatchTimeline'
import { SessionMatchList } from '../../components/SessionMatchList'
import { SessionStandings } from '../../components/SessionStandings'
import { SessionTopPlayers } from '../../components/SessionTopPlayers'
import LoadFailed from '../../components/LoadFailed'
import { NextUp } from '../../components/NextUp'
import { waitingQueue } from '../../utils/matchRotation'
import NotAvailablePage from '../NotAvailablePage'
import { matchElapsed } from '../../utils/homeStatus'
import type { Match, Team } from '../../lib/types'
import { styleMap } from '../../lib/teamColors'
import PageSkeleton from '../../components/PageSkeleton'
import { sessionDate } from '../../utils/sessionDate'

const colorBg = styleMap('card')

export default function LiveSessionPage() {
  const { token } = useParams<{ token: string }>()
  return <LiveSession key={token} token={token ?? ''} />
}

function LiveSession({ token }: { token: string }) {
  const { t, i18n } = useTranslation()
  const [live, setLive] = useState<SessionData | null>(null)
  const [status, setStatus] = useState<'loading' | 'missing' | 'failed' | 'ready'>('loading')
  const [attempt, setAttempt] = useState(0)
  const schedule = useRef<() => void>(() => {})
  const refresh = useCallback(() => schedule.current(), [])

  useEffect(() => {
    let active = true
    let fetching = false
    let pending = false
    let timer: ReturnType<typeof setTimeout> | undefined

    // Group the goal, assist and score notifications in one short window.
    // A change received during a fetch still gets a fresh snapshot afterwards.
    const scheduleRefresh = () => {
      if (!active) return
      if (fetching) { pending = true; return }
      if (timer === undefined) timer = setTimeout(load, 200)
    }
    async function load() {
      timer = undefined
      fetching = true
      try {
        const next = await fetchSession('share_token', token)
        if (!active) return
        setLive(next)
        setStatus(next ? 'ready' : 'missing')
      } catch {
        if (active) setStatus((s) => s === 'ready' ? s : 'failed')
      } finally {
        fetching = false
        if (pending) { pending = false; scheduleRefresh() }
      }
    }
    schedule.current = scheduleRefresh
    void load()
    return () => { active = false; clearTimeout(timer) }
  }, [token, attempt])

  // Finishing a match creates the next fixture. Closing the booking leaves that row in place.
  const match = live?.session.status === 'active' ? live.matches.filter((m) => m.status !== 'completed').pop() : undefined
  const sessionId = live?.session.id ?? ''
  const completed = live?.session.status === 'completed'
  useRealtime('sessions', { column: 'id', value: completed ? '' : sessionId }, refresh)
  useRealtime('matches', { column: 'session_id', value: sessionId }, refresh)
  useRealtime('match_events', { column: 'match_id', value: match?.id ?? '' }, refresh)

  if (status === 'failed') return <LoadFailed onRetry={() => { setStatus('loading'); setAttempt((n) => n + 1) }} />
  if (status === 'missing') return <NotAvailablePage kind="page" embedded />
  if (!live) return <PageSkeleton />
  const { session, teams, matches, events, players } = live

  const teamName = (team: Team | undefined) =>
    team ? t('common.teamName', { color: t(`common.teamColor.${team.color}`) }) : ''
  const team1 = teams.find((tm) => tm.id === match?.team1_id)
  const team2 = teams.find((tm) => tm.id === match?.team2_id)
  const len = match ? periodLength(match.period, session) ?? 0 : 0
  const halfTime = !!match && match.timer_status === 'stopped' && match.period_seconds.length >= match.period && match.status !== 'completed'

  return (
    <div className="max-w-lg mx-auto">
      {!match ? (
        <div className="text-center mb-8">
          <h1 className="text-xl font-bold mb-2">{sessionDate(session.date, i18n.language)}</h1>
          <p className="text-gray-400">{t(completed ? 'history.status.completed' : 'live.noActiveMatch')}</p>
        </div>
      ) : (
        <div className="mb-8">
          <div className="text-center text-xs text-gray-400 font-mono mb-1">{t('common.match', { number: match.match_number })}</div>
          <LiveClock match={match} len={len} />
          <div className="text-center text-xs text-gray-300 mt-1 uppercase">
            {halfTime ? t('live.halfTime') : t(periodLabelKey(match.period, session))}
            {match.period === 5 && match.penalties_team1 != null && match.penalties_team2 != null && (
              <span className="ms-2" dir="ltr">{match.penalties_team1}–{match.penalties_team2}</span>
            )}
          </div>
          {/* Half-time and a shoot-out also stop the clock; only a match that has not kicked off is "not started" */}
          <div className="text-center text-xs text-gray-400 mt-1 mb-4 uppercase">
            {match.timer_status === 'running'
              ? <span className="text-green-400">● {t('live.live')}</span>
              : match.timer_status === 'paused' ? t('live.paused')
              : halfTime || match.period === 5 ? null : t('live.notStarted')}
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
            <MatchTimeline events={events.filter((e) => e.match_id === match.id)} teams={teams} players={players} format={session} />
          </section>
        </div>
      )}

      <div className="mb-6"><SessionStandings teams={teams} matches={matches} /></div>
      <div className="mb-6"><SessionTopPlayers players={players} events={events} matches={matches} /></div>
      <SessionMatchList matches={matches} events={events} teams={teams} players={players} format={session} />
    </div>
  )
}

function LiveClock({ match, len }: { match: Match; len: number }) {
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    if (match.timer_status !== 'running' || !match.timer_started_at) return
    setNow(serverNow())
    const id = setInterval(() => setNow(serverNow()), 1000)
    return () => clearInterval(id)
  }, [match.timer_started_at, match.timer_status])

  const elapsed = matchElapsed(match, now)
  return (
    <div className="text-center text-4xl font-mono font-bold" dir="ltr">
      {match.period === 5 ? '–' : formatDuration(Math.min(elapsed, len))}
      {len > 0 && elapsed > len && (
        <span className="block text-xl text-red-400">+{formatDuration(elapsed - len)}</span>
      )}
    </div>
  )
}
