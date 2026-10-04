import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Player, Team } from '../lib/types'

interface TeamWithPlayers {
  team: Team
  players: Player[]
}

interface SwapDialogProps {
  teams: TeamWithPlayers[]
  onSwap: (p1Id: string, p2Id: string) => void
  onClose: () => void
}

export function SwapDialog({ teams, onSwap, onClose }: SwapDialogProps) {
  const { t } = useTranslation()
  const [firstId, setFirstId] = useState<string | null>(null)
  const [firstTeamId, setFirstTeamId] = useState<string | null>(null)

  const handleSelect = (playerId: string, teamId: string) => {
    if (!firstId) {
      setFirstId(playerId)
      setFirstTeamId(teamId)
    } else {
      onSwap(firstId, playerId)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-2">{t('swap.title')}</h2>
        <p className="text-sm text-gray-400 mb-4">
          {!firstId ? t('swap.selectFirst') : t('swap.selectSecond')}
        </p>

        {teams.map(({ team, players }) => (
          <div key={team.id} className="mb-4">
            <h3 className="text-xs uppercase text-gray-400 mb-2">
              {t('common.teamName', { color: t(`common.teamColor.${team.color}`) })}
            </h3>
            <div className="space-y-1">
              {players.map((p) => {
                const isFirst = p.id === firstId
                const isDisabledSecond = firstId !== null && firstTeamId === team.id
                return (
                  <button
                    key={p.id}
                    disabled={isDisabledSecond && !isFirst}
                    onClick={() => handleSelect(p.id, team.id)}
                    className={`w-full text-left px-3 py-2 rounded text-sm ${
                      isFirst ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600 disabled:opacity-40'
                    }`}
                  >
                    {p.name}
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        <button onClick={onClose} className="text-sm text-gray-400">{t('common.cancel')}</button>
      </div>
    </div>
  )
}
