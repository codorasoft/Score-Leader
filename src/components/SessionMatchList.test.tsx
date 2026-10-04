import { render, screen, fireEvent } from '@testing-library/react'
import { SessionMatchList } from './SessionMatchList'
import type { Match, MatchEvent, Player, Team } from '../lib/types'

const teams: Team[] = [
  { id: 'red', session_id: 's', color: 'red', name: null },
  { id: 'blue', session_id: 's', color: 'blue', name: null },
  { id: 'yellow', session_id: 's', color: 'yellow', name: null },
]
const players = ['Ali', 'Omar', 'Sami'].map((name) => ({ id: name, name }) as Player)
const match = (o: Partial<Match>): Match => ({
  id: 'm', session_id: 's', match_number: 1, team1_id: 'red', team2_id: 'blue', waiting_team_id: 'yellow',
  status: 'completed', team1_score: 1, team2_score: 0, winner_team_id: 'red', is_draw: false, draw_resolved_by: null,
  timer_started_at: null, timer_elapsed_seconds: 0, timer_status: 'paused', created_at: '', ...o,
})
const ev = (o: Partial<MatchEvent> & Pick<MatchEvent, 'id' | 'match_id' | 'event_type' | 'player_id' | 'team_id'>): MatchEvent => ({
  related_event_id: null, minute: null, elapsed_seconds: null, suspension_minutes: null,
  suspension_started_at: null, suspension_ended_at: null, created_at: `2026-10-04T10:00:0${o.id.length}Z`, ...o,
})

const matches = [
  match({ id: 'm1', match_number: 1 }),
  match({ id: 'm2', match_number: 2, team1_id: 'red', team2_id: 'yellow', waiting_team_id: 'blue', team1_score: 0, team2_score: 0, is_draw: true, draw_resolved_by: 'late_team', winner_team_id: 'yellow' }),
  match({ id: 'm3', match_number: 3, status: 'pending' }),
]
const events = [
  ev({ id: 'g', match_id: 'm1', event_type: 'goal', player_id: 'Ali', team_id: 'red', elapsed_seconds: 95 }),
  ev({ id: 's1', match_id: 'm2', event_type: 'swap', player_id: 'Omar', team_id: 'yellow', elapsed_seconds: 30 }),
  ev({ id: 's22', match_id: 'm2', event_type: 'swap', player_id: 'Sami', team_id: 'blue', related_event_id: 's1', elapsed_seconds: 30 }),
]

it('highlights the newest finished match with its timeline open and ignores unfinished matches', () => {
  render(<SessionMatchList matches={matches} events={events} teams={teams} players={players} />)
  expect(screen.getByText('Draw · Yellow Team wins')).toBeInTheDocument()
  expect(screen.getByText('Omar: Blue Team → Yellow Team · Sami: Yellow Team → Blue Team')).toBeInTheDocument()
  expect(screen.queryByText('#3')).not.toBeInTheDocument()
  expect(screen.queryByText('Ali')).not.toBeInTheDocument()
})

it('expands an earlier match to show its timeline with the logged time', () => {
  render(<SessionMatchList matches={matches} events={events} teams={teams} players={players} />)
  fireEvent.click(screen.getByText('Red Team wins'))
  expect(screen.getByText('Ali')).toBeInTheDocument()
  expect(screen.getByText('01:35')).toBeInTheDocument()
})
