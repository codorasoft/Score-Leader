import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'
import { resetDb, rows } from '../../test/fakeSupabase'
import { players } from '../../test/fixtures'

vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)

import PlayersPage from './PlayersPage'

const renderPage = () => render(<MemoryRouter><InLeague><PlayersPage /></InLeague></MemoryRouter>)

beforeEach(() => resetDb({ players: [...players, { ...players[0], id: 'g1', name: 'Khalid', is_guest: true }] }))

it('keeps guests out of the squad, folded under Guests', async () => {
  const user = userEvent.setup()
  renderPage()
  expect(await screen.findByText('Ali')).toBeInTheDocument()
  expect(screen.queryByText('Khalid')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Guests (1)' }))
  expect(screen.getByText('Khalid')).toBeInTheDocument()
})

it('adds a guest to the squad', async () => {
  const user = userEvent.setup()
  renderPage()
  await user.click(await screen.findByRole('button', { name: 'Guests (1)' }))
  await user.click(screen.getByRole('button', { name: 'Add Khalid to the squad' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: /Guests/ })).not.toBeInTheDocument())
  expect(rows('players').find((p) => p.id === 'g1')!.is_guest).toBe(false)
  expect(screen.getByText('Khalid')).toBeInTheDocument()
})
