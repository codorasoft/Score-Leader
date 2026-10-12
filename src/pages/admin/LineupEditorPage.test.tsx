import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'

const insert = vi.fn().mockResolvedValue({ error: null })
const upsert = vi.fn().mockResolvedValue({ error: null })

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'players') {
        return { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [
          { id: 'ali', name: 'Ali', position: 'MID', photo_url: null, is_active: true },
          { id: 'omar', name: 'Omar', position: 'GK', photo_url: null, is_active: true },
          { id: 'old', name: 'Retired', position: 'MID', photo_url: null, is_active: false },
        ] }) }) }) }
      }
      if (table === 'lineups') return { insert }
      return { upsert }
    },
  },
}))

import { InLeague } from '../../test/league'
import LineupEditorPage from './LineupEditorPage'

it('creates a lineup with the chosen players at their starting spots', async () => {
  render(
    <InLeague><MemoryRouter initialEntries={['/admin/eagles/lineups/new']}>
      <Routes>
        <Route path="/admin/eagles/lineups/new" element={<LineupEditorPage />} />
        <Route path="/admin/eagles/lineups/:lineupId" element={<p>saved page</p>} />
      </Routes>
    </MemoryRouter></InLeague>,
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
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({ name: 'Friday 5s', league_id: 'L1' }))
  const lineupId = insert.mock.calls[0][0].id
  expect(upsert.mock.calls[0][0]).toEqual([
    { lineup_id: lineupId, player_id: 'ali', x: 0.2, y: 0.85 },
    { lineup_id: lineupId, player_id: 'omar', x: 0.4, y: 0.85 },
  ])
  expect(await screen.findByText('saved page')).toBeInTheDocument()
})

it('will not save a lineup without a name', async () => {
  render(<InLeague><MemoryRouter initialEntries={['/admin/eagles/lineups/new']}><Routes><Route path="/admin/eagles/lineups/new" element={<LineupEditorPage />} /></Routes></MemoryRouter></InLeague>)
  expect(await screen.findByRole('button', { name: /Save/ })).toBeDisabled()
  expect(screen.getByText('Give the board a name to save it.')).toBeInTheDocument()
})

it('saves arrows drawn on the board', async () => {
  insert.mockClear()
  HTMLElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 300, right: 200, bottom: 300, x: 0, y: 0, toJSON: () => ({}) })
  HTMLElement.prototype.setPointerCapture = () => {}
  render(
    <InLeague><MemoryRouter initialEntries={['/admin/eagles/lineups/new']}>
      <Routes>
        <Route path="/admin/eagles/lineups/new" element={<LineupEditorPage />} />
        <Route path="/admin/eagles/lineups/:lineupId" element={<p>saved page</p>} />
      </Routes>
    </MemoryRouter></InLeague>,
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
    <InLeague><MemoryRouter initialEntries={['/admin/eagles/lineups/new']}>
      <Routes>
        <Route path="/admin/eagles/lineups/new" element={<LineupEditorPage />} />
        <Route path="/admin/eagles/lineups/:lineupId" element={<p>saved page</p>} />
      </Routes>
    </MemoryRouter></InLeague>,
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

describe('free text on the board', () => {
  const open = async () => {
    insert.mockClear()
    HTMLElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 300, right: 200, bottom: 300, x: 0, y: 0, toJSON: () => ({}) })
    HTMLElement.prototype.setPointerCapture = () => {}
    render(
      <InLeague><MemoryRouter initialEntries={['/admin/eagles/lineups/new']}>
        <Routes>
          <Route path="/admin/eagles/lineups/new" element={<LineupEditorPage />} />
          <Route path="/admin/eagles/lineups/:lineupId" element={<p>saved page</p>} />
        </Routes>
      </MemoryRouter></InLeague>,
    )
    fireEvent.change(await screen.findByLabelText('Board name'), { target: { value: 'Notes' } })
  }
  const tapPitch = (clientX: number, clientY: number) => {
    const area = screen.getByLabelText('Drawing area')
    fireEvent.pointerDown(area, { pointerId: 1, clientX, clientY })
    fireEvent.pointerUp(area, { pointerId: 1, clientX, clientY })
  }

  it('adds a text in the chosen colour where the pitch is tapped, and saves it with the board', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Text' }))
    fireEvent.click(screen.getByRole('button', { name: 'Red' }))
    expect(screen.getByText('Tap the pitch where the text should go.')).toBeInTheDocument()
    tapPitch(100, 60)

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Add' })).toBeDisabled()
    fireEvent.change(within(dialog).getByLabelText('Text on the board'), { target: { value: '  Press   high ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Press high').closest('[style]')).toHaveStyle({ color: '#ef4444' })
    fireEvent.click(screen.getByRole('button', { name: /Save/ }))
    await waitFor(() => expect(insert).toHaveBeenCalled())
    expect(insert.mock.calls[0][0].drawings).toEqual([
      expect.objectContaining({ kind: 'text', color: 'red', text: 'Press high', x: 0.5, y: 0.2 }),
    ])
  })

  it('Cancel adds nothing', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Text' }))
    tapPitch(100, 150)
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Text on the board'), { target: { value: 'Not this' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Not this')).not.toBeInTheDocument()
  })

  it('a text is dragged with Move, and Undo takes it back', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Text' }))
    tapPitch(100, 150)
    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText('Text on the board'), { target: { value: 'Hold' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add' }))

    fireEvent.click(screen.getByRole('button', { name: 'Move' }))
    const text = screen.getByRole('button', { name: 'Hold' })
    fireEvent.pointerDown(text, { pointerId: 1, clientX: 100, clientY: 150 })
    fireEvent.pointerUp(text, { pointerId: 1, clientX: 50, clientY: 270 })
    expect(screen.getByRole('button', { name: 'Hold' }).style).toMatchObject({ left: '25%', top: '90%' })

    fireEvent.click(screen.getByRole('button', { name: /Undo/ }))
    expect(screen.queryByText('Hold')).not.toBeInTheDocument()
  })
})

