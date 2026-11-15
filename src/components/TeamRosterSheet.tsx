import { useTranslation } from 'react-i18next'
import type { MatchEvent, Player, Team } from '../lib/types'
import { styleMap } from '../lib/teamColors'
import { MatchSheet } from './PlayerSheet'
import { PlayerAvatar } from './PlayerAvatar'

const colorDot = styleMap('dot')

// Who plays for a team in this match, opened from its score card, with what each player has done
// in the match so far. Nothing here can be changed.
export function TeamRosterSheet({ team, players, events, onClose }: {
  team: Team
  players: Player[]
  // This match's events
  events: MatchEvent[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const count = (playerId: string, type: MatchEvent['event_type']) =>
    events.filter((e) => e.player_id === playerId && e.event_type === type).length
  const badges = (playerId: string) => [
    ['⚽', count(playerId, 'goal')],
    ['👟', count(playerId, 'assist')],
    ['🟨', count(playerId, 'yellow_card')],
    ['🟥', count(playerId, 'red_card')],
  ].filter(([, n]) => (n as number) > 0) as [string, number][]

  return (
    <MatchSheet
      title={
        <span className="flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full shrink-0 ${colorDot[team.color] ?? 'bg-gray-400'}`} aria-hidden="true" />
          {t('common.teamName', { color: t(`common.teamColor.${team.color}`) })}
          <span className="text-sm font-normal text-gray-400">{t('match.playerCount', { count: players.length })}</span>
        </span>
      }
      onClose={onClose}
    >
      {players.length === 0
        ? <p className="py-4 text-center text-gray-400">{t('match.noTeamPlayers')}</p>
        : (
          <ul className="flex flex-col gap-1.5 pb-1">
            {players.map((p) => (
              <li key={p.id} className="min-h-[52px] px-2 py-1.5 rounded-lg bg-gray-700 flex items-center gap-2">
                <PlayerAvatar player={p} size="sm" />
                <span className="flex-1 min-w-0 font-medium leading-tight break-words">{p.name}</span>
                {badges(p.id).map(([icon, n]) => (
                  <span key={icon} className="text-sm whitespace-nowrap">{icon}{n > 1 ? ` ×${n}` : ''}</span>
                ))}
              </li>
            ))}
          </ul>
        )}
    </MatchSheet>
  )
}
