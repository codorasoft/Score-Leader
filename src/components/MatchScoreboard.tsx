import { useTranslation } from 'react-i18next'
import type { Team } from '../lib/types'
import { styleMap } from '../lib/teamColors'

const colorBg = styleMap('card')

// The two teams and their score. With onTeam, a card is a button that shows that team's players.
export function MatchScoreboard({ team1, team2, score1, score2, onTeam }: {
  team1: Team
  team2: Team
  score1: number
  score2: number
  onTeam?: (team: Team) => void
}) {
  const { t } = useTranslation()
  const side = (team: Team, score: number) => {
    const name = t('common.teamName', { color: t(`common.teamColor.${team.color}`) })
    const body = (
      <>
        <div className="text-xs uppercase text-gray-400 mb-1">{name}</div>
        <div className="text-4xl font-bold">{score}</div>
        {onTeam && <div className="text-xs text-gray-400 mt-1" aria-hidden="true">👥 {t('match.showPlayers')}</div>}
      </>
    )
    const box = `flex-1 text-center p-4 rounded-xl border ${colorBg[team.color]}`
    return onTeam
      ? (
        <button type="button" onClick={() => onTeam(team)} aria-label={t('match.teamPlayers', { team: name })}
          className={`${box} active:scale-[0.98] transition-transform`}>
          {body}
        </button>
      )
      : <div className={box}>{body}</div>
  }
  return (
    <div className="flex items-center justify-center gap-6 mb-6">
      {side(team1, score1)}
      <div className="text-gray-500 font-bold">{t('common.vs')}</div>
      {side(team2, score2)}
    </div>
  )
}
