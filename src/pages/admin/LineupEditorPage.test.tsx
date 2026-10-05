import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'

const insert = vi.fn().mockResolvedValue({ error: null })
const upsert = vi.fn().mockResolvedValue({ error: null })

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'players') {
        return { select: () => ({ order: () => Promise.resolve({ data: [
          { id: 'ali', name: 'Ali', position: 'MID', photo_url: null, is_active: true },
          { id: 'omar', name: 'Omar', position: 'GK', photo_url: null, is_active: true },
          { id: 'old', name: 'Retired', position: 'MID', photo_url: null, is_active: false },
        ] }) }) }
      }
      if (table === 'lineups') return { insert }
      return { upsert }
    },
  },
}))

import LineupEditorPage from './LineupEditorPage'

it('creates a lineup with the chosen players at their starting spots', async () => {
  render(
    <MemoryRouter initialEntries={['/admin/lineups/new']}>
      <Routes>
        <Route path="/admin/lineups/new" element={<LineupEditorPage />} />
        <Route path="/admin/lineups/:lineupId" element={<p>saved page</p>} />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.change(await screen.findByLabelText('Board name'), { target: { value: '  Friday 5s  ' } })
  fireEvent.click(screen.getByRole('button', { name: /Add players/ }))

  // Removed (inactive) players can't be picked
  expect(screen.queryByRole('button', { name: /Retired/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Ali/ }))
  fireEvent.click(screen.getByRole('button', { name: /Omar/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Add 2 players' }))

  expect(screen.getByRole('button', { name: 'Ali' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Save/ }))

  await waitFor(() => expect(upsert).toHaveBeenCalled())
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({ name: 'Friday 5s' }))
  const lineupId = insert.mock.calls[0][0].id
  expect(upsert.mock.calls[0][0]).toEqual([
    { lineup_id: lineupId, player_id: 'ali', x: 0.2, y: 0.85 },
    { lineup_id: lineupId, player_id: 'omar', x: 0.4, y: 0.85 },
  ])
  expect(await screen.findByText('saved page')).toBeInTheDocument()
})

it('will not save a lineup without a name', async () => {
  render(<MemoryRouter initialEntries={['/admin/lineups/new']}><Routes><Route path="/admin/lineups/new" element={<LineupEditorPage />} /></Routes></MemoryRouter>)
  expect(await screen.findByRole('button', { name: /Save/ })).toBeDisabled()
  expect(screen.getByText('Give the board a name to save it.')).toBeInTheDocument()
})

it('saves arrows drawn on the board', async () => {
  insert.mockClear()
  HTMLElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 300, right: 200, bottom: 300, x: 0, y: 0, toJSON: () => ({}) })
  HTMLElement.prototype.setPointerCapture = () => {}
  render(
    <MemoryRouter initialEntries={['/admin/lineups/new']}>
      <Routes>
        <Route path="/admin/lineups/new" element={<LineupEditorPage />} />
        <Route path="/admin/lineups/:lineupId" element={<p>saved page</p>} />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.change(await screen.findByLabelText('Board name'), { target: { value: 'Tactics' } })
  fireEvent.click(screen.getByRole('button', { name: /Pass/ }))
  const area = screen.getByLabelText('Drawing area')
  fireEvent.pointerDown(area, { pointerId: 1, clientX: 40, clientY: 240 })
  fireEvent.pointerUp(area, { pointerId: 1, clientX: 160, clientY: 60 })
  fireEvent.click(screen.getByRole('button', { name: /Save/ }))
  await waitFor(() => expect(insert).toHaveBeenCalled())
  expect(insert.mock.calls[0][0].drawings).toEqual([
    expect.objectContaining({ kind: 'arrow', dashed: false, color: 'yellow', x1: 0.2, y1: 0.8, x2: 0.8, y2: 0.2 }),
  ])
})

it('adds a guest by name, shows them on the pitch and saves them with the board', async () => {
  insert.mockClear()
  render(
    <MemoryRouter initialEntries={['/admin/lineups/new']}>
      <Routes>
        <Route path="/admin/lineups/new" element={<LineupEditorPage />} />
        <Route path="/admin/lineups/:lineupId" element={<p>saved page</p>} />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.change(await screen.findByLabelText('Board name'), { target: { value: 'With guests' } })
  fireEvent.click(screen.getByRole('button', { name: /Add players/ }))
  fireEvent.change(screen.getByPlaceholderText('Guest name'), { target: { value: '  Khalil ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add guest' }))

  expect(screen.getByRole('button', { name: 'Khalil (guest)' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Save/ }))
  await waitFor(() => expect(insert).toHaveBeenCalled())
  expect(insert.mock.calls[0][0].guests).toEqual([
    expect.objectContaining({ name: 'Khalil', x: 0.2, y: 0.85 }),
  ])
})
