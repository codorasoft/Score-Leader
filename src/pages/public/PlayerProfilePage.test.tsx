import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'
import { db, resetDb } from '../../test/fakeSupabase'
import { event, finishedLeague, match } from '../../test/fixtures'
import { FEATURES } from '../../lib/features'

vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)

import PlayerProfilePage from './PlayerProfilePage'

const renderPage = (playerId: string, features = FEATURES) => render(
  <MemoryRouter initialEntries={[`/l/eagles/players/${playerId}`]}><InLeague features={features}>
    <Routes><Route path="/l/eagles/players/:playerId" element={<PlayerProfilePage />} /></Routes>
  </InLeague></MemoryRouter>,
)

// A stat tile (value, label, record line) in the totals grid, found by its label
const tile = (label: string) => within(document.querySelector('.grid-cols-3') as HTMLElement).getByText(label).parentElement!

beforeEach(() => resetDb(finishedLeague()))

it("shows a player's career totals and session history", async () => {
  renderPage('p2')
  expect((await screen.findAllByText('Omar')).length).toBeGreaterThan(0)
  expect(tile('Bookings')).toHaveTextContent('1')
  expect(tile('Matches')).toHaveTextContent('2')
  expect(tile('Goals')).toHaveTextContent('2')
  expect(tile('Win rate')).toHaveTextContent('50%')
  expect(tile('Win rate')).toHaveTextContent('1W · 0D · 1L')
  expect(screen.getByRole('heading', { name: 'Booking by booking' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Leaderboard/ })).toHaveAttribute('href', '/l/eagles/leaderboard')
})

it('does not show a player from another league', async () => {
  renderPage('px')
  expect(await screen.findByText('Page not found')).toBeInTheDocument()
  expect(screen.queryByText('Stranger')).not.toBeInTheDocument()
})

it('links back to the league home when the leaderboard is off', async () => {
  renderPage('p2', FEATURES.filter((f) => f !== 'leaderboard' && f !== 'potm'))
  expect(await screen.findByRole('link', { name: /Home/ })).toHaveAttribute('href', '/l/eagles')
})

it('loads completed profiles in seven reads and reuses the cache for the next player', async () => {
  const first = renderPage('p2')
  await screen.findByRole('heading', { name: 'Omar' })
  expect(db.reads).toBe(7)
  first.unmount()
  renderPage('p1')
  await screen.findByRole('heading', { name: 'Ali' })
  expect(db.reads).toBe(7)
})

it('includes unfinished goals on guest profiles without counting the unfinished match as played', async () => {
  const league = finishedLeague()
  resetDb({ ...league,
    players: league.players.map((p) => p.id === 'p2' ? { ...p, is_guest: true } : p),
    matches: [...league.matches, match('m3', { status: 'active' })],
    match_events: [...league.match_events, event('e5', 'm3', 'p2', 'tg', 'goal')],
  })
  renderPage('p2')
  await screen.findByRole('heading', { name: 'Omar' })
  expect(tile('Goals')).toHaveTextContent('3')
  expect(tile('Matches')).toHaveTextContent('2')
  expect(db.reads).toBe(8)
})

it('can retry an incomplete league snapshot without displaying a partial profile', async () => {
  const user = userEvent.setup()
  db.errors.match_events = { message: 'Failed to fetch' }
  renderPage('p2')
  const retry = await screen.findByRole('button', { name: 'Retry' })
  expect(screen.queryByRole('heading', { name: 'Omar' })).not.toBeInTheDocument()
  delete db.errors.match_events
  await user.click(retry)
  await screen.findByRole('heading', { name: 'Omar' })
  expect(tile('Goals')).toHaveTextContent('2')
})
