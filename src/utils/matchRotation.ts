import type { Match, Team } from '../lib/types'
import { TEAM_COLORS } from '../lib/teamColors'

// The next match: who plays, and the teams waiting to come on in order (first comes on next).
export interface NextMatch {
  team1Id: string
  team2Id: string
  queue: string[]
}

// Winner stays, the first waiting team comes on, the loser joins the back of the queue
// (draws are decided by decideResult first). With nobody waiting (2 teams) the same two play again.
export function resolveMatch(match: Match): NextMatch {
  const { team1_id, team2_id, winner_team_id } = match
  if (!winner_team_id) throw new Error('Cannot resolve match without a winner')
  const loser = winner_team_id === team1_id ? team2_id : team1_id
  // Matches saved before queues existed only have their waiting team
  const waiting = match.queue?.length ? match.queue : match.waiting_team_id ? [match.waiting_team_id] : []
  if (waiting.length === 0) return { team1Id: winner_team_id, team2Id: loser, queue: [] }
  return { team1Id: winner_team_id, team2Id: waiting[0], queue: [...waiting.slice(1), loser] }
}

// Columns for a new match row; waiting_team_id is kept as the queue's first team for older readers
export function matchRowFields(next: NextMatch): Pick<Match, 'team1_id' | 'team2_id' | 'queue' | 'waiting_team_id'> {
  return { team1_id: next.team1Id, team2_id: next.team2Id, queue: next.queue, waiting_team_id: next.queue[0] ?? null }
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

// The admin may choose the two teams that play first; otherwise two are picked at random.
// Everyone else queues in colour order.
export function setupFirstMatch(teams: Team[], playing?: [string, string]): NextMatch {
  const chosen = playing && playing[0] !== playing[1] && playing.every((id) => teams.some((tm) => tm.id === id))
    ? [...playing]
    : [...teams].sort(() => Math.random() - 0.5).slice(0, 2).map((tm) => tm.id)
  if (Math.random() < 0.5) chosen.reverse()
  const queue = teams
    .filter((tm) => !chosen.includes(tm.id))
    .sort((a, b) => TEAM_COLORS.indexOf(a.color) - TEAM_COLORS.indexOf(b.color))
    .map((tm) => tm.id)
  return { team1Id: chosen[0], team2Id: chosen[1], queue }
}

// The match to start when a session is under way but has none set up (e.g. the admin deleted
// them): the rotation carries on from the last finished match, or match 1 starts afresh.
// Null while a match is still pending or being played.
export function nextMatchToStart(
  matches: Match[],
  teams: Team[],
  playing?: [string, string],
): (NextMatch & { matchNumber: number }) | null {
  if (teams.length < 2 || matches.some((m) => m.status !== 'completed')) return null
  const last = [...matches].sort((a, b) => b.match_number - a.match_number)[0]
  if (!last?.winner_team_id) return { matchNumber: (last?.match_number ?? 0) + 1, ...setupFirstMatch(teams, playing) }
  return { matchNumber: last.match_number + 1, ...resolveMatch(last) }
}
