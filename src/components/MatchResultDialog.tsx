import { useTranslation } from 'react-i18next'
import type { Team } from '../lib/types'
import type { MatchOutcome } from '../utils/matchOutcome'
import { GOAL_LIMIT, MATCH_DURATION_SECONDS } from '../utils/matchClock'
import { styleMap } from '../lib/teamColors'

const colorBg = styleMap('card')

interface Props {
  outcome: MatchOutcome
  team1: { team: Team | undefined; score: number }
  team2: { team: Team | undefined; score: number }
  // queue: the teams waiting after this match, in order (empty with two teams)
  next: { team1: Team | undefined; team2: Team | undefined; queue: Team[] }
  onContinue: () => void
}

export function MatchResultDialog({ outcome, team1, team2, next, onContinue }: Props) {
  const { t } = useTranslation()
  const name = (team: Team | undefined) =>
    team ? t('common.teamName', { color: t(`common.teamColor.${team.color}`) }) : '?'

  const winnerTeam = [team1.team, team2.team].find((tm) => tm?.id === outcome.winnerTeamId)
  const winner = name(winnerTeam)
  const loser = name([team1.team, team2.team].find((tm) => tm?.id === outcome.loserTeamId))

  const side = ({ team, score }: Props['team1']) => (
    <div className={`flex-1 rounded-xl border p-3 ${colorBg[team?.color ?? ''] ?? 'border-gray-600'} ${team?.id === outcome.winnerTeamId ? '' : 'opacity-60'}`}>
      <div className="text-xs text-gray-300 truncate">{name(team)}</div>
      <div className="text-3xl font-bold">{score}</div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onContinue}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="result-title"
        className="bg-gray-800 rounded-2xl p-6 w-full max-w-sm text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-5xl mb-2" aria-hidden="true">🏆</div>
        <h2 id="result-title" className="text-2xl font-bold mb-4">{t('result.winsTitle', { team: winner })}</h2>

        <div className="flex items-stretch gap-2 mb-4">
          {side(team1)}
          <div className="self-center text-gray-500 font-bold">–</div>
          {side(team2)}
        </div>

        <p className="bg-gray-900/60 rounded-lg px-3 py-2 text-sm text-gray-200 mb-4">
          {t(`result.reason.${outcome.reason}`, {
            team: winner, loser, limit: GOAL_LIMIT, minutes: MATCH_DURATION_SECONDS / 60,
            winnerPens: outcome.penaltyScore?.winner, loserPens: outcome.penaltyScore?.loser,
          })}
        </p>

        <p className="text-xs text-gray-400 mb-5">
          {t('result.next', { team1: name(next.team1), team2: name(next.team2) })}
          {next.queue.length > 0 && <span className="block mt-1">
            {next.queue.length > 1
              ? t('match.nextUpThen', { team: name(next.queue[0]), rest: next.queue.slice(1).map(name).join(', ') })
              : t('match.nextUp', { team: name(next.queue[0]) })}
          </span>}
        </p>

        <button autoFocus onClick={onContinue} className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold">
          {t('result.continue')}
        </button>
      </div>
    </div>
  )
}
