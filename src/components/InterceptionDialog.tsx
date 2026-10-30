import { useTranslation } from 'react-i18next'
import type { Player, Team } from '../lib/types'
import { styleMap } from '../lib/teamColors'

interface TeamWithPlayers {
  team: Team
  players: Player[]
}

const colorDot = styleMap('dot')

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
    <div className="dialog-backdrop fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-sm max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">{t('interception.who')}</h2>
        <div className="space-y-4">
          {teams.map(({ team, players }) => (
            <div key={team.id}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-2.5 h-2.5 rounded-full ${colorDot[team.color] ?? 'bg-gray-400'}`} />
                <span className="text-xs uppercase font-semibold text-gray-400 tracking-wide">
                  {t('common.teamName', { color: t(`common.teamColor.${team.color}`) })}
                </span>
              </div>
              <div className="space-y-1 ps-4">
                {defendersFirst(players).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onConfirm(p.id)}
                    className="w-full text-left px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="text-[10px] font-bold text-gray-400">{p.position}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button onClick={onClose} className="mt-4 text-sm text-gray-400 block">{t('common.cancel')}</button>
      </div>
    </div>
  )
}
