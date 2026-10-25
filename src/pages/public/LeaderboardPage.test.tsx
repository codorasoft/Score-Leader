import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'
import { db, resetDb } from '../../test/fakeSupabase'
import { finishedLeague } from '../../test/fixtures'
import { FEATURES } from '../../lib/features'

vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)
type ImageRow = { rank: number; name: string; value: number; record: string }
const shared = vi.hoisted(() => ({ images: [] as { title: string; period: string; stat: string; rows: ImageRow[]; legend: string | null; fileName: string; shareTitle: string }[] }))
vi.mock('../../lib/shareImage', () => ({
  drawLeaderboardImage: async (d: { title: string; period: string; stat: string; rows: ImageRow[]; legend: string | null }) => d,
  shareCanvas: async (canvas: { title: string; period: string; stat: string; rows: ImageRow[]; legend: string | null }, fileName: string, shareTitle: string) => {
    shared.images.push({ ...canvas, fileName, shareTitle })
    return 'shared'
  },
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
  const image = shared.images[0]
  expect(image.shareTitle).toMatch(/^Leaderboard · /)
  expect(image.stat).toBe('Assists')
  expect(image.rows[0]).toMatchObject({ rank: 1, name: 'Ali', value: 1 })
  expect(image.fileName).toMatch(/assists\.png$/)
  // Each player's records come along; the points legend only when sorted by points
  expect(image.rows[0].record).toBe('1A · 1W · 1CS')
  expect(image.legend).toBeNull()
})

it('shows on the shared image how each player got their points', async () => {
  resetDb(finishedLeague())
  shared.images.length = 0
  const user = userEvent.setup()
  renderPage()
  await screen.findByRole('link', { name: /Omar/ })
  await user.click(screen.getByRole('button', { name: /Share as image/ }))
  const image = shared.images[0]
  // Omar: 2 goals and a win, 6 points
  expect(image.rows[0]).toMatchObject({ name: 'Omar', value: 6, record: '2G (\u2066+4\u2069) · 1W (\u2066+2\u2069)' })
  expect(image.legend).toMatch(/^How points are counted: G goal \+2/)
})
