import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'
import { resetDb } from '../../test/fakeSupabase'
import { finishedLeague } from '../../test/fixtures'
import { FEATURES } from '../../lib/features'

vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)

import RecordsPage from './RecordsPage'

const renderPage = (features = FEATURES) => render(<MemoryRouter><InLeague features={features}><RecordsPage /></InLeague></MemoryRouter>)
const section = (name: string) => screen.getByRole('heading', { name }).closest('section') as HTMLElement

it('shows record holders from finished matches', async () => {
  resetDb(finishedLeague())
  renderPage()
  await screen.findByRole('heading', { name: 'Biggest win' })
  expect(within(section('Biggest win')).getByText('+2 goals')).toBeInTheDocument()
  expect(within(section('Biggest win')).getByText('2–0')).toBeInTheDocument()
  expect(within(section('Fastest goal')).getByText('00:45')).toBeInTheDocument()
  expect(within(section('Fastest goal')).getByRole('link', { name: 'Omar' })).toHaveAttribute('href', '/l/eagles/players/p2')
})

it('names holders without links when profiles are off', async () => {
  resetDb(finishedLeague())
  renderPage(FEATURES.filter((f) => f !== 'profiles' && f !== 'badges'))
  await screen.findByRole('heading', { name: 'Fastest goal' })
  expect(within(section('Fastest goal')).getByText('Omar')).toBeInTheDocument()
  expect(within(section('Fastest goal')).queryByRole('link')).not.toBeInTheDocument()
})

it('says there are no records before any match is played', async () => {
  resetDb({ players: finishedLeague().players })
  renderPage()
  expect(await screen.findByText(/No records yet/)).toBeInTheDocument()
})
