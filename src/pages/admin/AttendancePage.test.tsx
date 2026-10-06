import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'
import { db, resetDb, rows } from '../../test/fakeSupabase'
import { players, session } from '../../test/fixtures'

vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)

import AttendancePage from './AttendancePage'

const renderPage = () => render(
  <MemoryRouter initialEntries={['/admin/eagles/sessions/s9/players']}><InLeague>
    <Routes>
      <Route path="/admin/eagles/sessions/:sessionId/players" element={<AttendancePage />} />
      <Route path="/admin/eagles/sessions/:sessionId/teams" element={<p>team builder</p>} />
      <Route path="/admin/eagles/history" element={<p>history page</p>} />
    </Routes>
  </InLeague></MemoryRouter>,
)

// A 2 × 3 session: up to 6 players, at least one per team
beforeEach(() => resetDb({ players, sessions: [{ ...session, id: 's9', status: 'draft', team_count: 2, team_size: 3 }] }))

it("shows the session's setup and only this league's active players", async () => {
  renderPage()
  expect(await screen.findByText(/2 teams × 3 players/)).toBeInTheDocument()
  expect(await screen.findByText('Omar')).toBeInTheDocument()
  expect(screen.queryByText('Retired')).not.toBeInTheDocument()
  expect(screen.queryByText('Stranger')).not.toBeInTheDocument()
  expect(screen.getByText('0 / 6')).toBeInTheDocument()
})

it('allows at most teams × players and needs one player per team', async () => {
  const user = userEvent.setup()
  renderPage()
  const confirm = await screen.findByRole('button', { name: 'Confirm Attendance' })
  await user.click(await screen.findByText('Ali'))
  expect(confirm).toBeDisabled()
  for (const name of ['Omar', 'Sami', 'Zaid', 'Hadi', 'Nour']) await user.click(screen.getByText(name))
  expect(screen.getByText('6 / 6')).toBeInTheDocument()
  expect(confirm).toBeEnabled()
})

it('saves the players and goes on to the team builder', async () => {
  const user = userEvent.setup()
  renderPage()
  await user.click(await screen.findByText('Ali'))
  await user.click(screen.getByText('Hadi'))
  await user.click(screen.getByRole('button', { name: 'Confirm Attendance' }))
  await waitFor(() => expect(screen.getByText('team builder')).toBeInTheDocument())
  expect(rows('session_players').map((r) => r.player_id).sort()).toEqual(['p1', 'p5'])
  expect(rows('session_players').every((r) => r.session_id === 's9')).toBe(true)
})

it('coming back to change attendance shows the saved players and replaces them', async () => {
  rows('session_players').push({ league_id: 'L1', session_id: 's9', player_id: 'p1' }, { league_id: 'L1', session_id: 's9', player_id: 'p2' })
  const user = userEvent.setup()
  renderPage()
  expect(await screen.findByText('2 / 6')).toBeInTheDocument()
  await user.click(screen.getByText('Omar'))
  await user.click(screen.getByText('Hadi'))
  await user.click(screen.getByRole('button', { name: 'Confirm Attendance' }))
  await waitFor(() => expect(screen.getByText('team builder')).toBeInTheDocument())
  expect(rows('session_players').filter((r) => r.session_id === 's9').map((r) => r.player_id).sort()).toEqual(['p1', 'p5'])
})

it('says so and stays when the players cannot be saved', async () => {
  const user = userEvent.setup()
  renderPage()
  await user.click(await screen.findByText('Ali'))
  await user.click(screen.getByText('Hadi'))
  db.errors.session_players = { message: 'Failed to fetch' }
  await user.click(screen.getByRole('button', { name: 'Confirm Attendance' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.')
  expect(screen.queryByText('team builder')).not.toBeInTheDocument()
})

it("goes to history for an unknown or another league's session", async () => {
  rows('sessions')[0].league_id = 'L2'
  renderPage()
  expect(await screen.findByText('history page')).toBeInTheDocument()
})

it('describes the setup with Arabic plurals', async () => {
  const { inArabic } = await import('../../test/arabic')
  rows('sessions')[0].team_size = 11
  await inArabic(async () => {
    renderPage()
    expect(await screen.findByText(/فريقان × 11 لاعباً/)).toBeInTheDocument()
  })
})

it('describes the setup in English', async () => {
  rows('sessions')[0].team_size = 11
  renderPage()
  expect(await screen.findByText(/2 teams × 11 players/)).toBeInTheDocument()
})
