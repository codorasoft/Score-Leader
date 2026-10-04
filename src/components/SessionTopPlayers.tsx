import { useTranslation } from 'react-i18next'
import type { Match, MatchEvent, Player } from '../lib/types'
import { topPlayers, type TopPlayer } from '../utils/awards'

const MEDALS = ['🥇', '🥈', '🥉']

interface Props {
  players: Player[]
  events: MatchEvent[]
  matches: Match[]
}

export function SessionTopPlayers({ players, events, matches }: Props) {
  const { t } = useTranslation()
  const scorers = topPlayers(players, events, matches, 'goals')
  const assisters = topPlayers(players, events, matches, 'assists')
  if (scorers.length === 0 && assisters.length === 0) return null

  const list = (title: string, icon: string, rows: TopPlayer[], unit: (count: number) => string) => (
    <section className="bg-gray-800/60 rounded-xl p-3 min-w-0">
      <h3 className="text-xs uppercase text-gray-400 mb-2">{icon} {title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-500">—</p>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.player.id} className="flex items-center gap-2 text-sm">
              <span className="w-6 text-center shrink-0" aria-label={t('standings.rank', { rank: r.rank })}>{MEDALS[r.rank - 1]}</span>
              <span className="flex-1 truncate">{r.player.name}</span>
              <span className="font-semibold shrink-0">{r.count}</span>
              <span className="text-xs text-gray-400 shrink-0 w-12">{unit(r.count)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {list(t('awards.topScorers'), '⚽', scorers, (count) => t('awards.goalsUnit', { count }))}
      {list(t('awards.topAssists'), '🎯', assisters, (count) => t('awards.assistsUnit', { count }))}
    </div>
  )
}
