import { render, screen } from '@testing-library/react'
import { InLeague } from '../test/league'
import { MatchTimeline } from './MatchTimeline'
import type { MatchEvent, Player, Team } from '../lib/types'

const teams = [
  { id: 't1', color: 'green' }, { id: 't2', color: 'blue' },
] as unknown as Team[]
const players = [
  { id: 'a', name: 'Ali' }, { id: 'b', name: 'Omar' }, { id: 'c', name: 'Sami' },
] as unknown as Player[]
const ev = (o: Partial<MatchEvent>) => ({
  match_id: 'm', team_id: 't1', related_event_id: null, assist_player_id: null, suspension_minutes: null,
  suspension_ended_at: null, match_clock_seconds: 10, created_at: '2026-01-01T00:00:00Z', ...o,
}) as unknown as MatchEvent
const events = [
  ev({ id: 'e1', event_type: 'goal', player_id: 'a' }),
  ev({ id: 'e2', event_type: 'yellow_card', player_id: 'b', created_at: '2026-01-01T00:01:00Z' }),
  ev({ id: 'e3', event_type: 'swap', player_id: 'b', team_id: 't1', created_at: '2026-01-01T00:02:00Z' }),
  ev({ id: 'e4', event_type: 'swap', player_id: 'c', team_id: 't2', related_event_id: 'e3', created_at: '2026-01-01T00:02:00Z' }),
]

it('hides card and swap events when those features are off', () => {
  render(<InLeague features={['awards']}><MatchTimeline events={events} teams={teams} players={players} /></InLeague>)
  expect(screen.getByText('Ali')).toBeInTheDocument()
  expect(screen.queryByText(/Omar/)).not.toBeInTheDocument()
  expect(screen.queryByText(/Sami/)).not.toBeInTheDocument()
  expect(screen.queryByText(/↔/)).not.toBeInTheDocument()
})

it('shows card events when cards is on', () => {
  render(<InLeague features={['cards']}><MatchTimeline events={events} teams={teams} players={players} /></InLeague>)
  expect(screen.getByText(/Omar/)).toBeInTheDocument()
  expect(screen.queryByText(/Sami/)).not.toBeInTheDocument()
})
