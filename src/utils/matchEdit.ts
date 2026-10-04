import type { EventType, Match } from '../lib/types'

const SCORING: EventType[] = ['goal', 'penalty_goal']

export function recomputeResult(
  match: Pick<Match, 'team1_id' | 'team2_id' | 'winner_team_id' | 'match_number' | 'draw_resolved_by'>,
  events: { event_type: EventType; team_id: string }[],
): Pick<Match, 'team1_score' | 'team2_score' | 'is_draw' | 'winner_team_id' | 'draw_resolved_by'> {
  const goals = events.filter((e) => SCORING.includes(e.event_type))
  const team1_score = goals.filter((e) => e.team_id === match.team1_id).length
  const team2_score = goals.filter((e) => e.team_id === match.team2_id).length
  if (team1_score === team2_score) {
    return {
      team1_score,
      team2_score,
      is_draw: true,
      winner_team_id: match.winner_team_id,
      draw_resolved_by: match.draw_resolved_by ?? (match.match_number === 1 ? 'penalties' : 'late_team'),
    }
  }
  return {
    team1_score,
    team2_score,
    is_draw: false,
    winner_team_id: team1_score > team2_score ? match.team1_id : match.team2_id,
    draw_resolved_by: null,
  }
}
