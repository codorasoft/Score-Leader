// A small finished league for page tests: six players in three teams, one completed session
// with two matches, plus a player from another league that must never show up.
import { DEFAULT_FORMAT } from '../utils/matchFormat'
import type { Match, MatchEvent, Player, Session, Team, TeamPlayer } from '../lib/types'

const L = 'L1'

export const player = (id: string, name: string, position: Player['position'], skill: number, extra: Partial<Player> = {}): Player => ({
  league_id: L, id, name, position, skill_rating: skill, photo_url: null, is_active: true, created_at: '2026-01-01T00:00:00Z', ...extra,
})

export const team = (id: string, session_id: string, color: Team['color']): Team => ({ league_id: L, id, session_id, color, name: null })

export const match = (id: string, extra: Partial<Match> = {}): Match => ({
  league_id: L, id, session_id: 's1', match_number: 1, team1_id: 'tg', team2_id: 'tb', waiting_team_id: 'ty', queue: ['ty'],
  status: 'pending', team1_score: 0, team2_score: 0, winner_team_id: null, is_draw: false, draw_resolved_by: null,
  timer_started_at: null, timer_elapsed_seconds: 0, timer_status: 'stopped', period: 1, period_seconds: [], penalties_team1: null, penalties_team2: null, created_at: '2026-09-20T18:00:00Z', ...extra,
})

export const event = (id: string, match_id: string, player_id: string, team_id: string, event_type: MatchEvent['event_type'], extra: Partial<MatchEvent> = {}): MatchEvent => ({
  league_id: L, id, match_id, player_id, team_id, event_type, related_event_id: null, minute: 1, elapsed_seconds: 60,
  suspension_minutes: null, suspension_started_at: null, suspension_ended_at: null, period: 1, created_at: '2026-09-20T18:01:00Z', ...extra,
})

export const players: Player[] = [
  player('p1', 'Ali', 'GK', 5),
  player('p2', 'Omar', 'ATT', 4),
  player('p3', 'Sami', 'MID', 3),
  player('p4', 'Zaid', 'DEF', 3),
  player('p5', 'Hadi', 'ATT', 4),
  player('p6', 'Nour', 'MID', 2),
  player('p7', 'Retired', 'DEF', 3, { is_active: false }),
  player('px', 'Stranger', 'ATT', 5, { league_id: 'L2' }),
]

export const session: Session = { league_id: L, id: 's1', date: '2026-09-20', status: 'completed', share_token: 'tok1', created_at: '2026-09-20T17:00:00Z', team_count: 3, team_size: 5, ...DEFAULT_FORMAT }

export const teams: Team[] = [team('tg', 's1', 'green'), team('tb', 's1', 'blue'), team('ty', 's1', 'yellow')]

export const teamPlayers: TeamPlayer[] = [
  ['tg', 'p1'], ['tg', 'p2'], ['tb', 'p3'], ['tb', 'p4'], ['ty', 'p5'], ['ty', 'p6'],
].map(([team_id, player_id]) => ({ league_id: L, team_id, player_id }))

// Match 1: Green beat Blue 2–0 (Omar twice, Ali assisting the first). Match 2: Yellow beat Green 1–0 (Hadi).
export const matches: Match[] = [
  match('m1', { status: 'completed', team1_score: 2, team2_score: 0, winner_team_id: 'tg', timer_elapsed_seconds: 600 }),
  match('m2', { match_number: 2, team1_id: 'tg', team2_id: 'ty', waiting_team_id: 'tb', queue: ['tb'], status: 'completed', team1_score: 0, team2_score: 1, winner_team_id: 'ty', timer_elapsed_seconds: 600 }),
]

export const events: MatchEvent[] = [
  event('e1', 'm1', 'p2', 'tg', 'goal', { minute: 0, elapsed_seconds: 45 }),
  event('e2', 'm1', 'p1', 'tg', 'assist', { related_event_id: 'e1', minute: 0, elapsed_seconds: 45 }),
  event('e3', 'm1', 'p2', 'tg', 'goal', { minute: 5, elapsed_seconds: 300 }),
  event('e4', 'm2', 'p5', 'ty', 'goal', { minute: 7, elapsed_seconds: 420 }),
]

// Everything above, keyed by table name, ready for resetDb()
export const finishedLeague = () => ({
  players, sessions: [session], teams, team_players: teamPlayers, matches, match_events: events, session_awards: [],
})
