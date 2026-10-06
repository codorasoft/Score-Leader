import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'
import { resetDb } from '../../test/fakeSupabase'
import { finishedLeague } from '../../test/fixtures'
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
  expect(tile('Sessions')).toHaveTextContent('1')
  expect(tile('Matches')).toHaveTextContent('2')
  expect(tile('Goals')).toHaveTextContent('2')
  expect(tile('Win rate')).toHaveTextContent('50%')
  expect(tile('Win rate')).toHaveTextContent('1W · 0D · 1L')
  expect(screen.getByRole('heading', { name: 'Session by session' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Leaderboard/ })).toHaveAttribute('href', '/l/eagles/leaderboard')
})

it('does not show a player from another league', async () => {
  renderPage('px')
  expect(await screen.findByText('Page not found')).toBeInTheDocument()
  expect(screen.queryByText('Stranger')).not.toBeInTheDocument()
})

it('links back to the league home when the leaderboard is off', async () => {
  renderPage('p2', FEATURES.filter((f) => f !== 'leaderboard' && f !== 'potm'))
  expect(await screen.findByRole('link', { name: /Leaderboard/ })).toHaveAttribute('href', '/l/eagles')
})
