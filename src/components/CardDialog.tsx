import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Player, Team } from '../lib/types'
import { styleMap } from '../lib/teamColors'

type CardType = 'yellow_card' | 'red_card'

interface TeamWithPlayers {
  team: Team
  players: Player[]
}

interface CardDialogProps {
  teams: TeamWithPlayers[]
  onConfirm: (result: { playerId: string; cardType: CardType; suspensionMinutes: 2 | 3 | null }) => void
  onClose: () => void
}

const colorDot = styleMap('dot')

export function CardDialog({ teams, onConfirm, onClose }: CardDialogProps) {
  const { t } = useTranslation()
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [cardType, setCardType] = useState<CardType | null>(null)

  const handleCardSelect = (type: CardType) => {
    setCardType(type)
    if (type === 'yellow_card') {
      onConfirm({ playerId: playerId!, cardType: 'yellow_card', suspensionMinutes: null })
    }
  }

  const title = !playerId ? t('card.who') : !cardType ? t('card.type') : t('card.suspension')

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-sm max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">{title}</h2>

        {!playerId && (
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
                  {players.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPlayerId(p.id)}
                      className="w-full text-left px-4 py-2 rounded bg-gray-700 hover:bg-gray-600"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {playerId && !cardType && (
          <div className="flex gap-3">
            <button
              onClick={() => handleCardSelect('yellow_card')}
              className="flex-1 py-3 bg-yellow-500 rounded font-bold text-black"
            >
              {t('card.yellow')}
            </button>
            <button
              onClick={() => handleCardSelect('red_card')}
              className="flex-1 py-3 bg-red-600 rounded font-bold"
            >
              {t('card.red')}
            </button>
          </div>
        )}

        {playerId && cardType === 'red_card' && (
          <div className="space-y-2">
            <p className="text-sm text-gray-400 mb-3">{t('card.suspensionLabel')}</p>
            {([2, 3] as const).map((mins) => (
              <button
                key={mins}
                onClick={() => onConfirm({ playerId, cardType: 'red_card', suspensionMinutes: mins })}
                className="w-full py-3 bg-red-700 rounded font-bold hover:bg-red-600"
              >
                {t('card.min', { count: mins })}
              </button>
            ))}
          </div>
        )}

        <button onClick={onClose} className="mt-4 text-sm text-gray-400 block">{t('common.cancel')}</button>
      </div>
    </div>
  )
}
