import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Player } from '../lib/types'

interface GoalDialogProps {
  players: Player[]
  onConfirm: (result: { scorerId: string; assisterId: string | null }) => void
  onClose: () => void
}

export function GoalDialog({ players, onConfirm, onClose }: GoalDialogProps) {
  const { t } = useTranslation()
  const [scorerId, setScorerId] = useState<string | null>(null)
  const [assisterId, setAssisterId] = useState<string | null | 'none'>('none')

  const step = scorerId === null ? 'scorer' : 'assister'

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-sm">
        <h2 className="text-lg font-bold mb-4">
          {step === 'scorer' ? t('goal.whoScored') : t('goal.assist')}
        </h2>

        {step === 'scorer' && (
          <div className="space-y-2">
            {players.map((p) => (
              <button
                key={p.id}
                onClick={() => setScorerId(p.id)}
                className="w-full text-left px-4 py-2 rounded bg-gray-700 hover:bg-gray-600"
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        {step === 'assister' && (
          <>
            <div className="space-y-2 mb-4">
              {players
                .filter((p) => p.id !== scorerId)
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setAssisterId(p.id)}
                    className={`w-full text-left px-4 py-2 rounded ${
                      assisterId === p.id ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              <button
                onClick={() => setAssisterId(null)}
                className={`w-full text-left px-4 py-2 rounded ${
                  assisterId === null ? 'bg-gray-600' : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                {t('goal.noAssist')}
              </button>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400">{t('common.cancel')}</button>
              <button
                onClick={() => onConfirm({ scorerId: scorerId!, assisterId: assisterId === 'none' ? null : assisterId })}
                className="px-4 py-2 bg-green-600 rounded text-sm font-semibold"
              >
                {t('common.confirm')}
              </button>
            </div>
          </>
        )}

        {step === 'scorer' && (
          <button onClick={onClose} className="mt-4 text-sm text-gray-400">{t('common.cancel')}</button>
        )}
      </div>
    </div>
  )
}
