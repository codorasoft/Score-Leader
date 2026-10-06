export type PlayerPosition = 'GK' | 'DEF' | 'MID' | 'ATT'
export type TeamColor = 'green' | 'blue' | 'yellow' | 'orange' | 'purple' | 'white'
export type SessionStatus = 'draft' | 'active' | 'completed'
export type MatchStatus = 'pending' | 'active' | 'completed'
export type TimerStatus = 'running' | 'paused' | 'stopped'
export type EventType = 'goal' | 'assist' | 'yellow_card' | 'red_card' | 'penalty_goal' | 'swap'
export type AwardType = 'mvp' | 'best_goalkeeper' | 'best_assister' | 'best_goalscorer' | 'fair_play'
export type AwardDecidedBy = 'auto_stat' | 'admin_direct' | 'vote'

export interface Player {
  league_id: string
  id: string
  name: string
  position: PlayerPosition
  skill_rating: number
  photo_url: string | null
  is_active: boolean
  created_at: string
}

export interface Session {
  league_id: string
  id: string
  date: string
  status: SessionStatus
  share_token: string
  created_at: string
  // How many teams play and how many players each has (2–6 teams of 3–11)
  team_count: number
  team_size: number
}

export interface Team {
  league_id: string
  id: string
  session_id: string
  color: TeamColor
  name: string | null
}

export interface Match {
  league_id: string
  id: string
  session_id: string
  match_number: number
  team1_id: string
  team2_id: string
  // First team in `queue`, or null when nobody waits (2-team sessions)
  waiting_team_id: string | null
  // Teams waiting to come on, in order; the winner stays and the loser joins the back
  queue: string[]
  status: MatchStatus
  team1_score: number
  team2_score: number
  winner_team_id: string | null
  is_draw: boolean
  draw_resolved_by: 'penalties' | 'late_team' | null
  timer_started_at: string | null
  timer_elapsed_seconds: number
  timer_status: TimerStatus
  created_at: string
}

export interface MatchEvent {
  league_id: string
  id: string
  match_id: string
  player_id: string
  team_id: string
  event_type: EventType
  related_event_id: string | null
  minute: number | null
  elapsed_seconds: number | null
  suspension_minutes: number | null
  suspension_started_at: string | null
  suspension_ended_at: string | null
  created_at: string
}

export interface AwardVote {
  league_id: string
  id: string
  session_id: string
  award_type: 'mvp' | 'fair_play' | 'best_goalkeeper'
  status: 'open' | 'closed'
  winner_player_id: string | null
  decided_by: 'admin_direct' | 'vote'
  vote_token: string
  created_at: string
}

export interface AwardVoteNomination {
  league_id: string
  award_vote_id: string
  player_id: string
}

export interface AwardVoteEntry {
  league_id: string
  id: string
  award_vote_id: string
  voter_fingerprint: string
  player_id: string
  created_at: string
}

export interface SessionAward {
  league_id: string
  id: string
  session_id: string
  award_type: AwardType
  winner_player_id: string
  decided_by: AwardDecidedBy
  is_tied: boolean
}

export interface TeamPlayer {
  league_id: string
  team_id: string
  player_id: string
}
