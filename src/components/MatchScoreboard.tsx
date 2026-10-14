import { useTranslation } from 'react-i18next'
import type { Team } from '../lib/types'
import { styleMap } from '../lib/teamColors'

const colorBg = styleMap('card')

export function MatchScoreboard({ team1, team2, score1, score2 }: { team1: Team; team2: Team; score1: number; score2: number }) {
  const { t } = useTranslation()
  const side = (team: Team, score: number) => (
    <div className={`flex-1 text-center p-4 rounded-xl border ${colorBg[team.color]}`}>
      <div className="text-xs uppercase text-gray-400 mb-1">{t('common.teamName', { color: t(`common.teamColor.${team.color}`) })}</div>
      <div className="text-4xl font-bold">{score}</div>
    </div>
  )
  return (
    <div className="flex items-center justify-center gap-6 mb-6">
      {side(team1, score1)}
      <div className="text-gray-500 font-bold">{t('common.vs')}</div>
      {side(team2, score2)}
    </div>
  )
}
