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

  // Winner stays, waiting team comes on, loser sits out.
  // For draws (draw_resolved_by='late_team'), winner_team_id = team1_id (the
  // previous match's winner) so they retain their spot; team2 sits out.
  const loserTeamId = winner_team_id === team1_id ? team2_id : team1_id
  return {
    nextTeam1Id: winner_team_id,
    nextTeam2Id: waiting_team_id,
    nextWaitingTeamId: loserTeamId,
  }
}

export function setupFirstMatch(teams: Team[]): { team1Id: string; team2Id: string; waitingTeamId: string } {
  // Fisher-Yates shuffle
  const arr = [...teams]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return {
    team1Id: arr[0].id,
    team2Id: arr[1].id,
    waitingTeamId: arr[2].id,
  }
}
