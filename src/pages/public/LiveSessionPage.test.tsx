import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'
import { resetDb } from '../../test/fakeSupabase'
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
