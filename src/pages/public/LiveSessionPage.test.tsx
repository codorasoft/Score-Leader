import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'
import { db, resetDb } from '../../test/fakeSupabase'
import { event, finishedLeague, match, session, team } from '../../test/fixtures'
import { PRESETS } from '../../utils/matchFormat'

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
      match_number: 3, team1_id: 'ty', team2_id: 'tb', waiting_team_id: 'tg', queue: ['tg'], status: 'active',
      team1_score: 1, team2_score: 0, timer_status: 'paused', timer_elapsed_seconds: 125,
    })],
    match_events: [...league.match_events, event('e9', 'm3', 'p6', 'ty', 'goal', { minute: 1, elapsed_seconds: 100 })],
  })
  renderPage()
  expect(await screen.findByText('Match #3')).toBeInTheDocument()
  expect(await screen.findByText('02:05')).toBeInTheDocument()
  expect(screen.getByText('Paused')).toBeInTheDocument()
  expect(screen.getByText('Next up: Green Team')).toBeInTheDocument()
  expect(screen.getAllByText('Nour').length).toBeGreaterThan(0)
})

it('shows the day and results when no match is being played', async () => {
  resetDb(finishedLeague())
  renderPage()
  expect(await screen.findByText('No active match')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '2026-09-20' })).toBeInTheDocument()
  expect(screen.getAllByText('Omar').length).toBeGreaterThan(0)
})

it('loads the session, teams, matches, goals and players in one request', async () => {
  resetDb(finishedLeague())
  renderPage()
  expect(await screen.findByText('No active match')).toBeInTheDocument()
  expect(screen.getAllByText('Omar').length).toBeGreaterThan(0)
  expect(db.reads).toBe(1)
})

it('names a player who came on in a swap even though they are not on a team list', async () => {
  const league = finishedLeague()
  resetDb({
    ...league,
    match_events: [...league.match_events, event('e9', 'm1', 'p7', 'tg', 'goal')],
  })
  renderPage()
  expect((await screen.findAllByText('Retired')).length).toBeGreaterThan(0)
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

it('four teams: shows who comes on next, in order', async () => {
  const league = finishedLeague()
  resetDb({
    ...league,
    teams: [...league.teams, team('to', 's1', 'orange')],
    sessions: [{ ...session, status: 'active', team_count: 4 }],
    matches: [...league.matches, match('m3', {
      match_number: 3, team1_id: 'ty', team2_id: 'tg', waiting_team_id: 'to', queue: ['to', 'tb'], status: 'active', timer_status: 'paused',
    })],
  })
  renderPage()
  expect(await screen.findByText('Next up: Orange Team, then Blue Team')).toBeInTheDocument()
})

it('shows the period under the clock and Half-time between periods', async () => {
  const league = finishedLeague()
  resetDb({ ...league, sessions: [{ ...session, status: 'active', ...PRESETS.halves }], matches: [...league.matches, match('m3', { match_number: 3, status: 'active', period: 1, period_seconds: [600], timer_status: 'stopped', timer_elapsed_seconds: 600 })] })
  renderPage()
  expect(await screen.findByText('Half-time')).toBeInTheDocument()
})

it('a finished shoot-out shows the penalty score', async () => {
  const league = finishedLeague()
  resetDb({ ...league, matches: [match('m1', { status: 'completed', is_draw: true, draw_resolved_by: 'penalties', winner_team_id: 'tg', penalties_team1: 4, penalties_team2: 3 })] })
  renderPage()
  expect(await screen.findByText(/pens 4–3/)).toBeInTheDocument()
})

it('during a live shoot-out the header shows Penalties, the shoot-out score and no clock', async () => {
  const league = finishedLeague()
  resetDb({
    ...league,
    sessions: [{ ...session, status: 'active', ...PRESETS.knockout }],
    matches: [...league.matches, match('m3', {
      match_number: 3, status: 'active', period: 5, period_seconds: [600, 600, 300, 300], timer_status: 'stopped',
      team1_score: 1, team2_score: 1, penalties_team1: 4, penalties_team2: 3,
    })],
  })
  renderPage()
  expect(await screen.findByText('Penalties')).toBeInTheDocument()
  expect(screen.getByText('4–3')).toBeInTheDocument()
  expect(screen.getByText('–')).toBeInTheDocument()
})

it('names the current period under the clock', async () => {
  const league = finishedLeague()
  resetDb({
    ...league,
    sessions: [{ ...session, status: 'active', ...PRESETS.halves }],
    matches: [...league.matches, match('m3', { match_number: 3, status: 'active', period: 2, period_seconds: [600], timer_status: 'paused', timer_elapsed_seconds: 30 })],
  })
  renderPage()
  expect(await screen.findByText('2nd half')).toBeInTheDocument()
  expect(screen.queryByText('Half-time')).not.toBeInTheDocument()
})

it('a Quick session shows Match under the clock and no period prefixes', async () => {
  const league = finishedLeague()
  resetDb({
    ...league,
    sessions: [{ ...session, status: 'active' }],
    matches: [...league.matches, match('m3', { match_number: 3, status: 'active', timer_status: 'paused', timer_elapsed_seconds: 30 })],
    match_events: [...league.match_events, event('e9', 'm3', 'p6', 'ty', 'goal', { elapsed_seconds: 20 })],
  })
  renderPage()
  expect(await screen.findByText('Match')).toBeInTheDocument()
  expect(screen.getAllByText('Nour').length).toBeGreaterThan(0)
  expect(document.body.textContent).not.toMatch(/\b[12]H\b/)
})
