import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MatchSheet, TeamPlayerGrid, type TeamWithPlayers } from './PlayerSheet'

interface GoalDialogProps {
  teams: TeamWithPlayers[]
  onConfirm: (result: { scorerId: string; assisterId: string | null }) => void
  onClose: () => void
}

// Two taps: who scored, then who assisted (or No assist). A wrong tap is put right with Undo.
export function GoalDialog({ teams, onConfirm, onClose }: GoalDialogProps) {
  const { t } = useTranslation()
  const [scorerId, setScorerId] = useState<string | null>(null)
  const scorer = teams.flatMap((tm) => tm.players).find((p) => p.id === scorerId)

  if (!scorerId) {
    return (
      <MatchSheet title={t('goal.whoScored')} onClose={onClose}>
        <TeamPlayerGrid teams={teams} onPick={setScorerId} />
      </MatchSheet>
    )
  }

  // The scorer's own team first: that is where most assists come from
  const own = teams.filter((tm) => tm.players.some((p) => p.id === scorerId))
  const others = teams.filter((tm) => !own.includes(tm))
  const eligible = [...own, ...others].map((tm) => ({ ...tm, players: tm.players.filter((p) => p.id !== scorerId) }))

  return (
    <MatchSheet
      title={t('goal.assistFor', { name: scorer?.name ?? '' })}
      onClose={onClose}
      footer={
        <button type="button" onClick={() => setScorerId(null)} className="flex-1 min-h-[48px] rounded-xl bg-gray-700 hover:bg-gray-600 font-semibold">
          {t('goal.changeScorer')}
        </button>
      }
    >
      <button
        type="button"
        onClick={() => onConfirm({ scorerId, assisterId: null })}
        className="w-full min-h-[52px] mb-3 rounded-xl bg-green-600 hover:bg-green-500 font-bold"
      >
        {t('goal.noAssist')}
      </button>
      <TeamPlayerGrid teams={eligible} onPick={(id) => onConfirm({ scorerId, assisterId: id })} />
    </MatchSheet>
  )
}
