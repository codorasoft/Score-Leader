import { render, screen, within } from '@testing-library/react'
import { SessionStandings } from './SessionStandings'
import type { Match, Team } from '../lib/types'

const teams: Team[] = (['green', 'blue', 'yellow'] as const).map((color) => ({ id: color, session_id: 's', color, name: null }))
const match = (id: string, team1_id: string, team2_id: string, team1_score: number, team2_score: number): Match => ({
  id, session_id: 's', match_number: 1, team1_id, team2_id, waiting_team_id: 'x', status: 'completed',
  team1_score, team2_score, is_draw: team1_score === team2_score, winner_team_id: team1_id, draw_resolved_by: null,
  timer_started_at: null, timer_elapsed_seconds: 0, timer_status: 'paused', created_at: '',
})

it('lists teams best first with medals, win counts and records', () => {
  render(<SessionStandings teams={teams} matches={[match('a', 'yellow', 'blue', 2, 0), match('b', 'yellow', 'green', 1, 0), match('c', 'blue', 'green', 2, 1)]} />)
  const items = screen.getAllByRole('listitem')
  expect(items.map((li) => within(li).getByText(/Team$/).textContent)).toEqual(['Yellow Team', 'Blue Team', 'Green Team'])
  expect(within(items[0]).getByLabelText('Rank 1')).toHaveTextContent('🥇')
  expect(within(items[0]).getByText('wins')).toBeInTheDocument()
  expect(within(items[0]).getByText(/2W · 0D · 0L/)).toBeInTheDocument()
  expect(within(items[1]).getByText('win')).toBeInTheDocument()
  expect(within(items[2]).getByText(/Goals 1–3/)).toBeInTheDocument()
})

it('renders nothing before any match has finished', () => {
  const { container } = render(<SessionStandings teams={teams} matches={[]} />)
  expect(container).toBeEmptyDOMElement()
})

it('lists every team of a four-team session, best first', () => {
  const four: Team[] = (['green', 'blue', 'yellow', 'orange'] as const).map((color) => ({ id: color, session_id: 's', color, name: null }) as Team)
  render(<SessionStandings teams={four} matches={[match('a', 'orange', 'green', 2, 0), match('b', 'orange', 'blue', 1, 0), match('c', 'yellow', 'orange', 0, 0)]} />)
  const names = screen.getAllByRole('listitem').map((li) => within(li).getByText(/Team$/).textContent)
  expect(names).toHaveLength(4)
  expect(names[0]).toBe('Orange Team')
  expect(names).toEqual(expect.arrayContaining(['Green Team', 'Blue Team', 'Yellow Team', 'Orange Team']))
})
