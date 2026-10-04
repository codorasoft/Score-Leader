import { useState } from 'react'
import type { Player } from '../lib/types'

type CardType = 'yellow_card' | 'red_card'

interface CardDialogProps {
  players: Player[]
  onConfirm: (result: { playerId: string; cardType: CardType; suspensionMinutes: 2 | 3 | null }) => void
  onClose: () => void
}

export function CardDialog({ players, onConfirm, onClose }: CardDialogProps) {
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [cardType, setCardType] = useState<CardType | null>(null)

  const handleCardSelect = (type: CardType) => {
    setCardType(type)
    if (type === 'yellow_card') {
      onConfirm({ playerId: playerId!, cardType: 'yellow_card', suspensionMinutes: null })
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-sm">
        <h2 className="text-lg font-bold mb-4">
          {!playerId ? 'Card — who?' : !cardType ? 'Card type?' : 'Suspension?'}
        </h2>

        {!playerId && (
          <div className="space-y-2">
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
        )}

        {playerId && !cardType && (
          <div className="flex gap-3">
            <button
              onClick={() => handleCardSelect('yellow_card')}
              className="flex-1 py-3 bg-yellow-500 rounded font-bold text-black"
            >
              Yellow
            </button>
            <button
              onClick={() => handleCardSelect('red_card')}
              className="flex-1 py-3 bg-red-600 rounded font-bold"
            >
              Red
            </button>
          </div>
        )}

        {playerId && cardType === 'red_card' && (
          <div className="space-y-2">
            <p className="text-sm text-gray-400 mb-3">Suspension duration:</p>
            {([2, 3] as const).map((mins) => (
              <button
                key={mins}
                onClick={() => onConfirm({ playerId, cardType: 'red_card', suspensionMinutes: mins })}
                className="w-full py-3 bg-red-700 rounded font-bold hover:bg-red-600"
              >
                {mins} min
              </button>
            ))}
          </div>
        )}

        <button onClick={onClose} className="mt-4 text-sm text-gray-400 block">Cancel</button>
      </div>
    </div>
  )
}
