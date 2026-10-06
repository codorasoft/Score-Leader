import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { PositionBadge } from './PlayersPage'
import type { Player } from '../../lib/types'

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn() } }))

it('renders GK position badge', () => {
  render(<PositionBadge position="GK" />)
  expect(screen.getByText('GK')).toBeInTheDocument()
})

it('renders DEF position badge', () => {
  render(<PositionBadge position="DEF" />)
  expect(screen.getByText('DEF')).toBeInTheDocument()
})

it('renders MID position badge', () => {
  render(<PositionBadge position="MID" />)
  expect(screen.getByText('MID')).toBeInTheDocument()
})

it('renders ATT position badge', () => {
  render(<PositionBadge position="ATT" />)
  expect(screen.getByText('ATT')).toBeInTheDocument()
})

describe('PlayersPage in a league', () => {
  it('sends league_id when adding a player', async () => {
    vi.resetModules()
    const insert = vi.fn().mockResolvedValue({ error: null })
    const eqs: unknown[][] = []
    const q: Record<string, unknown> = {}
    q.eq = (...a: unknown[]) => { eqs.push(a); return q }
    q.order = () => Promise.resolve({ data: [] })
    vi.doMock('../../lib/supabase', () => ({ supabase: { from: () => ({ select: () => q, insert }) } }))
    const { default: Page } = await import('./PlayersPage')
    const { InLeague } = await import('../../test/league')
    const { MemoryRouter } = await import('react-router-dom')
    render(<MemoryRouter><InLeague><Page /></InLeague></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: '+ Add Player' }))
    fireEvent.change(screen.getByPlaceholderText(/name/i), { target: { value: 'Sam' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(insert).toHaveBeenCalledWith(expect.objectContaining({ name: 'Sam', league_id: 'L1' })))
    expect(eqs).toContainEqual(['league_id', 'L1'])
  })

  it('hides the photo picker without the photos feature', async () => {
    vi.resetModules()
    const q: Record<string, unknown> = {}
    q.eq = () => q
    q.order = () => Promise.resolve({ data: [] })
    vi.doMock('../../lib/supabase', () => ({ supabase: { from: () => ({ select: () => q }) } }))
    const { default: Page } = await import('./PlayersPage')
    const { InLeague } = await import('../../test/league')
    const { FEATURES } = await import('../../lib/features')
    const { MemoryRouter } = await import('react-router-dom')
    render(<MemoryRouter><InLeague features={FEATURES.filter((f) => f !== 'photos')}><Page /></InLeague></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: '+ Add Player' }))
    expect(screen.queryByText(/photo/i)).toBeNull()
  })
})
