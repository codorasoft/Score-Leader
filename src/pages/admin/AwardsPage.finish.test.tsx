import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'
import { db, resetDb, rows } from '../../test/fakeSupabase'
import { matches, player, players, session, teamPlayers, teams } from '../../test/fixtures'

vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)

import AwardsPage from './AwardsPage'

// Session s1 is under way with Omar, Sami and Zaid; no matches yet, so no automatic awards
beforeEach(() => {
  resetDb({
    players,
    sessions: [{ ...session, status: 'active' }],
    session_players: ['p2', 'p3', 'p4'].map((player_id) => ({ league_id: 'L1', session_id: 's1', player_id })),
    matches: [], teams: [], team_players: [], match_events: [],
  })
})

const renderPage = () => render(
  <MemoryRouter initialEntries={['/admin/eagles/sessions/s1/awards']}><InLeague features={['awards', 'voting']}>
    <Routes>
      <Route path="/admin/eagles/sessions/:sessionId/awards" element={<AwardsPage />} />
      <Route path="/admin/eagles/history" element={<p>history page</p>} />
    </Routes>
  </InLeague></MemoryRouter>,
)

// The first award section (MVP)
const mvp = () => screen.getByRole('heading', { name: 'MVP' }).parentElement!

it('saves the awards and closes the session in one call, then goes to History', async () => {
  const user = userEvent.setup()
  renderPage()
  await screen.findAllByText('Omar')
  await user.click(within(mvp()).getByRole('button', { name: /Omar/ }))
  await user.click(screen.getByRole('button', { name: 'Finish Session' }))

  expect(await screen.findByText('history page')).toBeInTheDocument()
  expect(db.rpcs.map((c) => c.fn)).toEqual(['finish_awards'])
  expect(rows('session_awards')).toMatchObject([{ session_id: 's1', award_type: 'mvp', winner_player_id: 'p2', decided_by: 'admin_direct' }])
  expect(rows('sessions')[0].status).toBe('completed')
})

it('shows the links of the votes it opened', async () => {
  const user = userEvent.setup()
  renderPage()
  await screen.findAllByText('Omar')
  await user.click(within(mvp()).getByRole('button', { name: 'Open vote' }))
  await user.click(within(mvp()).getByRole('button', { name: /Omar/ }))
  await user.click(within(mvp()).getByRole('button', { name: /Sami/ }))
  await user.click(screen.getByRole('button', { name: 'Finish Session' }))

  const token = rows('award_votes')[0].vote_token as string
  expect(await screen.findByText(new RegExp(`/s/vote/${token}$`))).toBeInTheDocument()
  expect(rows('award_vote_nominations').map((n) => n.player_id)).toEqual(['p2', 'p3'])
})

it('a finish that cannot be saved says so, keeps the session open and can be tapped again', async () => {
  db.rpcResults.finish_awards = { data: null, error: { message: 'Failed to fetch' } }
  const user = userEvent.setup()
  renderPage()
  await screen.findAllByText('Omar')
  await user.click(screen.getByRole('button', { name: 'Finish Session' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not finish the session')
  expect(rows('sessions')[0].status).toBe('active')
  expect(screen.queryByText('history page')).toBeNull()

  delete db.rpcResults.finish_awards
  await user.click(screen.getByRole('button', { name: 'Finish Session' }))
  expect(await screen.findByText('history page')).toBeInTheDocument()
  await waitFor(() => expect(rows('sessions')[0].status).toBe('completed'))
})

it('gives best goalkeeper to the keeper who let in the fewest goals, with no pick or vote', async () => {
  // Ali keeps for Green (let in 1 over two matches), Karim for Blue (let in 2)
  resetDb({
    players: [...players, player('p8', 'Karim', 'GK', 3)],
    sessions: [{ ...session, status: 'active' }],
    session_players: ['p1', 'p2', 'p3', 'p8'].map((player_id) => ({ league_id: 'L1', session_id: 's1', player_id })),
    matches, teams, match_events: [],
    team_players: [...teamPlayers, { league_id: 'L1', team_id: 'tb', player_id: 'p8' }],
  })
  const user = userEvent.setup()
  renderPage()

  expect(await screen.findByText('Ali · Goals conceded: 1')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Best Goalkeeper' })).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Finish Session' }))

  expect(await screen.findByText('history page')).toBeInTheDocument()
  expect(rows('session_awards').filter((a) => a.award_type === 'best_goalkeeper'))
    .toMatchObject([{ winner_player_id: 'p1', decided_by: 'auto_stat', is_tied: false }])
  expect(rows('award_votes')).toEqual([])
})
