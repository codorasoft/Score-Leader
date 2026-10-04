import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { computePlayerStats } from '../../utils/stats'
import type { Player, Match, MatchEvent, TeamPlayer } from '../../lib/types'

type SortKey = 'goals' | 'assists' | 'cleanSheets' | 'matchesWon'

export default function LeaderboardPage() {
  const { t } = useTranslation()
  const [players, setPlayers] = useState<Player[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [events, setEvents] = useState<MatchEvent[]>([])
  const [teamPlayerMap, setTeamPlayerMap] = useState<Record<string, string[]>>({})
  const [sortBy, setSortBy] = useState<SortKey>('goals')

  const load = useCallback(async () => {
    const [{ data: pData }, { data: mData }, { data: evData }, { data: tpData }] = await Promise.all([
      supabase.from('players').select('*').eq('is_active', true),
      supabase.from('matches').select('*').eq('status', 'completed'),
      supabase.from('match_events').select('*'),
      supabase.from('team_players').select('*'),
    ])
    setPlayers((pData ?? []) as Player[])
    setMatches((mData ?? []) as Match[])
    setEvents((evData ?? []) as MatchEvent[])
    const map: Record<string, string[]> = {}
    for (const tp of (tpData ?? []) as TeamPlayer[]) (map[tp.player_id] ??= []).push(tp.team_id)
    setTeamPlayerMap(map)
  }, [])

  useEffect(() => { load() }, [load])

  const stats = computePlayerStats(players, events, matches, teamPlayerMap)
  const sorted = [...stats].sort((a, b) => b[sortBy] - a[sortBy])

  const cols: { key: SortKey; label: string }[] = [
    { key: 'goals', label: 'G' },
    { key: 'assists', label: 'A' },
    { key: 'cleanSheets', label: 'CS' },
    { key: 'matchesWon', label: 'W' },
  ]

  return (
    <div className="max-w-lg mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">{t('leaderboard.title')}</h1>

      <div className="flex gap-2 mb-4">
        {cols.map(({ key, label }) => (
          <button key={key} onClick={() => setSortBy(key)}
            className={`px-3 py-1 rounded text-sm ${sortBy === key ? 'bg-blue-600' : 'bg-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {sorted.map((s, i) => (
          <Link key={s.player.id} to={`/players/${s.player.id}`} className="flex items-center bg-gray-800 hover:bg-gray-700 rounded-lg px-4 py-3 gap-3">
            <span className="w-6 text-gray-500 text-sm font-mono">{i + 1}</span>
            <span className="flex-1 font-semibold">{s.player.name}</span>
            <span className="text-xs text-gray-400">{s.player.position}</span>
            <div className="flex gap-3 text-sm text-right">
              <span title="Goals">{s.goals}G</span>
              <span title="Assists" className="text-gray-400">{s.assists}A</span>
              {s.cleanSheets > 0 && <span title="Clean sheets" className="text-green-400">{s.cleanSheets}CS</span>}
            </div>
          </Link>
        ))}
        {sorted.length === 0 && <p className="text-gray-500 text-center py-8">{t('common.noStats')}</p>}
      </div>
    </div>
  )
}
