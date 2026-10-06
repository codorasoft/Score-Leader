import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'
import { resetDb, rows } from '../../test/fakeSupabase'
import { finishedLeague } from '../../test/fixtures'
import { FEATURES } from '../../lib/features'

vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)

import TeamBuilderPage from './TeamBuilderPage'

const attending = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']

beforeEach(() => {
  localStorage.clear()
  const league = finishedLeague()
  resetDb({
    ...league,
    sessions: [...league.sessions, { league_id: 'L1', id: 's2', date: '2026-10-06', status: 'draft', share_token: 'tok2', created_at: '2026-10-06T17:00:00Z' }],
    session_players: attending.map((player_id) => ({ league_id: 'L1', session_id: 's2', player_id })),
  })
})

function MatchStub() {
  const { matchId } = useParams()
  return <p>match page {matchId}</p>
}

const renderPage = (features = FEATURES) => render(
  <MemoryRouter initialEntries={['/admin/eagles/sessions/s2/teams']}><InLeague features={features}>
    <Routes>
      <Route path="/admin/eagles/sessions/:sessionId/teams" element={<TeamBuilderPage />} />
      <Route path="/admin/eagles/sessions/:sessionId/match/:matchId" element={<MatchStub />} />
    </Routes>
  </InLeague></MemoryRouter>,
)

it('splits the attending players into three teams of two', async () => {
  renderPage()
  await waitFor(() => expect(screen.getAllByText(/^2 players/)).toHaveLength(3))
  for (const name of ['Ali', 'Omar', 'Sami', 'Zaid', 'Hadi', 'Nour']) expect(screen.getByText(name)).toBeInTheDocument()
  expect(screen.queryByText('Retired')).not.toBeInTheDocument()
  // Only Ali is a keeper
  expect(screen.getByText(/Fewer than 3 goalkeepers/)).toBeInTheDocument()
})

it('saves the teams, starts the session and opens match 1 with the chosen team waiting', async () => {
  const user = userEvent.setup()
  renderPage()
  await waitFor(() => expect(screen.getAllByText(/^2 players/)).toHaveLength(3))
  await user.click(screen.getByRole('button', { name: /Blue Team waits/ }))
  await user.click(screen.getByRole('button', { name: 'Confirm Teams & Start' }))

  const created = rows('teams').filter((t) => t.session_id === 's2')
  await waitFor(() => expect(screen.getByText(/^match page/)).toBeInTheDocument())
  expect(created.map((t) => t.color).sort()).toEqual(['blue', 'green', 'yellow'])
  const createdIds = created.map((t) => t.id)
  const placed = rows('team_players').filter((tp) => createdIds.includes(tp.team_id))
  expect(placed.map((tp) => tp.player_id).sort()).toEqual(attending)

  expect(rows('sessions').find((s) => s.id === 's2')?.status).toBe('active')
  const first = rows('matches').find((m) => m.session_id === 's2')!
  const blue = created.find((t) => t.color === 'blue')!
  expect(first).toMatchObject({ match_number: 1, status: 'pending', waiting_team_id: blue.id })
  expect([first.team1_id, first.team2_id]).not.toContain(blue.id)
  expect(screen.getByText(`match page ${first.id}`)).toBeInTheDocument()
})

it('offers the stars/form slider only with smart balancing', async () => {
  const { unmount } = renderPage()
  expect(await screen.findByLabelText('Balance teams by')).toBeInTheDocument()
  unmount()
  renderPage(FEATURES.filter((f) => f !== 'smart_balancing'))
  await waitFor(() => expect(screen.getAllByText(/^2 players/)).toHaveLength(3))
  expect(screen.queryByLabelText('Balance teams by')).not.toBeInTheDocument()
  expect(screen.queryByText(/Split duos/)).not.toBeInTheDocument()
})
