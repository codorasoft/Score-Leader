import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Player, Team } from '../lib/types'
import { styleMap } from '../lib/teamColors'

interface TeamWithPlayers {
  team: Team
  players: Player[]
}

interface GoalDialogProps {
  teams: TeamWithPlayers[]
  onConfirm: (result: { scorerId: string; assisterId: string | null }) => void
  onClose: () => void
}

const colorDot = styleMap('dot')

export function GoalDialog({ teams, onConfirm, onClose }: GoalDialogProps) {
  const { t } = useTranslation()
  const [scorerId, setScorerId] = useState<string | null>(null)
  const [assisterId, setAssisterId] = useState<string | null | 'none'>('none')

  const step = scorerId === null ? 'scorer' : 'assister'

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-sm max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">
          {step === 'scorer' ? t('goal.whoScored') : t('goal.assist')}
        </h2>

        {step === 'scorer' && (
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
                      onClick={() => setScorerId(p.id)}
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

        {step === 'assister' && (
          <>
            <div className="space-y-4 mb-4">
              {teams.map(({ team, players }) => {
                const eligible = players.filter((p) => p.id !== scorerId)
                if (eligible.length === 0) return null
                return (
                  <div key={team.id}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${colorDot[team.color] ?? 'bg-gray-400'}`} />
                      <span className="text-xs uppercase font-semibold text-gray-400 tracking-wide">
                        {t('common.teamName', { color: t(`common.teamColor.${team.color}`) })}
                      </span>
                    </div>
                    <div className="space-y-1 ps-4">
                      {eligible.map((p) => (
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
                    </div>
                  </div>
                )
              })}
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
