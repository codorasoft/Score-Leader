import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'
import { inArabic } from '../../test/arabic'
import { db, resetDb } from '../../test/fakeSupabase'

vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)
vi.mock('../../lib/shareImage', () => ({
  drawBoardImage: vi.fn(async () => document.createElement('canvas')),
  shareCanvas: vi.fn(async () => {}),
}))

import { drawBoardImage } from '../../lib/shareImage'
import LineupEditorPage from './LineupEditorPage'

const player = (id: string, name: string, position: string, is_active = true) =>
  ({ league_id: 'L1', id, name, position, skill_rating: 3, photo_url: null, is_active, created_at: '2026-10-01T00:00:00Z' })

const players = [
  player('omar', 'Omar', 'GK'),
  player('sami', 'Sami', 'DEF'),
  player('ali', 'Ali', 'ATT'),
  player('hadi', 'Hadi', 'MID'),
  player('zaid', 'Zaid', 'MID', false),
  ...Array.from({ length: 9 }, (_, i) => player(`p${i + 1}`, `Extra ${i + 1}`, 'MID')),
]
const extras = Array.from({ length: 9 }, (_, i) => `Extra ${i + 1}`)

// A saved board: Omar, Sami and Ali lined up in 1-1, with whatever else the test stores
const spot = (player_id: string, x: number, y: number, bench_order: number | null = null) =>
  ({ league_id: 'L1', lineup_id: 'b1', player_id, x, y, bench_order })
const saved = (board: Record<string, unknown> = {}, more: ReturnType<typeof spot>[] = []) => ({
  players,
  lineups: [{ league_id: 'L1', id: 'b1', name: 'Saved', drawings: [], guests: [], formation: '1-1', updated_at: '2026-10-10T00:00:00Z', ...board }],
  lineup_players: [spot('omar', 0.5, 0.92), spot('sami', 0.5, 0.74), spot('ali', 0.5, 0.2), ...more],
})

beforeEach(() => {
  resetDb({ players })
  vi.mocked(drawBoardImage).mockClear()
  HTMLElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 300, right: 200, bottom: 300, x: 0, y: 0, toJSON: () => ({}) })
  HTMLElement.prototype.setPointerCapture = () => {}
})

const show = (path = '/admin/eagles/lineups/new') => {
  render(
    <InLeague><MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/eagles/lineups/new" element={<LineupEditorPage />} />
        <Route path="/admin/eagles/lineups/:lineupId" element={<LineupEditorPage />} />
        <Route path="/admin/eagles/lineups" element={<p>boards list</p>} />
      </Routes>
    </MemoryRouter></InLeague>,
  )
}
const open = async (path?: string) => {
  show(path)
  await screen.findByLabelText('Board name')
}

const button = (name: string | RegExp) => screen.getByRole('button', { name })
const formationButton = () => button(/^Formation/)
// The picker, opened by one of the page's two buttons: its players, by the start of their names
const add = (names: string[], opener: RegExp = /Add players/) => {
  fireEvent.click(button(opener))
  const dialog = screen.getByRole('dialog')
  for (const name of names) fireEvent.click(within(dialog).getByRole('button', { name: new RegExp(`^${name}`) }))
  fireEvent.click(within(dialog).getByRole('button', { name: /^Add \d+ players?$/ }))
}
const offered = (opener: RegExp, name: string) => {
  fireEvent.click(button(opener))
  const found = within(screen.getByRole('dialog')).queryByRole('button', { name: new RegExp(`^${name}`) }) !== null
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
  return found
}
// Where a player stands on the pitch
const at = (name: string) => { const { left, top } = button(name).style; return [left, top] }
const apply = (formation: string) => {
  fireEvent.click(formationButton())
  const dialog = screen.getByRole('dialog', { name: 'Formation' })
  fireEvent.click(within(dialog).getByRole('button', { name: formation }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }))
}
const bench = () => within(screen.getByRole('list', { name: 'Substitutes' })).getAllByRole('button').map((b) => b.getAttribute('aria-label'))
const writes = (table: string, op: string) => db.writes.filter((w) => w.table === table && w.op === op)
const saveAs = (name: string) => {
  fireEvent.change(screen.getByLabelText('Board name'), { target: { value: name } })
  fireEvent.click(button(/Save/))
}

describe('formations', () => {
  it('has no formation for fewer than two players', async () => {
    await open()
    add(['Ali'])
    expect(formationButton()).toBeDisabled()
    expect(screen.getByText('Add at least 2 players to choose a formation.')).toBeInTheDocument()
  })

  it('lines the players up in the formation chosen, and saves it', async () => {
    await open()
    add(['Ali', 'Sami', 'Omar'])
    expect(formationButton()).toBeEnabled()
    expect(formationButton()).toHaveAccessibleName('Formation')
    apply('1-1')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(at('Omar')).toEqual(['50%', '92%'])
    expect(at('Sami')).toEqual(['50%', '74%'])
    expect(at('Ali')).toEqual(['50%', '20%'])
    expect(formationButton()).toHaveAccessibleName('Formation: 1-1')

    saveAs('Friday')
    await waitFor(() => expect(writes('lineup_players', 'upsert')).toHaveLength(1))
    expect(writes('lineups', 'insert')[0].values).toEqual(expect.objectContaining({ name: 'Friday', formation: '1-1' }))
    expect(writes('lineup_players', 'upsert')[0].values).toEqual(expect.arrayContaining([
      expect.objectContaining({ player_id: 'omar', x: 0.5, y: 0.92, bench_order: null }),
      expect.objectContaining({ player_id: 'sami', x: 0.5, y: 0.74, bench_order: null }),
      expect.objectContaining({ player_id: 'ali', x: 0.5, y: 0.2, bench_order: null }),
    ]))
  })

  it('forgets the formation when the number on the pitch changes', async () => {
    await open()
    add(['Omar', 'Sami', 'Ali'])
    apply('1-1')
    add(['Hadi'])
    expect(formationButton()).toHaveAccessibleName('Formation')

    apply('1-1-1')
    expect(formationButton()).toHaveAccessibleName('Formation: 1-1-1')
    fireEvent.click(button('Take Hadi off the pitch'))
    expect(formationButton()).toHaveAccessibleName('Formation')
  })

  it('keeps the formation when a player is dragged', async () => {
    await open()
    add(['Omar', 'Sami', 'Ali'])
    apply('1-1')
    fireEvent.pointerDown(button('Ali'), { pointerId: 1, clientX: 100, clientY: 60 })
    fireEvent.pointerUp(button('Ali'), { pointerId: 1, clientX: 40, clientY: 90 })
    expect(at('Ali')).toEqual(['20%', '30%'])
    expect(formationButton()).toHaveAccessibleName('Formation: 1-1')
  })

  it('has no formation for more than eleven, until the others move to the substitutes', async () => {
    await open()
    add(['Omar', 'Sami', 'Ali', ...extras])
    expect(formationButton()).toBeDisabled()
    expect(screen.getByText('A formation takes up to 11 players. Move the others to the substitutes.')).toBeInTheDocument()

    fireEvent.click(button('Move Extra 9 to substitutes'))
    expect(formationButton()).toBeEnabled()
    expect(bench()).toEqual(['Substitute: Extra 9'])
    expect(screen.queryByRole('button', { name: 'Extra 9' })).not.toBeInTheDocument()
  })

  it('does not show a saved formation that no longer fits the players on the pitch', async () => {
    resetDb(saved({ formation: '4-4-2' }))
    await open('/admin/eagles/lineups/b1')
    expect(formationButton()).toHaveAccessibleName('Formation')
    expect(formationButton()).toBeEnabled()
  })

  it('opens a board whose stored formation is damaged, without one', async () => {
    resetDb(saved({ formation: 'abc' }))
    await open('/admin/eagles/lineups/b1')
    expect(formationButton()).toHaveAccessibleName('Formation')
    expect(at('Ali')).toEqual(['50%', '20%'])
  })
})

describe('substitutes', () => {
  it('adds substitutes beside the pitch, not on it', async () => {
    await open()
    add(['Omar', 'Ali'])
    expect(screen.queryByRole('list', { name: 'Substitutes' })).not.toBeInTheDocument()

    fireEvent.click(button(/Add substitutes/))
    expect(screen.getByRole('dialog', { name: 'Add substitutes' })).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    add(['Hadi'], /Add substitutes/)

    expect(bench()).toEqual(['Substitute: Hadi'])
    expect(screen.queryByRole('button', { name: 'Hadi' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Take Hadi off the pitch' })).not.toBeInTheDocument()
    expect(offered(/Add players/, 'Hadi')).toBe(false)
    expect(offered(/Add substitutes/, 'Hadi')).toBe(false)
    expect(offered(/Add substitutes/, 'Sami')).toBe(true)
  })

  it('swaps a substitute with a player on the pitch, on the same spot', async () => {
    await open()
    add(['Omar', 'Sami', 'Ali'])
    apply('1-1')
    add(['Hadi'], /Add substitutes/)

    fireEvent.click(button('Substitute: Hadi'))
    const dialog = screen.getByRole('dialog', { name: 'Swap Hadi' })
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(3)
    fireEvent.click(within(dialog).getByRole('button', { name: /^Ali/ }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(at('Hadi')).toEqual(['50%', '20%'])
    expect(bench()).toEqual(['Substitute: Ali'])
    expect(screen.queryByRole('button', { name: 'Ali' })).not.toBeInTheDocument()
    expect(formationButton()).toHaveAccessibleName('Formation: 1-1')
  })

  it('puts a substitute on the pitch, and removes one from the board', async () => {
    await open()
    add(['Omar', 'Ali'])
    add(['Hadi', 'Sami'], /Add substitutes/)

    fireEvent.click(button('Substitute: Hadi'))
    fireEvent.click(button('Put on the pitch'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(button('Hadi')).toBeInTheDocument()
    expect(bench()).toEqual(['Substitute: Sami'])

    fireEvent.click(button('Substitute: Sami'))
    fireEvent.click(button('Remove'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Substitutes' })).not.toBeInTheDocument()
    expect(offered(/Add players/, 'Sami')).toBe(true)
  })

  it('takes a guest as a substitute, and saves their place', async () => {
    await open()
    fireEvent.click(button(/Add substitutes/))
    fireEvent.change(screen.getByPlaceholderText('Guest name'), { target: { value: 'Khalil' } })
    fireEvent.click(button('Add guest'))
    expect(bench()).toEqual(['Substitute: Khalil'])
    expect(screen.queryByRole('button', { name: 'Khalil (guest)' })).not.toBeInTheDocument()

    saveAs('With a guest')
    await waitFor(() => expect(writes('lineups', 'insert')).toHaveLength(1))
    expect((writes('lineups', 'insert')[0].values as { guests: unknown }).guests).toEqual([expect.objectContaining({ name: 'Khalil', bench: 0 })])
  })

  it('opens a saved board as it was, and saves it back the same', async () => {
    resetDb(saved(
      { guests: [{ id: 'g1', name: 'Khalil', x: 0.1, y: 0.1, bench: 2 }] },
      // Zaid was made inactive after he was put on the bench
      [spot('hadi', 0.3, 0.3, 1), spot('zaid', 0.4, 0.4, 0)],
    ))
    await open('/admin/eagles/lineups/b1')
    expect(formationButton()).toHaveAccessibleName('Formation: 1-1')
    expect(bench()).toEqual(['Substitute: Zaid', 'Substitute: Hadi', 'Substitute: Khalil'])
    expect(screen.queryByRole('button', { name: 'Zaid' })).not.toBeInTheDocument()

    saveAs('Saved again')
    await waitFor(() => expect(writes('lineup_players', 'upsert')).toHaveLength(1))
    const update = writes('lineups', 'update')[0].values as { formation: unknown; guests: unknown }
    expect(update.formation).toBe('1-1')
    expect(update.guests).toEqual([{ id: 'g1', name: 'Khalil', x: 0.1, y: 0.1, bench: 2 }])
    expect(writes('lineup_players', 'upsert')[0].values).toEqual(expect.arrayContaining([
      expect.objectContaining({ player_id: 'zaid', bench_order: 0 }),
      expect.objectContaining({ player_id: 'hadi', bench_order: 1 }),
      expect.objectContaining({ player_id: 'omar', bench_order: null }),
    ]))
    expect(writes('lineup_players', 'upsert')[0].values).toHaveLength(5)
    expect(writes('lineup_players', 'delete')).toHaveLength(0)
  })

  it('shares the formation and the substitutes with the image', async () => {
    resetDb(saved({}, [spot('hadi', 0.3, 0.3, 0)]))
    await open('/admin/eagles/lineups/b1')
    fireEvent.click(button(/Share image/))
    await waitFor(() => expect(drawBoardImage).toHaveBeenCalled())
    const data = vi.mocked(drawBoardImage).mock.calls[0][0]
    expect(data.subtitle).toBe('3 players · 1-1 · 1 substitute')
    expect(data.players.map((p) => p.name).sort()).toEqual(['Ali', 'Omar', 'Sami'])
    expect(data.substitutes).toEqual([expect.objectContaining({ name: 'Hadi' })])
    expect(data.substitutesTitle).toBe('Substitutes')
  })

  it('shares a board with neither as before', async () => {
    resetDb(saved({ formation: null }))
    await open('/admin/eagles/lineups/b1')
    fireEvent.click(button(/Share image/))
    await waitFor(() => expect(drawBoardImage).toHaveBeenCalled())
    const data = vi.mocked(drawBoardImage).mock.calls[0][0]
    expect(data.subtitle).toBe('3 players')
    expect(data.substitutes).toEqual([])
  })
})

it('is in Arabic when the app is', async () => {
  await inArabic(async () => {
    show()
    expect(await screen.findByRole('button', { name: 'التشكيلة' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /أضف بدلاء/ })).toBeInTheDocument()
  })
})
