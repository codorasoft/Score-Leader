import { render, screen } from '@testing-library/react'
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
