import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'
import { db, resetDb, rows } from '../../test/fakeSupabase'

vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)

import TrainingBuilderPage from './TrainingBuilderPage'

const data = () => ({
  training_types: [
    { id: 't2', name: 'Shooting', sort_order: 1 },
    { id: 't1', name: 'Passing', sort_order: 0 },
    { id: 't3', name: 'Empty type', sort_order: 2 },
  ],
  training_videos: [
    { id: 'v1', type_id: 't1', title: 'Rondo', youtube_id: 'dQw4w9WgXcQ', sort_order: 0 },
    { id: 'v2', type_id: 't1', title: 'Wall pass', youtube_id: 'aqz-KE-bpKQ', sort_order: 1 },
    { id: 'v3', type_id: 't2', title: 'Volleys', youtube_id: 'abcdefghijk', sort_order: 0 },
    { id: 'v4', type_id: 't2', title: 'Finishing', youtube_id: 'ZZZZZZZZZZZ', sort_order: 1 },
  ],
  trainings: [
    { id: 'x1', league_id: 'L1', training_date: '2026-10-10', title: 'Friday' },
    { id: 'x3', league_id: 'L2', training_date: '2026-10-12', title: 'Not ours' },
  ],
  training_items: [
    { training_id: 'x1', video_id: 'v1', position: 1, league_id: 'L1' },
    { training_id: 'x1', video_id: 'v3', position: 0, league_id: 'L1' },
  ],
})

function Shown() {
  return <p>VIEW {useParams().trainingId}</p>
}

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[`/admin/eagles/trainings/${path}`]}>
    <InLeague>
      <Routes>
        <Route path="/admin/:slug/trainings" element={<p>LIST</p>} />
        <Route path="/admin/:slug/trainings/new" element={<TrainingBuilderPage />} />
        <Route path="/admin/:slug/trainings/:trainingId/edit" element={<TrainingBuilderPage />} />
        <Route path="/admin/:slug/trainings/:trainingId" element={<Shown />} />
      </Routes>
    </InLeague>
  </MemoryRouter>,
)

// Only the date is faked, so waiting for the page still works
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
})
afterEach(() => vi.useRealTimers())

const catalogButton = (title: string) => screen.getByRole('button', { name: title })
const picked = () => within(screen.getByRole('list', { name: 'Picked videos' })).queryAllByRole('listitem')
const pickedTitles = () => picked().map((li) => li.textContent)
const ready = () => screen.findByRole('button', { name: 'Rondo' })
const saveArgs = () => db.rpcs.filter((c) => c.fn === 'save_training').map((c) => c.args)

describe('TrainingBuilderPage, new training', () => {
  it("starts on today's date with the catalog grouped by type, in catalog order", async () => {
    resetDb(data())
    renderAt('new')
    await ready()
    expect(screen.getByLabelText('Date')).toHaveValue('2026-10-12')
    expect(screen.getByLabelText('Title (optional)')).toHaveValue('')
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Passing', 'Shooting'])
    expect(screen.getAllByRole('button', { pressed: false }).map((b) => b.textContent)).toEqual(['Rondo', 'Wall pass', 'Volleys', 'Finishing'])
    expect(picked()).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Delete training' })).not.toBeInTheDocument()
    // Picking is not playing
    expect(document.querySelector('iframe')).toBeNull()
  })

  it('says so when the catalog has no videos', async () => {
    resetDb({ training_types: data().training_types })
    renderAt('new')
    expect(await screen.findByText('No videos in the catalog yet')).toBeInTheDocument()
  })

  it('picks videos in the order they are tapped, and unpicks on a second tap', async () => {
    resetDb(data())
    renderAt('new')
    await ready()
    fireEvent.click(catalogButton('Wall pass'))
    fireEvent.click(catalogButton('Rondo'))
    expect(pickedTitles()).toEqual([expect.stringMatching(/^1.*Wall pass/), expect.stringMatching(/^2.*Rondo/)])
    expect(catalogButton('Wall pass')).toHaveAttribute('aria-pressed', 'true')
    expect(catalogButton('Rondo')).toHaveAttribute('aria-pressed', 'true')
    expect(catalogButton('Volleys')).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(catalogButton('Wall pass'))
    expect(pickedTitles()).toEqual([expect.stringMatching(/^1.*Rondo/)])
    expect(catalogButton('Wall pass')).toHaveAttribute('aria-pressed', 'false')
  })

  it('removes and reorders the picked videos', async () => {
    resetDb(data())
    renderAt('new')
    await ready()
    for (const title of ['Rondo', 'Wall pass', 'Volleys']) fireEvent.click(catalogButton(title))
    fireEvent.click(within(picked()[2]).getByRole('button', { name: 'Move up' }))
    expect(pickedTitles()).toEqual([expect.stringContaining('Rondo'), expect.stringContaining('Volleys'), expect.stringContaining('Wall pass')])
    fireEvent.click(within(picked()[0]).getByRole('button', { name: 'Move down' }))
    expect(pickedTitles()).toEqual([expect.stringContaining('Volleys'), expect.stringContaining('Rondo'), expect.stringContaining('Wall pass')])
    fireEvent.click(within(picked()[1]).getByRole('button', { name: 'Remove' }))
    expect(pickedTitles()).toEqual([expect.stringMatching(/^1.*Volleys/), expect.stringMatching(/^2.*Wall pass/)])
    expect(catalogButton('Rondo')).toHaveAttribute('aria-pressed', 'false')
    expect(within(picked()[0]).queryByRole('button', { name: 'Move up' })).not.toBeInTheDocument()
    expect(within(picked()[1]).queryByRole('button', { name: 'Move down' })).not.toBeInTheDocument()
  })

  it('saves the date, the title and the picks in order, then shows the training', async () => {
    resetDb(data())
    db.rpcResults.save_training = { data: 'x9', error: null }
    renderAt('new')
    await ready()
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-15' } })
    fireEvent.change(screen.getByLabelText('Title (optional)'), { target: { value: ' Passing day ' } })
    fireEvent.click(catalogButton('Wall pass'))
    fireEvent.click(catalogButton('Rondo'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('VIEW x9')).toBeInTheDocument()
    expect(saveArgs()).toEqual([
      { p_id: null, p_league_id: 'L1', p_date: '2026-10-15', p_title: 'Passing day', p_video_ids: ['v2', 'v1'] },
    ])
  })

  it('a title of only spaces is sent as no title, and no videos is allowed', async () => {
    resetDb(data())
    db.rpcResults.save_training = { data: 'x9', error: null }
    renderAt('new')
    await ready()
    fireEvent.change(screen.getByLabelText('Title (optional)'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('VIEW x9')).toBeInTheDocument()
    expect(saveArgs()).toEqual([{ p_id: null, p_league_id: 'L1', p_date: '2026-10-12', p_title: '', p_video_ids: [] }])
  })

  it('a second tap while the save is still running saves nothing more', async () => {
    resetDb(data())
    db.rpcResults.save_training = { data: 'x9', error: null }
    renderAt('new')
    await ready()
    let release = () => {}
    db.holds['rpc:save_training'] = new Promise<void>((r) => { release = r })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    release()
    expect(await screen.findByText('VIEW x9')).toBeInTheDocument()
    expect(saveArgs()).toHaveLength(1)
  })

  it('a refused save stays on the page with everything as it was typed', async () => {
    resetDb(data())
    db.rpcResults.save_training = { data: null, error: { message: 'new row violates row-level security policy' } }
    renderAt('new')
    await ready()
    fireEvent.change(screen.getByLabelText('Title (optional)'), { target: { value: 'Passing day' } })
    fireEvent.click(catalogButton('Volleys'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saveArgs()).toHaveLength(1))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled())
    expect(screen.queryByText(/^VIEW/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Title (optional)')).toHaveValue('Passing day')
    expect(pickedTitles()).toEqual([expect.stringContaining('Volleys')])
  })

  it('cannot be saved without a date', async () => {
    resetDb(data())
    renderAt('new')
    await ready()
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('offers a retry when the catalog cannot be loaded', async () => {
    resetDb(data())
    db.errors.training_videos = { message: 'offline' }
    renderAt('new')
    expect(await screen.findByText('Could not load. Check your connection.')).toBeInTheDocument()
    db.errors = {}
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await ready()).toBeInTheDocument()
  })
})

describe('TrainingBuilderPage, existing training', () => {
  it('opens with the saved date, title and picks in their order', async () => {
    resetDb(data())
    renderAt('x1/edit')
    await ready()
    expect(screen.getByLabelText('Date')).toHaveValue('2026-10-10')
    expect(screen.getByLabelText('Title (optional)')).toHaveValue('Friday')
    expect(pickedTitles()).toEqual([expect.stringMatching(/^1.*Volleys/), expect.stringMatching(/^2.*Rondo/)])
    expect(catalogButton('Volleys')).toHaveAttribute('aria-pressed', 'true')
    expect(catalogButton('Wall pass')).toHaveAttribute('aria-pressed', 'false')
  })

  it('saves over the same training', async () => {
    resetDb(data())
    db.rpcResults.save_training = { data: 'x1', error: null }
    renderAt('x1/edit')
    await ready()
    fireEvent.click(catalogButton('Finishing'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('VIEW x1')).toBeInTheDocument()
    expect(saveArgs()).toEqual([
      { p_id: 'x1', p_league_id: 'L1', p_date: '2026-10-10', p_title: 'Friday', p_video_ids: ['v3', 'v1', 'v4'] },
    ])
  })

  it('deletes the training after asking, and goes back to the list', async () => {
    resetDb(data())
    renderAt('x1/edit')
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Delete training' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Delete this training?')).toBeInTheDocument()
    expect(rows('trainings').map((t) => t.id)).toContain('x1')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete training' }))
    expect(await screen.findByText('LIST')).toBeInTheDocument()
    expect(rows('trainings').map((t) => t.id)).toEqual(['x3'])
  })

  it.each(['x3/edit', 'nope/edit'])('%s is not found in this league', async (path) => {
    resetDb(data())
    renderAt(path)
    expect(await screen.findByText('Page not found')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })
})
