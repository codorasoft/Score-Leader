import { useTranslation } from 'react-i18next'
import type { MatchEvent, Player, Team } from '../lib/types'
import { buildTimeline } from '../utils/timeline'
import { formatMatchClock } from '../utils/matchClock'
import { useFeature } from '../contexts/LeagueContext'

const colorDot: Record<string, string> = { green: 'bg-green-500', blue: 'bg-blue-500', yellow: 'bg-yellow-400' }

interface Props {
  events: MatchEvent[]
  teams: Team[]
  players: Player[]
}

export function MatchTimeline({ events, teams, players }: Props) {
  const { t } = useTranslation()
  const cards = useFeature('cards')
  const swaps = useFeature('swaps')
  const entries = buildTimeline(events).filter(
    (e) => !((e.kind === 'yellow_card' || e.kind === 'red_card') && !cards) && !(e.kind === 'swap' && !swaps),
  )
  const playerName = (id: string) => players.find((p) => p.id === id)?.name ?? '?'
  const team = (id: string) => teams.find((tm) => tm.id === id)
  const teamName = (id: string) => {
    const tm = team(id)
    return tm ? t('common.teamName', { color: t(`common.teamColor.${tm.color}`) }) : '?'
  }

  if (entries.length === 0) return <p className="text-xs text-gray-500 py-1">{t('timeline.noEvents')}</p>

  return (
    <ol className="space-y-1.5">
      {entries.map((e) => (
        <li key={e.id} className="flex items-start gap-3 text-sm">
          <span className="font-mono text-xs text-gray-400 w-24 shrink-0 pt-0.5" dir="ltr">
            {e.clock != null ? formatMatchClock(e.clock) : '—'}
          </span>
          <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${colorDot[team(e.teamId)?.color ?? ''] ?? 'bg-gray-500'}`} />
          <span className="min-w-0">
            {e.kind === 'goal' && (
              <>
                ⚽ <span className="font-semibold">{playerName(e.playerId)}</span>
                {e.assistPlayerId && (
                  <span className="text-xs text-gray-400 ms-2">{t('timeline.assist', { name: playerName(e.assistPlayerId) })}</span>
                )}
              </>
            )}
            {e.kind === 'yellow_card' && <>🟨 {playerName(e.playerId)}</>}
            {e.kind === 'red_card' && (
              <>
                🟥 {playerName(e.playerId)}
                {e.suspensionMinutes && (
                  <span className="text-xs text-gray-400 ms-2">{t('card.min', { count: e.suspensionMinutes })}</span>
                )}
              </>
            )}
            {e.kind === 'swap' && (
              <>
                ↔ {playerName(e.swap.a.playerId)} ⇄ {playerName(e.swap.b.playerId)}
                <span className="block text-xs text-gray-400">
                  {[e.swap.a, e.swap.b].map((side) =>
                    t('timeline.swapDetail', { name: playerName(side.playerId), from: teamName(side.from), to: teamName(side.to) }),
                  ).join(' · ')}
                </span>
              </>
            )}
          </span>
        </li>
      ))}
    </ol>
  )
}
