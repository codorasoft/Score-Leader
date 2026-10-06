import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const h = vi.hoisted(() => ({
  leagues: [] as unknown[],
  createLeague: vi.fn(),
  isSlugTaken: vi.fn(async () => false),
  refresh: vi.fn(async () => {}),
  navigate: vi.fn(),
}))
vi.mock('react-router-dom', async orig => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => h.navigate }))
vi.mock('../../contexts/MyLeaguesContext', () => ({
  useMyLeagues: () => ({ leagues: h.leagues, profile: { user_id: 'u1', max_leagues: 3 }, refresh: h.refresh }),
}))
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ signOut: vi.fn() }) }))
vi.mock('../../lib/tenancy', () => ({
  createLeague: h.createLeague,
  updateLeague: vi.fn(async () => true),
  isSlugTaken: h.isSlugTaken,
}))
vi.mock('../../lib/leagueLogo', () => ({ uploadLeagueLogo: vi.fn(), deleteLeagueLogo: vi.fn() }))

import NewLeaguePage from './NewLeaguePage'

const setup = () => render(<MemoryRouter><NewLeaguePage /></MemoryRouter>)
const nameInput = () => screen.getByLabelText('League name')
const slugInput = () => screen.getByLabelText('Link name') as HTMLInputElement

beforeEach(() => { h.leagues = []; h.createLeague.mockReset(); h.navigate.mockReset(); h.refresh.mockReset(); h.refresh.mockResolvedValue(undefined) })

it('fills the slug from the name', () => {
  setup()
  fireEvent.change(nameInput(), { target: { value: 'Tigers FC' } })
  expect(slugInput().value).toBe('tigers-fc')
  expect(screen.getByRole('button', { name: 'Create league' })).toBeEnabled()
})

it('leaves the slug empty for an Arabic name and disables Create', () => {
  setup()
  fireEvent.change(nameInput(), { target: { value: 'دوري النمور' } })
  expect(slugInput().value).toBe('')
  expect(screen.getByRole('button', { name: 'Create league' })).toBeDisabled()
})

it('shows the reserved message', () => {
  setup()
  fireEvent.change(nameInput(), { target: { value: 'X' } })
  fireEvent.change(slugInput(), { target: { value: 'players' } })
  expect(screen.getByText(/reserved/i)).toBeInTheDocument()
})

it('shows the limit message', async () => {
  h.createLeague.mockResolvedValue({ error: 'limit' })
  h.leagues = [{ id: 'a' }]
  setup()
  fireEvent.change(nameInput(), { target: { value: 'Tigers FC' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create league' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('League limit reached (1/3)'))
})

it('stays on the page when the list refresh fails after creating', async () => {
  h.createLeague.mockResolvedValue({ league: { id: 'l1', slug: 'tigers-fc' } })
  h.refresh.mockRejectedValue(new Error('offline'))
  setup()
  fireEvent.change(nameInput(), { target: { value: 'Tigers FC' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create league' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('League created. Reload the page to continue.'))
  expect(h.navigate).not.toHaveBeenCalled()
})
