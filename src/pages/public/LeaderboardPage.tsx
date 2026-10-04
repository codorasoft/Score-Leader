import { useState, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { selectAll } from '../../lib/selectAll'
import { availablePeriods, defaultPeriod, periodStats, type PeriodKey } from '../../utils/leaderboardPeriod'
import type { Player, Match, MatchEvent, TeamPlayer, Session } from '../../lib/types'

type SortKey = 'goals' | 'assists' | 'cleanSheets' | 'matchesWon'

const SORTS: { key: SortKey; labelKey: string }[] = [
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
}

export default function LeaderboardPage() {
  const { t, i18n } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState<Data | null>(null)
  const [sortBy, setSortBy] = useState<SortKey>('goals')

  const load = useCallback(async () => {
    const [players, sessions, matches, events, teamPlayers] = await Promise.all([
      selectAll<Player>((a, b) => supabase.from('players').select('*').eq('is_active', true).range(a, b)),
      selectAll<Session>((a, b) => supabase.from('sessions').select('*').range(a, b)),
      selectAll<Match>((a, b) => supabase.from('matches').select('*').eq('status', 'completed').range(a, b)),
      selectAll<MatchEvent>((a, b) => supabase.from('match_events').select('*').range(a, b)),
      selectAll<TeamPlayer>((a, b) => supabase.from('team_players').select('*').range(a, b)),
    ])
    setData({ players, sessions, matches, events, teamPlayers })
  }, [])

  useEffect(() => { load() }, [load])

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
  const sorted = [...stats].sort((a, b) => b[sortBy] - a[sortBy] || b.goals - a.goals || b.assists - a.assists)
  const ranks = sorted.map((s) => s[sortBy])

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
          <Link key={s.player.id} to={`/players/${s.player.id}`} className="flex items-center bg-gray-800 hover:bg-gray-700 rounded-lg px-4 py-3 gap-3">
            <span className="w-6 text-gray-500 text-sm font-mono">{ranks.indexOf(ranks[i]) + 1}</span>
            <span className="flex-1 min-w-0">
              <span className="block font-semibold truncate">{s.player.name}</span>
              <span className="block text-xs text-gray-400">
                {s.player.position} · {t('leaderboard.line', { g: s.goals, a: s.assists, w: s.matchesWon, p: s.matchesPlayed })}
                {s.cleanSheets > 0 && ` · ${t('leaderboard.cs', { count: s.cleanSheets })}`}
              </span>
            </span>
            <span className="text-2xl font-bold shrink-0">{s[sortBy]}</span>
          </Link>
        ))}
        {sorted.length === 0 && <p className="text-gray-500 text-center py-8">{t('leaderboard.empty')}</p>}
      </div>
    </div>
  )
}
