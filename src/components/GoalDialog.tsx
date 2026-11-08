import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MatchSheet, TeamPlayerGrid, type TeamWithPlayers } from './PlayerSheet'

export interface GoalResult {
  scorerId: string
  assisterId: string | null
  // The scorer put the ball in their own net: the goal counts for the other side
  ownGoal?: boolean
}

interface GoalDialogProps {
  teams: TeamWithPlayers[]
  // Whose players can score an own goal. Defaults to `teams`.
  ownGoalTeams?: TeamWithPlayers[]
  onConfirm: (result: GoalResult) => void
  onClose: () => void
}

// Two taps: who scored, then who assisted (or No assist). An own goal is one tap on Own goal, then
// the player who put it in their own net; it has no assist. A wrong tap is put right with Undo.
export function GoalDialog({ teams, ownGoalTeams = teams, onConfirm, onClose }: GoalDialogProps) {
  const { t } = useTranslation()
  const [scorerId, setScorerId] = useState<string | null>(null)
  const [ownGoal, setOwnGoal] = useState(false)
  const scorer = teams.flatMap((tm) => tm.players).find((p) => p.id === scorerId)
  const canOwnGoal = ownGoalTeams.some((tm) => tm.players.length > 0)
  const secondary = 'flex-1 min-h-[48px] rounded-xl bg-gray-700 hover:bg-gray-600 font-semibold'

  if (ownGoal) {
    return (
      <MatchSheet
        title={t('goal.whoOwnGoal')}
        onClose={onClose}
        footer={<button type="button" onClick={() => setOwnGoal(false)} className={secondary}>{t('goal.notOwnGoal')}</button>}
      >
        <p className="text-sm text-gray-400 mb-3">{t('goal.ownGoalHint')}</p>
        <TeamPlayerGrid teams={ownGoalTeams} onPick={(id) => onConfirm({ scorerId: id, assisterId: null, ownGoal: true })} />
      </MatchSheet>
    )
  }

  if (!scorerId) {
    return (
      <MatchSheet
        title={t('goal.whoScored')}
        onClose={onClose}
        footer={canOwnGoal && (
          <button type="button" onClick={() => setOwnGoal(true)} className={secondary}>{t('goal.ownGoal')}</button>
        )}
      >
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
        <button type="button" onClick={() => setScorerId(null)} className={secondary}>
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
