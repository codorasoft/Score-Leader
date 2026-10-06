import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'
import { db, resetDb } from '../../test/fakeSupabase'
import { event, finishedLeague, match, session } from '../../test/fixtures'

vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)

import LiveSessionPage from './LiveSessionPage'

const renderPage = () => render(
  <MemoryRouter initialEntries={['/s/tok1']}><InLeague>
    <Routes><Route path="/s/:token" element={<LiveSessionPage />} /></Routes>
  </InLeague></MemoryRouter>,
)

it('shows the match being played: clock, score, waiting team and goals', async () => {
  const league = finishedLeague()
  resetDb({
    ...league,
    sessions: [{ ...session, status: 'active' }],
    matches: [...league.matches, match('m3', {
      match_number: 3, team1_id: 'ty', team2_id: 'tb', waiting_team_id: 'tg', status: 'active',
      team1_score: 1, team2_score: 0, timer_status: 'paused', timer_elapsed_seconds: 125,
    })],
    match_events: [...league.match_events, event('e9', 'm3', 'p6', 'ty', 'goal', { minute: 1, elapsed_seconds: 100 })],
  })
  renderPage()
  expect(await screen.findByText('Match #3')).toBeInTheDocument()
  expect(await screen.findByText('02:05')).toBeInTheDocument()
  expect(screen.getByText('Paused')).toBeInTheDocument()
  expect(screen.getByText(/Waiting/).textContent).toContain('Green Team')
  expect(screen.getAllByText('Nour').length).toBeGreaterThan(0)
})

it('shows the day and results when no match is being played', async () => {
  resetDb(finishedLeague())
  renderPage()
  expect(await screen.findByText('No active match')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '2026-09-20' })).toBeInTheDocument()
  expect(screen.getAllByText('Omar').length).toBeGreaterThan(0)
})

it('says the page is not found when the link is unknown', async () => {
  resetDb()
  renderPage()
  expect(await screen.findByText('Page not found')).toBeInTheDocument()
  expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
})

it('offers a retry when the session cannot be loaded', async () => {
  resetDb(finishedLeague())
  db.errors.sessions = { message: 'Failed to fetch' }
  const user = userEvent.setup()
  renderPage()
  await user.click(await screen.findByRole('button', { name: 'Retry' }))
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()

  delete db.errors.sessions
  await user.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByText('No active match')).toBeInTheDocument()
})
