import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Match, MatchEvent, Player, Team } from '../lib/types'
import { MatchTimeline } from './MatchTimeline'
import { styleMap } from '../lib/teamColors'

const colorDot = styleMap('dot')

interface Props {
  matches: Match[]
  events: MatchEvent[]
  teams: Team[]
  players: Player[]
}

// Finished matches of a session, newest first: the last one is highlighted with its timeline open.
export function SessionMatchList({ matches, events, teams, players }: Props) {
  const { t } = useTranslation()
  const finished = matches
    .filter((m) => m.status === 'completed')
    .sort((a, b) => b.match_number - a.match_number)
  // Ids the viewer has toggled; the newest match is open by default, so data arriving later still opens it
  const [toggled, setToggled] = useState<Set<string>>(new Set())

  if (finished.length === 0) return null

  const team = (id: string | null) => teams.find((tm) => tm.id === id)
  const teamName = (id: string | null) => {
    const tm = team(id)
    return tm ? t('common.teamName', { color: t(`common.teamColor.${tm.color}`) }) : '?'
  }
  const resultLabel = (m: Match) => {
    if (!m.is_draw) return t('timeline.wins', { team: teamName(m.winner_team_id) })
    if (m.draw_resolved_by === 'penalties') return t('timeline.winsPens', { team: teamName(m.winner_team_id) })
    if (m.winner_team_id) return t('timeline.drawWinner', { team: teamName(m.winner_team_id) })
    return t('timeline.draw')
  }
  const toggle = (id: string) => setToggled((s) => {
    const next = new Set(s)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const card = (m: Match, isLast: boolean) => {
    const isOpen = isLast !== toggled.has(m.id)
    return (
      <div key={m.id} className={`rounded-xl ${isLast ? 'bg-gray-800 border border-gray-600' : 'bg-gray-800/60'}`}>
        <button
          onClick={() => toggle(m.id)}
          aria-expanded={isOpen}
          className="w-full flex items-center gap-3 px-3 py-3 text-start"
        >
          <span className="text-xs text-gray-400 font-mono shrink-0">#{m.match_number}</span>
          <span className="flex items-center gap-1.5 flex-1 min-w-0 text-sm font-semibold" dir="ltr">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${colorDot[team(m.team1_id)?.color ?? ''] ?? 'bg-gray-500'}`} />
            <span className="font-mono">{m.team1_score} – {m.team2_score}</span>
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${colorDot[team(m.team2_id)?.color ?? ''] ?? 'bg-gray-500'}`} />
          </span>
          <span className={`text-xs truncate ${m.is_draw ? 'text-yellow-400' : 'text-green-400'}`}>{resultLabel(m)}</span>
          <span className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true">▾</span>
        </button>
        {isOpen && (
          <div className="px-3 pb-3 border-t border-gray-700/60 pt-3">
            <MatchTimeline events={events.filter((e) => e.match_id === m.id)} teams={teams} players={players} />
          </div>
        )}
      </div>
    )
  }

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-xs uppercase text-gray-400 mb-2">{t('timeline.lastMatch')}</h3>
        {card(finished[0], true)}
      </div>
      {finished.length > 1 && (
        <div>
          <h3 className="text-xs uppercase text-gray-400 mb-2">{t('timeline.earlierMatches', { count: finished.length - 1 })}</h3>
          <div className="space-y-2">{finished.slice(1).map((m) => card(m, false))}</div>
        </div>
      )}
    </section>
  )
}
