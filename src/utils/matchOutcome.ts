import type { Match } from '../lib/types'
import { periodLength, type MatchFormat } from './matchFormat'

export type OutcomeReason = 'goalLimit' | 'timeUp' | 'endedEarly' | 'penalties' | 'drawPreviousWinnerLoses' | 'extraTime' | 'draw'

export interface MatchOutcome {
  isDraw: boolean
  winnerTeamId: string | null
  loserTeamId?: string
  reason: OutcomeReason
  penaltyScore?: { winner: number; loser: number }
}

export function describeOutcome(params: Pick<Match, 'team1_id' | 'team2_id' | 'team1_score' | 'team2_score' | 'is_draw' | 'draw_resolved_by'> & {
  winner_team_id: string | null
  format: MatchFormat
  totalSeconds: number
  penalties?: { team1: number; team2: number }
}): MatchOutcome {
  const { winner_team_id: winnerTeamId } = params

  if (params.is_draw) {
    if (params.draw_resolved_by === 'penalties' && params.penalties) {
      const team1Won = winnerTeamId === params.team1_id
      const { team1, team2 } = params.penalties
      return {
        isDraw: true, winnerTeamId, reason: 'penalties',
        penaltyScore: { winner: team1Won ? team1 : team2, loser: team1Won ? team2 : team1 },
      }
    }
    if (winnerTeamId === null) return { isDraw: true, winnerTeamId: null, reason: 'draw' }
    const loserTeamId = winnerTeamId === params.team1_id ? params.team2_id : params.team1_id
    return { isDraw: true, winnerTeamId, loserTeamId, reason: 'drawPreviousWinnerLoses' }
  }

  if (winnerTeamId === null) return { isDraw: false, winnerTeamId: null, reason: 'endedEarly' }
  if (params.draw_resolved_by === 'extra_time') return { isDraw: false, winnerTeamId, reason: 'extraTime' }
  const winnerScore = winnerTeamId === params.team1_id ? params.team1_score : params.team2_score
  const { format } = params
  if (format.goal_limit != null && winnerScore >= format.goal_limit) return { isDraw: false, winnerTeamId, reason: 'goalLimit' }
  let regular = 0
  for (let n = 1; n <= format.period_count; n++) regular += periodLength(n, format) ?? 0
  if (params.totalSeconds >= regular) return { isDraw: false, winnerTeamId, reason: 'timeUp' }
  return { isDraw: false, winnerTeamId, reason: 'endedEarly' }
}
