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

it('creates the session in the league and goes to its team builder', async () => {
  vi.resetModules()
  const sessionInsert = vi.fn()
  const q: Record<string, unknown> = {}
  q.eq = () => q
  q.order = () => Promise.resolve({ data: [{ ...mkPlayer(1), id: 'p1' }] })
  const sessions = {
    insert: (row: unknown) => { sessionInsert(row); return { select: () => ({ single: () => Promise.resolve({ data: { id: 's9' } }) }) } },
  }
  const sp = { insert: () => Promise.resolve({ error: null }) }
  vi.doMock('../../lib/supabase', () => ({
    supabase: { from: (t: string) => (t === 'players' ? { select: () => q } : t === 'sessions' ? sessions : sp) },
  }))
  const { default: Page } = await import('./NewSessionPage')
  const { InLeague } = await import('../../test/league')
  const { MemoryRouter, Routes, Route } = await import('react-router-dom')
  const { waitFor, container } = { ...(await import('@testing-library/react')), container: null }
  render(
    <MemoryRouter initialEntries={['/admin/eagles/sessions/new']}>
      <InLeague>
        <Routes>
          <Route path="/admin/eagles/sessions/new" element={<Page />} />
          <Route path="/admin/eagles/sessions/:id/teams" element={<p>teams page</p>} />
        </Routes>
      </InLeague>
    </MemoryRouter>,
  )
  void container
  fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: '2026-10-06' } })
  fireEvent.click(screen.getAllByRole('button').find((b) => !b.hasAttribute('disabled'))!)
  await waitFor(() => expect(sessionInsert).toHaveBeenCalledWith(expect.objectContaining({ league_id: 'L1' })))
  fireEvent.click(await screen.findByTestId('player-p1'))
  fireEvent.click(screen.getAllByRole('button').filter((b) => !b.hasAttribute('disabled')).pop()!)
  expect(await screen.findByText('teams page')).toBeInTheDocument()
})
