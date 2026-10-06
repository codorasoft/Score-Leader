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
    // Nobody waiting (2 teams): the same two play again
    nextTeam2Id: waiting_team_id ?? loserTeamId,
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

// The match to start when a session is under way but has none set up (e.g. the admin deleted
// them): the rotation carries on from the last finished match, or match 1 starts afresh.
// Null while a match is still pending or being played.
export function nextMatchToStart(
  matches: Match[],
  teams: Team[],
  firstWaitingTeamId?: string,
): { matchNumber: number; team1Id: string; team2Id: string; waitingTeamId: string } | null {
  if (teams.length !== 3 || matches.some((m) => m.status !== 'completed')) return null
  const last = [...matches].sort((a, b) => b.match_number - a.match_number)[0]
  if (!last?.winner_team_id) {
    const first = setupFirstMatch(teams, firstWaitingTeamId)
    return { matchNumber: (last?.match_number ?? 0) + 1, ...first }
  }
  const next = resolveMatch(last)
  return { matchNumber: last.match_number + 1, team1Id: next.nextTeam1Id, team2Id: next.nextTeam2Id, waitingTeamId: next.nextWaitingTeamId }
}
