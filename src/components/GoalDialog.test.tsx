import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { GoalDialog } from './GoalDialog'
import type { Player, Team } from '../lib/types'

const mockTeams: { team: Team; players: Player[] }[] = [
  {
    team: { id: 't1', session_id: 's1', color: 'red', name: null },
    players: [
      { id: 'p1', name: 'Player 1', position: 'ATT', skill_rating: 4, photo_url: null, is_active: true, created_at: '' },
    ],
  },
  {
    team: { id: 't2', session_id: 's1', color: 'blue', name: null },
    players: [
      { id: 'p2', name: 'Player 2', position: 'MID', skill_rating: 3, photo_url: null, is_active: true, created_at: '' },
    ],
  },
]

it('calls onConfirm with scorerId and null assisterId when No assist selected', () => {
  const onConfirm = vi.fn()
  render(<GoalDialog teams={mockTeams} onConfirm={onConfirm} onClose={vi.fn()} />)
  fireEvent.click(screen.getByText('Player 1'))
  fireEvent.click(screen.getByText('No assist'))
  fireEvent.click(screen.getByText('Confirm'))
  expect(onConfirm).toHaveBeenCalledWith({ scorerId: 'p1', assisterId: null })
})

it('calls onConfirm with both scorer and assister', () => {
  const onConfirm = vi.fn()
  render(<GoalDialog teams={mockTeams} onConfirm={onConfirm} onClose={vi.fn()} />)
  fireEvent.click(screen.getByText('Player 1'))
  fireEvent.click(screen.getByText('Player 2'))
  fireEvent.click(screen.getByText('Confirm'))
  expect(onConfirm).toHaveBeenCalledWith({ scorerId: 'p1', assisterId: 'p2' })
})

it('shows team group headers for scorer selection', () => {
  render(<GoalDialog teams={mockTeams} onConfirm={vi.fn()} onClose={vi.fn()} />)
  expect(screen.getByText('Red Team')).toBeInTheDocument()
  expect(screen.getByText('Blue Team')).toBeInTheDocument()
})
