import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { AttendancePicker } from './NewSessionPage'
import type { Player } from '../../lib/types'

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn() } }))

const mkPlayer = (i: number): Player => ({
  id: `p${i}`, name: `Player ${i}`, position: 'MID',
  skill_rating: 3, photo_url: null, is_active: true, created_at: '',
})

it('disables unselected players once 15 are selected', () => {
  const players = Array.from({ length: 20 }, (_, i) => mkPlayer(i))
  const selected = new Set(players.slice(0, 15).map((p) => p.id))
  render(<AttendancePicker players={players} selected={selected} onToggle={vi.fn()} />)
  // player 15 is not selected and count is at max — button should be disabled
  expect(screen.getByTestId('player-p15')).toBeDisabled()
  // player 0 is selected — button should not be disabled
  expect(screen.getByTestId('player-p0')).not.toBeDisabled()
})

it('shows the selected count', () => {
  const players = Array.from({ length: 5 }, (_, i) => mkPlayer(i))
  const selected = new Set(['p0', 'p1', 'p2'])
  render(<AttendancePicker players={players} selected={selected} onToggle={vi.fn()} />)
  expect(screen.getByText('3 / 15')).toBeInTheDocument()
})
