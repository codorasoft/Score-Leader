import { buildPlayerHistory } from './playerHistory'
import type { Match, MatchEvent, Session, SessionAward, Team } from '../lib/types'

const session = (id: string, date: string): Session => ({ id, date, status: 'completed', share_token: id, created_at: '' })
const team = (id: string, session_id: string, color: Team['color'] = 'red'): Team => ({ id, session_id, color, name: null })
const match = (o: Partial<Match>): Match => ({
  id: 'm', session_id: 's1', match_number: 1, team1_id: 't1', team2_id: 'tx', waiting_team_id: 'ty',
  status: 'completed', team1_score: 1, team2_score: 0, winner_team_id: 't1', is_draw: false, draw_resolved_by: null,
  timer_started_at: null, timer_elapsed_seconds: 0, timer_status: 'stopped', created_at: '', ...o,
})
const event = (match_id: string, event_type: MatchEvent['event_type']): MatchEvent => ({
  id: `${match_id}-${event_type}-${Math.random()}`, match_id, player_id: 'p1', team_id: 't1', event_type,
  related_event_id: null, minute: null, suspension_minutes: null, suspension_started_at: null, suspension_ended_at: null, created_at: '',
})
const award = (session_id: string, award_type: SessionAward['award_type']): SessionAward => ({
  id: `${session_id}-${award_type}`, session_id, award_type, winner_player_id: 'p1', decided_by: 'auto_stat', is_tied: false,
})

const input = {
  position: 'ATT' as const,
  sessions: [session('s2', '2026-09-27'), session('s1', '2026-09-20')],
  teams: [team('t1', 's1', 'red'), team('t2', 's2', 'blue')],
  matches: [
    match({ id: 'm1', session_id: 's1', team1_id: 't1', winner_team_id: 't1' }),
    match({ id: 'm2', session_id: 's1', team1_id: 'tx', team2_id: 't1', team1_score: 1, team2_score: 1, is_draw: true, winner_team_id: 'tx' }),
    match({ id: 'm3', session_id: 's1', team1_id: 'tx', team2_id: 'ty', winner_team_id: 'tx' }),
    match({ id: 'm4', session_id: 's2', team1_id: 't2', team2_id: 'tx', team1_score: 0, team2_score: 3, winner_team_id: 'tx' }),
  ],
  events: [event('m1', 'goal'), event('m2', 'goal'), event('m2', 'assist'), event('m4', 'yellow_card')],
  awards: [award('s1', 'best_goalscorer'), award('s1', 'mvp'), award('s2', 'mvp')],
}

it('builds one row per session, oldest first, with that session\'s team and results', () => {
  const { sessions } = buildPlayerHistory(input)
  expect(sessions.map((s) => s.date)).toEqual(['2026-09-20', '2026-09-27'])
  expect(sessions[0]).toMatchObject({
    teamColor: 'red', played: 2, wins: 1, draws: 1, losses: 0, goals: 2, assists: 1, yellowCards: 0,
    awards: ['best_goalscorer', 'mvp'],
  })
  expect(sessions[1]).toMatchObject({ teamColor: 'blue', played: 1, wins: 0, draws: 0, losses: 1, yellowCards: 1 })
})

it('sums career totals and counts awards by type', () => {
  const { totals, awardCounts } = buildPlayerHistory(input)
  expect(totals).toMatchObject({ sessions: 2, played: 3, wins: 1, draws: 1, losses: 1, goals: 2, assists: 1, yellowCards: 1 })
  expect(awardCounts).toEqual({ best_goalscorer: 1, mvp: 2 })
})

it('counts clean sheets only for goalkeepers', () => {
  expect(buildPlayerHistory(input).totals.cleanSheets).toBe(0)
  expect(buildPlayerHistory({ ...input, position: 'GK' }).totals.cleanSheets).toBe(1)
})
