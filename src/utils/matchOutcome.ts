import type { Match } from '../lib/types'
import { GOAL_LIMIT, MATCH_DURATION_SECONDS } from './matchClock'

export type OutcomeReason = 'goalLimit' | 'timeUp' | 'endedEarly' | 'penalties' | 'drawPreviousWinnerLoses'

export interface MatchOutcome {
  isDraw: boolean
  winnerTeamId: string
  loserTeamId?: string
  reason: OutcomeReason
  penaltyScore?: { winner: number; loser: number }
}

export function describeOutcome(params: Pick<Match, 'team1_id' | 'team2_id' | 'team1_score' | 'team2_score' | 'is_draw' | 'draw_resolved_by'> & {
  winner_team_id: string
  elapsedSeconds: number
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
    const loserTeamId = winnerTeamId === params.team1_id ? params.team2_id : params.team1_id
    return { isDraw: true, winnerTeamId, loserTeamId, reason: 'drawPreviousWinnerLoses' }
  }

  const winnerScore = winnerTeamId === params.team1_id ? params.team1_score : params.team2_score
  if (winnerScore >= GOAL_LIMIT) return { isDraw: false, winnerTeamId, reason: 'goalLimit' }
  if (params.elapsedSeconds >= MATCH_DURATION_SECONDS) return { isDraw: false, winnerTeamId, reason: 'timeUp' }
  return { isDraw: false, winnerTeamId, reason: 'endedEarly' }
}
