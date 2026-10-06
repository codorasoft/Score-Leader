import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'
import { resetDb, rows } from '../../test/fakeSupabase'
import { match, players, session, teamPlayers, teams } from '../../test/fixtures'
import { FEATURES } from '../../lib/features'

vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)

import MatchTrackerPage from './MatchTrackerPage'

// Session s1 is under way: match 1, Green v Blue with Yellow waiting, not started yet
beforeEach(() => {
  localStorage.clear()
  resetDb({
    players, teams, team_players: teamPlayers,
    sessions: [{ ...session, status: 'active' }],
    matches: [match('m1')],
    match_events: [],
  })
})

// Match 1 is the page under test; any other match id is where "Continue" leads
function MatchRoute() {
  const { matchId } = useParams()
  return matchId === 'm1' ? <MatchTrackerPage /> : <p>next match {matchId}</p>
}

const renderPage = (features = FEATURES) => render(
  <MemoryRouter initialEntries={['/admin/eagles/sessions/s1/match/m1']}><InLeague features={features}>
    <Routes>
      <Route path="/admin/eagles/sessions/:sessionId/match/:matchId" element={<MatchRoute />} />
      <Route path="/admin/eagles/sessions/:sessionId/awards" element={<p>awards page</p>} />
    </Routes>
  </InLeague></MemoryRouter>,
)

const m1 = () => rows('matches').find((m) => m.id === 'm1')!
const score = () => screen.getAllByText(/^\d+$/).map((el) => el.textContent)

it('shows who is playing and who waits, and blocks goals until the clock starts', async () => {
  renderPage()
  expect(await screen.findByText('Green Team')).toBeInTheDocument()
  expect(screen.getByText('Blue Team')).toBeInTheDocument()
  expect(screen.getByText(/Waiting/).textContent).toContain('Yellow Team')
  // The clock state catches up with the loaded match one render later
  await waitFor(() => expect(screen.getByRole('button', { name: '⚽ Goal' })).toBeDisabled())
  expect(screen.getByText('Press Start to record goals and cards')).toBeInTheDocument()
})

it('starts the clock and records a goal with an assist', async () => {
  const user = userEvent.setup()
  renderPage()
  await user.click(await screen.findByRole('button', { name: '▶ Start' }))
  await waitFor(() => expect(m1()).toMatchObject({ timer_status: 'running', status: 'active' }))

  await user.click(screen.getByRole('button', { name: '⚽ Goal' }))
  expect(screen.getByRole('heading', { name: 'Who scored?' })).toBeInTheDocument()
  // Only the two playing teams can score
  expect(screen.queryByRole('button', { name: 'Hadi' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Omar' }))
  await user.click(screen.getByRole('button', { name: 'Ali' }))
  await user.click(screen.getByRole('button', { name: 'Confirm' }))

  await waitFor(() => expect(m1().team1_score).toBe(1))
  const goal = rows('match_events').find((e) => e.event_type === 'goal')!
  expect(goal).toMatchObject({ match_id: 'm1', player_id: 'p2', team_id: 'tg' })
  expect(rows('match_events').find((e) => e.event_type === 'assist')).toMatchObject({ player_id: 'p1', related_event_id: goal.id })
  expect(score().slice(0, 2)).toEqual(['1', '0'])
})

it('undoes the last goal', async () => {
  const user = userEvent.setup()
  renderPage()
  await user.click(await screen.findByRole('button', { name: '▶ Start' }))
  await user.click(screen.getByRole('button', { name: '⚽ Goal' }))
  await user.click(screen.getByRole('button', { name: 'Sami' }))
  await user.click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(m1().team2_score).toBe(1))

  await user.click(screen.getByRole('button', { name: /Undo.*Sami/ }))
  await user.click(screen.getByRole('button', { name: 'Yes, undo' }))
  await waitFor(() => expect(m1().team2_score).toBe(0))
  expect(rows('match_events')).toEqual([])
})

it('ending early asks first, then saves the result and sets up the next match', async () => {
  rows('matches')[0].team1_score = 1
  const user = userEvent.setup()
  renderPage()
  await user.click(await screen.findByRole('button', { name: 'End Match' }))
  expect(screen.getByRole('heading', { name: 'End match early?' })).toBeInTheDocument()
  expect(m1().status).toBe('pending')
  await user.click(screen.getByRole('button', { name: 'Yes, end it' }))

  expect(await screen.findByRole('heading', { name: 'Green Team wins!' })).toBeInTheDocument()
  expect(m1()).toMatchObject({ status: 'completed', winner_team_id: 'tg' })
  // Winner stays on, loser goes off to wait, the waiting team comes on
  const next = rows('matches').find((m) => m.match_number === 2)!
  expect(next).toMatchObject({ session_id: 's1', team1_id: 'tg', team2_id: 'ty', waiting_team_id: 'tb', status: 'pending' })

  await user.click(screen.getByRole('button', { name: 'Continue' }))
  expect(await screen.findByText(`next match ${next.id}`)).toBeInTheDocument()
})

it('a draw in match 1 goes to penalties', async () => {
  const user = userEvent.setup()
  renderPage()
  await user.click(await screen.findByRole('button', { name: 'End Match' }))
  await user.click(screen.getByRole('button', { name: 'Yes, end it' }))
  expect(await screen.findByRole('heading', { name: 'Penalty Shootout' })).toBeInTheDocument()

  const confirm = screen.getByRole('button', { name: 'Confirm Penalty Result' })
  expect(confirm).toBeDisabled()
  const [, blueUp] = screen.getAllByRole('button', { name: '+' }).slice(0, 2)
  await user.click(blueUp)
  await user.click(confirm)

  await waitFor(() => expect(m1()).toMatchObject({ status: 'completed', is_draw: true, draw_resolved_by: 'penalties', winner_team_id: 'tb' }))
  expect(await screen.findByRole('heading', { name: 'Blue Team wins!' })).toBeInTheDocument()
})

it('hides card and swap buttons when those features are off', async () => {
  renderPage(FEATURES.filter((f) => f !== 'cards' && f !== 'swaps'))
  expect(await screen.findByRole('button', { name: '⚽ Goal' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '🟨 Card' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '↔ Swap' })).not.toBeInTheDocument()
})
