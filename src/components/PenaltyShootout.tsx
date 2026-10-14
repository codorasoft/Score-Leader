import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Team } from '../lib/types'

// Counts each team's penalties; the shoot-out can only be decided once one team is ahead
export function PenaltyShootout({ team1, team2, busy, onDecide }: {
  team1: Team
  team2: Team
  busy: boolean
  onDecide: (team1: number, team2: number) => void
}) {
  const { t } = useTranslation()
  const [score1, setScore1] = useState(0)
  const [score2, setScore2] = useState(0)

  const side = (team: Team, score: number, setScore: (f: (n: number) => number) => void) => (
    <div className="flex-1">
      <div className="text-xs text-gray-400 mb-1">{t('common.teamName', { color: t(`common.teamColor.${team.color}`) })}</div>
      <div className="flex items-center gap-2">
        <button onClick={() => setScore((n) => Math.max(0, n - 1))} className="px-2 py-1 bg-gray-700 rounded">−</button>
        <span className="text-2xl font-bold w-8 text-center">{score}</span>
        <button onClick={() => setScore((n) => n + 1)} className="px-2 py-1 bg-gray-700 rounded">+</button>
      </div>
    </div>
  )

  return (
    <div className="bg-gray-800 rounded-xl p-4 mb-4">
      <h3 className="font-bold mb-3">{t('match.penaltyTitle')}</h3>
      <div className="flex gap-4 items-center mb-4">
        {side(team1, score1, setScore1)}
        {side(team2, score2, setScore2)}
      </div>
      <button
        onClick={() => onDecide(score1, score2)}
        disabled={score1 === score2 || busy}
        className="w-full py-2 bg-blue-600 rounded font-semibold disabled:opacity-50"
      >
        {t('match.penaltyConfirm')}
      </button>
    </div>
  )
}
