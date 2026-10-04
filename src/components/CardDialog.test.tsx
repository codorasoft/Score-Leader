import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { CardDialog } from './CardDialog'
import type { Player } from '../lib/types'

const mockPlayers: Player[] = [
  { id: 'p1', name: 'Player 1', position: 'MID', skill_rating: 3, photo_url: null, is_active: true, created_at: '' },
]

it('shows duration picker only for red card', () => {
  render(<CardDialog players={mockPlayers} onConfirm={vi.fn()} onClose={vi.fn()} />)
  fireEvent.click(screen.getByText('Player 1'))
  fireEvent.click(screen.getByText('Red'))
  expect(screen.getByText('2 min')).toBeInTheDocument()
  expect(screen.getByText('3 min')).toBeInTheDocument()
})

it('does not show duration picker for yellow card', () => {
  render(<CardDialog players={mockPlayers} onConfirm={vi.fn()} onClose={vi.fn()} />)
  fireEvent.click(screen.getByText('Player 1'))
  fireEvent.click(screen.getByText('Yellow'))
  expect(screen.queryByText('2 min')).not.toBeInTheDocument()
})

it('calls onConfirm with yellow_card type', () => {
  const onConfirm = vi.fn()
  render(<CardDialog players={mockPlayers} onConfirm={onConfirm} onClose={vi.fn()} />)
  fireEvent.click(screen.getByText('Player 1'))
  fireEvent.click(screen.getByText('Yellow'))
  expect(onConfirm).toHaveBeenCalledWith({ playerId: 'p1', cardType: 'yellow_card', suspensionMinutes: null })
})
