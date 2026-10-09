import type { EventType, Match, MatchEvent } from '../lib/types'
import { decideResult, drawGoesToPenalties } from './matchRotation'
import type { MatchFormat } from './matchFormat'

const SCORING: EventType[] = ['goal', 'penalty_goal']
const UNDOABLE: EventType[] = [...SCORING, 'yellow_card', 'red_card', 'swap']

// Assists and the second row of a swap pair are undone together with the event they belong to.
export function findLastUndoable<E extends Pick<MatchEvent, 'event_type' | 'created_at'> & { related_event_id?: string | null }>(events: E[]): E | null {
  return events
    .filter((e) => UNDOABLE.includes(e.event_type) && !(e.event_type === 'swap' && e.related_event_id))
    .reduce<E | null>((last, e) => (!last || e.created_at > last.created_at ? e : last), null)
}

export function recomputeResult(
  match: Pick<Match, 'team1_id' | 'team2_id' | 'winner_team_id' | 'match_number' | 'draw_resolved_by' | 'period' | 'penalties_team1' | 'penalties_team2'>,
  events: { event_type: EventType; team_id: string }[],
  format: Pick<MatchFormat, 'penalties' | 'draw_rule'>,
): Pick<Match, 'team1_score' | 'team2_score' | 'is_draw' | 'winner_team_id' | 'draw_resolved_by'> {
  const goals = events.filter((e) => SCORING.includes(e.event_type))
  const team1_score = goals.filter((e) => e.team_id === match.team1_id).length
  const team2_score = goals.filter((e) => e.team_id === match.team2_id).length
  if (team1_score === team2_score) {
    // Draws the session settles by a shoot-out keep its winner; other draws follow the session's draw rule.
    // Only a saved shoot-out score proves penalties; without one a match that reached extra time says so.
    // A Quick match 1 (stay rule, no penalties format) keeps its long-standing 'penalties' mark.
    if (drawGoesToPenalties(format, match.match_number)) {
      const shootOutSaved = match.penalties_team1 != null && match.penalties_team2 != null
      const draw_resolved_by = shootOutSaved ? 'penalties'
        : match.period >= 3 ? 'extra_time'
        : !format.penalties ? 'penalties'
        : match.draw_resolved_by ?? null
      return { team1_score, team2_score, is_draw: true, winner_team_id: match.winner_team_id, draw_resolved_by }
    }
    return { team1_score, team2_score, ...decideResult({ ...match, team1_score, team2_score }, format) }
  }
  return {
    team1_score,
    team2_score,
    is_draw: false,
    winner_team_id: team1_score > team2_score ? match.team1_id : match.team2_id,
    // A match decided in extra time keeps its "aet" mark
    draw_resolved_by: match.period >= 3 ? 'extra_time' : null,
  }
}

// Undoing a card or swap is only offered while that feature is on for the league
export function undoAllowed(eventType: MatchEvent['event_type'], on: { cards: boolean; swaps: boolean }): boolean {
  if (eventType === 'swap') return on.swaps
  if (eventType === 'yellow_card' || eventType === 'red_card') return on.cards
  return true
}
