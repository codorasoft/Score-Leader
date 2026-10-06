import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'
import { resetDb, rows } from '../../test/fakeSupabase'
import { finishedLeague, players, session, team, teamPlayers, teams } from '../../test/fixtures'

vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)

import SessionDetailPage from './SessionDetailPage'

function MatchStub() {
  const { matchId } = useParams()
  return <p>tracker {matchId}</p>
}

const renderPage = () => render(
  <MemoryRouter initialEntries={['/admin/eagles/sessions/s1']}><InLeague>
    <Routes>
      <Route path="/admin/eagles/sessions/:sessionId" element={<SessionDetailPage />} />
      <Route path="/admin/eagles/sessions/:sessionId/match/:matchId" element={<MatchStub />} />
    </Routes>
  </InLeague></MemoryRouter>,
)

const newMatch = () => rows('matches').find((m) => m.status === 'pending')!

it('an under-way session whose matches were all deleted shows its teams and starts match 1 again', async () => {
  resetDb({ players, teams, team_players: teamPlayers, sessions: [{ ...session, status: 'active' }], matches: [] })
  const user = userEvent.setup()
  renderPage()
  expect(await screen.findByText(/No match is set up/)).toBeInTheDocument()
  for (const name of ['Ali', 'Omar', 'Sami', 'Zaid', 'Hadi', 'Nour']) expect(screen.getByText(name)).toBeInTheDocument()

  // Green and Blue play first, so Yellow waits
  await user.click(screen.getByRole('button', { name: 'Green Team' }))
  await user.click(screen.getByRole('button', { name: 'Blue Team' }))
  await user.click(screen.getByRole('button', { name: 'Start match 1' }))

  await waitFor(() => expect(screen.getByText(/^tracker/)).toBeInTheDocument())
  expect(newMatch()).toMatchObject({ session_id: 's1', match_number: 1, waiting_team_id: 'ty' })
  expect(screen.getByText(`tracker ${newMatch().id}`)).toBeInTheDocument()
})

it('carries the rotation on when the upcoming match was deleted', async () => {
  resetDb({ ...finishedLeague(), sessions: [{ ...session, status: 'active' }] })
  const user = userEvent.setup()
  renderPage()
  // Match 2: Yellow beat Green, Blue waited -> match 3 is Yellow v Blue, Green waits
  await user.click(await screen.findByRole('button', { name: 'Start match 3' }))
  await waitFor(() => expect(screen.getByText(/^tracker/)).toBeInTheDocument())
  expect(newMatch()).toMatchObject({ match_number: 3, team1_id: 'ty', team2_id: 'tb', waiting_team_id: 'tg' })
})

it('offers nothing to start once the session is finished', async () => {
  resetDb(finishedLeague())
  renderPage()
  expect(await screen.findByText('Match #2')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Start match/ })).not.toBeInTheDocument()
})

it('four teams with all matches deleted: pick two to start, the other two queue', async () => {
  resetDb({ players, teams: [...teams, team('to', 's1', 'orange')], team_players: teamPlayers, sessions: [{ ...session, status: 'active', team_count: 4 }], matches: [] })
  const user = userEvent.setup()
  renderPage()
  await user.click(await screen.findByRole('button', { name: 'Blue Team' }))
  await user.click(screen.getByRole('button', { name: 'Orange Team' }))
  await user.click(screen.getByRole('button', { name: 'Start match 1' }))
  await waitFor(() => expect(screen.getByText(/^tracker/)).toBeInTheDocument())
  expect([newMatch().team1_id, newMatch().team2_id].sort()).toEqual(['tb', 'to'])
  expect(newMatch()).toMatchObject({ queue: ['tg', 'ty'], waiting_team_id: 'tg' })
})
