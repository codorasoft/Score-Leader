import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { GoalDialog } from './GoalDialog'
import type { Player } from '../lib/types'

const mockPlayers: Player[] = [
  { id: 'p1', name: 'Player 1', position: 'ATT', skill_rating: 4, photo_url: null, is_active: true, created_at: '' },
  { id: 'p2', name: 'Player 2', position: 'MID', skill_rating: 3, photo_url: null, is_active: true, created_at: '' },
]

it('calls onConfirm with scorerId and null assisterId when No assist selected', () => {
  const onConfirm = vi.fn()
  render(<GoalDialog players={mockPlayers} onConfirm={onConfirm} onClose={vi.fn()} />)
  fireEvent.click(screen.getByText('Player 1'))
  fireEvent.click(screen.getByText('No assist'))
  fireEvent.click(screen.getByText('Confirm'))
  expect(onConfirm).toHaveBeenCalledWith({ scorerId: 'p1', assisterId: null })
})

it('calls onConfirm with both scorer and assister', () => {
  const onConfirm = vi.fn()
  render(<GoalDialog players={mockPlayers} onConfirm={onConfirm} onClose={vi.fn()} />)
  fireEvent.click(screen.getByText('Player 1'))
  fireEvent.click(screen.getByText('Player 2'))
  fireEvent.click(screen.getByText('Confirm'))
  expect(onConfirm).toHaveBeenCalledWith({ scorerId: 'p1', assisterId: 'p2' })
})
