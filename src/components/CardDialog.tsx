import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MatchSheet, TeamPlayerGrid, type TeamWithPlayers } from './PlayerSheet'

type CardType = 'yellow_card' | 'red_card'

interface CardDialogProps {
  teams: TeamWithPlayers[]
  onConfirm: (result: { playerId: string; cardType: CardType; suspensionMinutes: 2 | 3 | null }) => void
  onClose: () => void
}

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
  const big = 'flex-1 min-h-[64px] rounded-xl font-bold text-lg'

  return (
    <MatchSheet title={title} onClose={onClose}>
      {!playerId && <TeamPlayerGrid teams={teams} onPick={setPlayerId} />}

      {playerId && !cardType && (
        <div className="flex gap-3">
          <button onClick={() => handleCardSelect('yellow_card')} className={`${big} bg-yellow-400 hover:bg-yellow-300 text-black`}>
            {t('card.yellow')}
          </button>
          <button onClick={() => handleCardSelect('red_card')} className={`${big} bg-red-600 hover:bg-red-500`}>
            {t('card.red')}
          </button>
        </div>
      )}

      {playerId && cardType === 'red_card' && (
        <div>
          <p className="text-sm text-gray-400 mb-3">{t('card.suspensionLabel')}</p>
          <div className="flex gap-3">
            {([2, 3] as const).map((mins) => (
              <button
                key={mins}
                onClick={() => onConfirm({ playerId, cardType: 'red_card', suspensionMinutes: mins })}
                className={`${big} bg-red-700 hover:bg-red-600`}
              >
                {t('card.min', { count: mins })}
              </button>
            ))}
          </div>
        </div>
      )}
    </MatchSheet>
  )
}
