import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'
import { db, resetDb } from '../../test/fakeSupabase'
import { finishedLeague } from '../../test/fixtures'
import { FEATURES } from '../../lib/features'

vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)
const shared = vi.hoisted(() => ({ images: [] as { title: string; lines: string[]; fileName: string }[] }))
vi.mock('../../lib/shareImage', () => ({
  drawSessionImage: (d: { title: string; sections: { lines: { text: string }[] }[] }) => ({ title: d.title, lines: d.sections[0].lines.map((l) => l.text) }),
  shareCanvas: async (canvas: { title: string; lines: string[] }, fileName: string) => { shared.images.push({ ...canvas, fileName }); return 'shared' },
}))

import LeaderboardPage from './LeaderboardPage'
import RecordsPage from './RecordsPage'

const renderPage = (features = FEATURES, url = '/l/eagles/leaderboard') =>
  render(<MemoryRouter initialEntries={[url]}><InLeague features={features}><LeaderboardPage /></InLeague></MemoryRouter>)

// Row order as shown: each row's name, top to bottom
const order = () => screen.getAllByRole('link').map((a) => a.querySelector('.font-semibold')?.textContent)

it('ranks active players by points and links to their profiles', async () => {
  resetDb(finishedLeague())
  renderPage()
  await screen.findByRole('link', { name: /Omar/ })
  // Omar: 2 goals + 1 win = 6 points; Ali: assist + win, keeper clean sheet = 6; level, so more goals ranks Omar first
  expect(order().slice(0, 2)).toEqual(['Omar', 'Ali'])
  expect(screen.getByRole('link', { name: /Omar/ })).toHaveAttribute('href', '/l/eagles/players/p2')
  expect(screen.queryByText('Retired')).not.toBeInTheDocument()
  expect(screen.queryByText('Stranger')).not.toBeInTheDocument()
  expect(screen.getByText(/1 session · 2 matches/)).toBeInTheDocument()
})

it('re-sorts by the chosen stat', async () => {
  resetDb(finishedLeague())
  const user = userEvent.setup()
  renderPage()
  await screen.findByRole('link', { name: /Omar/ })
  await user.click(screen.getByRole('button', { name: 'Assists' }))
  expect(screen.getByRole('button', { name: 'Assists' })).toHaveAttribute('aria-pressed', 'true')
  expect(order()[0]).toBe('Ali')
})

it('offers the periods that have sessions and keeps the choice in the URL', async () => {
  resetDb(finishedLeague())
  const user = userEvent.setup()
  renderPage()
  await screen.findByRole('link', { name: /Omar/ })
  expect(screen.getByRole('tab', { name: 'All time' })).toBeInTheDocument()
  const season = screen.getByRole('tab', { name: 'Season 2026' })
  await user.click(season)
  expect(season).toHaveAttribute('aria-selected', 'true')
})

it('shows rows without links when profiles are off', async () => {
  resetDb(finishedLeague())
  renderPage(FEATURES.filter((f) => f !== 'profiles' && f !== 'badges'))
  expect(await screen.findByText('Omar')).toBeInTheDocument()
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
})

it('says so when no matches have been finished', async () => {
  resetDb({ players: finishedLeague().players })
  renderPage()
  expect(await screen.findByText('No finished matches in this period')).toBeInTheDocument()
})

it('records reuse the history the leaderboard just downloaded', async () => {
  resetDb(finishedLeague())
  const { unmount } = renderPage()
  await screen.findByRole('link', { name: /Omar/ })
  unmount()
  const reads = db.reads
  render(<MemoryRouter><InLeague><RecordsPage /></InLeague></MemoryRouter>)
  expect(await screen.findByRole('heading', { name: 'Biggest win' })).toBeInTheDocument()
  expect(db.reads).toBe(reads)
})

it('shares the list as it is shown, for the chosen period and stat, as an image', async () => {
  resetDb(finishedLeague())
  shared.images.length = 0
  const user = userEvent.setup()
  renderPage()
  await screen.findByRole('link', { name: /Omar/ })
  await user.click(screen.getByRole('button', { name: 'Assists' }))
  await user.click(screen.getByRole('button', { name: /Share as image/ }))
  expect(shared.images).toHaveLength(1)
  expect(shared.images[0].title).toMatch(/^Leaderboard · /)
  expect(shared.images[0].lines[0]).toBe('1. Ali · 1')
  expect(shared.images[0].fileName).toMatch(/assists\.png$/)
})
