import { useState, useEffect, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { loadLeague } from '../../lib/league'
import { availablePeriods, defaultPeriod, periodStats, type PeriodKey, type PeriodStat } from '../../utils/leaderboardPeriod'
import { monthKey, playersOfMonth, pointParts, potmPoints } from '../../utils/playerOfMonth'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { drawLeaderboardImage, shareCanvas } from '../../lib/shareImage'
import { useLeague, useFeature, usePublicPath } from '../../contexts/LeagueContext'
import type { Player, Match, MatchEvent, TeamPlayer, Session, SessionAward } from '../../lib/types'

type SortKey = 'points' | 'goals' | 'assists' | 'cleanSheets' | 'matchesWon'

const SORTS: { key: SortKey; labelKey: string }[] = [
  { key: 'points', labelKey: 'leaderboard.sortPoints' },
  { key: 'goals', labelKey: 'leaderboard.sortGoals' },
  { key: 'assists', labelKey: 'leaderboard.sortAssists' },
  { key: 'matchesWon', labelKey: 'leaderboard.sortWins' },
  { key: 'cleanSheets', labelKey: 'leaderboard.sortCleanSheets' },
]

interface Data {
  players: Player[]
  sessions: Session[]
  matches: Match[]
  events: MatchEvent[]
  teamPlayers: TeamPlayer[]
  awards: SessionAward[]
}

// The shared image lists this many places, so it stays readable in a chat
const SHARE_ROWS = 20

export default function LeaderboardPage() {
  const { t, i18n } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const league = useLeague()
  const publicPath = usePublicPath()
  const potmOn = useFeature('potm')
  const profiles = useFeature('profiles')
  const photosOn = useFeature('photos')
  const [loaded, setLoaded] = useState<{ leagueId: string; data: Data } | null>(null)
  const [sortBy, setSortBy] = useState<SortKey>('points')

  const load = useCallback(async () => {
    // Shared with cards, records and profiles; the leaderboard lists active players only
    const { players, sessions, matches, events, teamPlayers, awards } = await loadLeague(league.id)
    if (currentLeague.current !== league.id) return
    setLoaded({ leagueId: league.id, data: { players: players.filter((p) => p.is_active), sessions, matches, events, teamPlayers, awards } })
  }, [league.id])

  const currentLeague = useRef(league.id)
  currentLeague.current = league.id
  useEffect(() => { load() }, [load])

  const data = loaded?.leagueId === league.id ? loaded.data : null

  if (!data) return <div className="p-4 text-gray-400">{t('common.loading')}</div>

  const periods = availablePeriods(data.sessions)
  const requested = searchParams.get('period')
  const period: PeriodKey = requested && periods.includes(requested) ? requested : defaultPeriod(periods)
  const choose = (p: PeriodKey) => setSearchParams(p === 'all' ? {} : { period: p }, { replace: true })

  const label = (p: PeriodKey) => {
    if (p === 'all') return t('leaderboard.allTime')
    if (p.length === 4) return t('leaderboard.season', { year: p })
    return new Date(`${p}-01T00:00:00`).toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' })
  }

  const { stats, sessionCount, matchCount } = periodStats(data, period)
  const rows = stats.map((s) => ({ ...s, points: potmPoints(s) }))
  // Same tie-break as Player of the Month: goals, then assists, then wins; only full ties share a rank
  const compare = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
    b[sortBy] - a[sortBy] || b.goals - a.goals || b.assists - a.assists || b.matchesWon - a.matchesWon
  const sorted = [...rows].sort(compare)
  const ranks: number[] = []
  sorted.forEach((s, i) => ranks.push(i > 0 && compare(sorted[i - 1], s) === 0 ? ranks[i - 1] : i + 1))
  const potm = potmOn && period.length === 7 ? playersOfMonth(data, period) : null
  const monthOver = period < monthKey(new Date())
  const sortLabel = t(SORTS.find((s) => s.key === sortBy)!.labelKey)

  // A player's records, e.g. "3G · 2W"; sorted by points, each with the points it brings ("3G (+6)")
  const recordOf = (s: PeriodStat) => pointParts(s).map((part) => {
    const text = t(`leaderboard.record.${part.kind}`, { count: part.count })
    // The signed number kept left to right (U+2066..U+2069), so Arabic shows (+6), not (6+)
    return sortBy === 'points' ? `${text} (\u2066${part.points > 0 ? '+' : '−'}${Math.abs(part.points)}\u2069)` : text
  }).join(' · ')

  // The list as it is on screen (period and sort), as a picture for the phone's share sheet
  const shareImage = async () => {
    const title = t('leaderboard.shareTitle', { period: label(period) })
    const canvas = await drawLeaderboardImage({
      league: league.name,
      title: t('leaderboard.title'),
      period: label(period),
      subtitle: `${t('leaderboard.sessions', { count: sessionCount })} · ${t('summary.matches', { count: matchCount })}`,
      stat: sortLabel,
      rtl: i18n.dir() === 'rtl',
      rows: sorted.slice(0, SHARE_ROWS).map((s, i) => ({
        rank: ranks[i], name: s.player.name, photo_url: photosOn ? s.player.photo_url : null, position: s.player.position, value: s[sortBy],
        record: recordOf(s),
      })),
      legend: sortBy === 'points' ? t('leaderboard.legend') : null,
      footer: 'ScoreLeader',
    })
    return shareCanvas(canvas, `scoreleader-leaderboard-${period}-${sortBy}.png`, title)
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-3">{t('leaderboard.title')}</h1>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-2 -mx-4 px-4" role="tablist" aria-label={t('leaderboard.period')}>
        {periods.map((p) => (
          <button
            key={p}
            role="tab"
            aria-selected={p === period}
            onClick={() => choose(p)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${
              p === period ? 'bg-blue-600 text-white' : p.length === 4 ? 'bg-gray-700 text-gray-100 font-semibold' : 'bg-gray-800 text-gray-300'
            }`}
          >
            {label(p)}
          </button>
        ))}
      </div>

      <p className="text-xs text-gray-400 mb-4">
        {t('leaderboard.sessions', { count: sessionCount })} · {t('summary.matches', { count: matchCount })}
      </p>

      {potm && (
        <div className="mb-4 rounded-xl border border-yellow-500/60 bg-yellow-900/20 px-4 py-3 flex items-center gap-3">
          <span className="text-3xl" aria-hidden="true">👑</span>
          <span className="min-w-0">
            <span className="block text-xs uppercase text-yellow-300">
              {monthOver ? t('potm.title') : t('potm.leading')}
            </span>
            <span className="block font-bold truncate">
              {potm.winners.map((w) => w.player.name).join(' & ')}
            </span>
            <span className="block text-xs text-gray-300">{t('potm.points', { count: potm.points })}</span>
          </span>
        </div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        {SORTS.map(({ key, labelKey }) => (
          <button key={key} onClick={() => setSortBy(key)} aria-pressed={sortBy === key}
            className={`px-3 py-1.5 rounded text-sm ${sortBy === key ? 'bg-blue-600' : 'bg-gray-700'}`}>
            {t(labelKey)}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {sorted.map((s, i) => (
          <Row key={s.player.id} to={profiles ? publicPath(`/players/${s.player.id}`) : null}>
            <span className="w-6 text-gray-500 text-sm font-mono">{ranks[i]}</span>
            <PlayerAvatar player={s.player} size="sm" />
            <span className="flex-1 min-w-0">
              <span className="block font-semibold truncate">{s.player.name}</span>
              <span className="block text-xs text-gray-400">
                {s.player.position} · {t('leaderboard.line', { g: s.goals, a: s.assists, w: s.matchesWon, p: s.matchesPlayed })}
                {s.cleanSheets > 0 && ` · ${t('leaderboard.cs', { count: s.cleanSheets })}`}
                {s.interceptions > 0 && ` · ${t('leaderboard.int', { count: s.interceptions })}`}
              </span>
            </span>
            <span className="text-2xl font-bold shrink-0">{s[sortBy]}</span>
          </Row>
        ))}
        {sorted.length === 0 && <p className="text-gray-500 text-center py-8">{t('leaderboard.empty')}</p>}
        {sorted.length > 0 && sortBy === 'points' && <p className="text-[11px] text-gray-500 text-center pt-2">{t('potm.formula')}</p>}
        {sorted.length > 0 && (
          <button onClick={shareImage} className="w-full mt-2 py-3 rounded-xl bg-purple-700 hover:bg-purple-600 font-semibold text-sm">
            🖼️ {t('leaderboard.share')}
          </button>
        )}
      </div>
    </div>
  )
}

const rowClass = 'flex items-center bg-gray-800 rounded-lg px-4 py-3 gap-3'

function Row({ to, children }: { to: string | null; children: ReactNode }) {
  return to
    ? <Link to={to} className={`${rowClass} hover:bg-gray-700`}>{children}</Link>
    : <div className={rowClass}>{children}</div>
}
