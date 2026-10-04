import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { CardDialog } from './CardDialog'
import type { Player, Team } from '../lib/types'

const mockTeams: { team: Team; players: Player[] }[] = [
  {
    team: { id: 't1', session_id: 's1', color: 'red', name: null },
    players: [
      { id: 'p1', name: 'Player 1', position: 'MID', skill_rating: 3, photo_url: null, is_active: true, created_at: '' },
    ],
  },
  {
    team: { id: 't2', session_id: 's1', color: 'blue', name: null },
    players: [
      { id: 'p2', name: 'Player 2', position: 'ATT', skill_rating: 4, photo_url: null, is_active: true, created_at: '' },
    ],
  },
]

it('shows duration picker only for red card', () => {
  render(<CardDialog teams={mockTeams} onConfirm={vi.fn()} onClose={vi.fn()} />)
  fireEvent.click(screen.getByText('Player 1'))
  fireEvent.click(screen.getByText('Red'))
  expect(screen.getByText('2 min')).toBeInTheDocument()
  expect(screen.getByText('3 min')).toBeInTheDocument()
})

it('does not show duration picker for yellow card', () => {
  render(<CardDialog teams={mockTeams} onConfirm={vi.fn()} onClose={vi.fn()} />)
  fireEvent.click(screen.getByText('Player 1'))
  fireEvent.click(screen.getByText('Yellow'))
  expect(screen.queryByText('2 min')).not.toBeInTheDocument()
})

it('calls onConfirm with yellow_card type', () => {
  const onConfirm = vi.fn()
  render(<CardDialog teams={mockTeams} onConfirm={onConfirm} onClose={vi.fn()} />)
  fireEvent.click(screen.getByText('Player 1'))
  fireEvent.click(screen.getByText('Yellow'))
  expect(onConfirm).toHaveBeenCalledWith({ playerId: 'p1', cardType: 'yellow_card', suspensionMinutes: null })
})

it('shows team group headers for player selection', () => {
  render(<CardDialog teams={mockTeams} onConfirm={vi.fn()} onClose={vi.fn()} />)
  expect(screen.getByText('Red Team')).toBeInTheDocument()
  expect(screen.getByText('Blue Team')).toBeInTheDocument()
})
