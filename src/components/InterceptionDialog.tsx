import { useTranslation } from 'react-i18next'
import type { Player } from '../lib/types'
import { MatchSheet, TeamPlayerGrid, type TeamWithPlayers } from './PlayerSheet'

// One tap: the player who won the ball back. Defenders are listed first in each team.
export function InterceptionDialog({ teams, onConfirm, onClose }: {
  teams: TeamWithPlayers[]
  onConfirm: (playerId: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const defendersFirst = (players: Player[]) =>
    [...players].sort((a, b) => Number(b.position === 'DEF') - Number(a.position === 'DEF'))

  return (
    <MatchSheet title={t('interception.who')} onClose={onClose}>
      <TeamPlayerGrid
        teams={teams.map((tm) => ({ ...tm, players: defendersFirst(tm.players) }))}
        onPick={onConfirm}
        extra={(p) => <span className="text-[10px] font-bold text-gray-400 shrink-0">{p.position}</span>}
      />
    </MatchSheet>
  )
}
