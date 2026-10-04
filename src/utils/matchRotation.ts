import type { Match, Team } from '../lib/types'

export interface NextMatchConfig {
  nextTeam1Id: string
  nextTeam2Id: string
  nextWaitingTeamId: string
}

export function resolveMatch(match: Match): NextMatchConfig {
  const { team1_id, team2_id, waiting_team_id, winner_team_id } = match

  if (!winner_team_id) {
    throw new Error('Cannot resolve match without a winner')
  }

  // Winner stays, waiting team comes on, loser sits out (draws are decided by decideResult first).
  const loserTeamId = winner_team_id === team1_id ? team2_id : team1_id
  return {
    nextTeam1Id: winner_team_id,
    nextTeam2Id: waiting_team_id,
    nextWaitingTeamId: loserTeamId,
  }
}

// Session rule: a draw in match 1 goes to penalties (no winner yet). In later matches team1
// is the previous winner and team2 has just come on from waiting; the team that waited
// longer wins a draw, so the previous winner counts as the loser and goes off.
export function decideResult(params: Pick<Match, 'team1_score' | 'team2_score' | 'match_number' | 'team1_id' | 'team2_id'>):
  Pick<Match, 'is_draw' | 'draw_resolved_by' | 'winner_team_id'> {
  const { team1_score, team2_score } = params
  if (team1_score !== team2_score) {
    return { is_draw: false, draw_resolved_by: null, winner_team_id: team1_score > team2_score ? params.team1_id : params.team2_id }
  }
  if (params.match_number === 1) return { is_draw: true, draw_resolved_by: null, winner_team_id: null }
  return { is_draw: true, draw_resolved_by: 'late_team', winner_team_id: params.team2_id }
}

// The admin may choose which team sits out the first match; otherwise it is a coin flip.
export function setupFirstMatch(
  teams: Team[],
  waitingTeamId?: string,
): { team1Id: string; team2Id: string; waitingTeamId: string } {
  const waiting = teams.find((tm) => tm.id === waitingTeamId) ?? teams[Math.floor(Math.random() * teams.length)]
  const playing = teams.filter((tm) => tm.id !== waiting.id)
  if (Math.random() < 0.5) playing.reverse()
  return { team1Id: playing[0].id, team2Id: playing[1].id, waitingTeamId: waiting.id }
}
