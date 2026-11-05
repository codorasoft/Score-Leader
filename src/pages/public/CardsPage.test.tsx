import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'
import { db, resetDb } from '../../test/fakeSupabase'
import { finishedLeague } from '../../test/fixtures'
import { FEATURES } from '../../lib/features'

vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)

import CardsPage from './CardsPage'
import * as leagueData from '../../lib/league'

beforeEach(() => resetDb(finishedLeague()))

const renderPage = (features = FEATURES) => render(<MemoryRouter><InLeague features={features}><CardsPage /></InLeague></MemoryRouter>)

it('shows a card for every active player in this league, linked to their profile', async () => {
  renderPage()
  const omar = await screen.findByRole('link', { name: /Omar/ })
  expect(omar).toHaveAttribute('href', '/l/eagles/players/p2')
  for (const name of ['Ali', 'Sami', 'Zaid', 'Hadi', 'Nour']) expect(screen.getByRole('link', { name: new RegExp(name) })).toBeInTheDocument()
  expect(screen.queryByText('Retired')).not.toBeInTheDocument()
  expect(screen.queryByText('Stranger')).not.toBeInTheDocument()
})

it('shows cards without profile links when profiles are off', async () => {
  renderPage(FEATURES.filter((f) => f !== 'profiles' && f !== 'badges'))
  expect((await screen.findAllByText('Omar')).length).toBeGreaterThan(0)
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
})

it.each(['incomplete', 'rejected'])('offers a retry instead of cards after an %s load', async (failure) => {
  const load = vi.spyOn(leagueData, 'loadLeague')
  if (failure === 'rejected') load.mockRejectedValueOnce(new Error('offline'))
  else db.errors.match_events = { message: 'Failed to fetch' }
  try {
    const user = userEvent.setup()
    renderPage()
    const retry = await screen.findByRole('button', { name: 'Retry' })
    expect(screen.queryByRole('link', { name: /Omar/ })).not.toBeInTheDocument()

    delete db.errors.match_events
    await user.click(retry)
    expect(await screen.findByRole('link', { name: /Omar/ })).toBeInTheDocument()
  } finally {
    load.mockRestore()
  }
})
