import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes, useParams } from 'react-router-dom'
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

// The same pages on a router whose history can be inspected, entered from the list
function renderFromList(path: string) {
  const router = createMemoryRouter([
    { path: '/admin/:slug/trainings', element: <p>LIST</p> },
    { path: '/admin/:slug/trainings/new', element: <InLeague><TrainingBuilderPage /></InLeague> },
    { path: '/admin/:slug/trainings/:trainingId/edit', element: <InLeague><TrainingBuilderPage /></InLeague> },
    { path: '/admin/:slug/trainings/:trainingId', element: <Shown /> },
  ], { initialEntries: ['/admin/eagles/trainings', `/admin/eagles/trainings/${path}`] })
  render(<RouterProvider router={router} />)
  return router
}

// Only the date is faked, so waiting for the page still works
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
})
afterEach(() => vi.useRealTimers())

const catalogButton = (title: string) => screen.getByRole('button', { name: title })
const filter = () => within(screen.getByRole('group', { name: 'Filter by type' }))
// The catalog's video rows: every toggle button outside the filter
const catalogButtons = () => screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed') && !b.closest('[role="group"]'))
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
    expect(catalogButtons().map((b) => b.textContent)).toEqual(['Rondo', 'Wall pass', 'Volleys', 'Finishing'])
    expect(picked()).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Delete plan' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'New plan' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Training plan/ })).toHaveAttribute('href', '/admin/eagles/trainings')
    // Picking is not playing
    expect(document.querySelector('iframe')).toBeNull()
    // ‹ and › turn round by themselves in Arabic; flipping them again would point them the wrong way
    expect(document.querySelector('[class*="scale-x"]')).toBeNull()
  })

  it('the title and the date share one row', async () => {
    resetDb(data())
    renderAt('new')
    await ready()
    const title = screen.getByLabelText('Title (optional)').closest('label')!
    const date = screen.getByLabelText('Date').closest('label')!
    expect(title.parentElement).toBe(date.parentElement)
    expect([...title.parentElement!.children]).toEqual([title, date])
    // Two columns on every width, never stacked
    expect(title.parentElement).toHaveClass('grid')
    expect(title.parentElement!.className).not.toMatch(/grid-cols-1|flex-col|flex-wrap/)
  })

  // A phone's own date field does not shrink into a fixed width (and its Arabic text is long),
  // so a fixed-width date pushed the whole page sideways on real phones
  it('the date takes the width its field needs and the title shrinks into the rest', async () => {
    resetDb(data())
    renderAt('new')
    await ready()
    const title = screen.getByLabelText('Title (optional)')
    const date = screen.getByLabelText('Date')
    const row = date.closest('label')!.parentElement!
    expect(row).toHaveClass('grid-cols-[minmax(0,1fr)_auto]')
    expect(date.closest('label')!.className).not.toMatch(/(^|\s)w-\d/)
    expect(date.className).not.toMatch(/(^|\s)w-full/)
    expect(date).toHaveClass('appearance-none', 'min-w-0', 'max-w-full')
    expect(title).toHaveClass('w-full', 'min-w-0')
    // Whatever a browser still gets wrong is cut off here instead of widening the page
    expect(row.parentElement).toHaveClass('overflow-hidden')
  })

  it('the fields use 16px text, so an iPhone does not zoom the page when one is tapped', async () => {
    resetDb(data())
    renderAt('new')
    await ready()
    expect(screen.getByLabelText('Title (optional)')).toHaveClass('text-base')
    expect(screen.getByLabelText('Date')).toHaveClass('text-base')
  })

  it('offers a filter with All and one badge per type that has videos', async () => {
    resetDb(data())
    renderAt('new')
    await ready()
    const badges = filter().getAllByRole('button')
    expect(badges.map((b) => b.textContent)).toEqual(['All4', 'Passing2', 'Shooting2'])
    expect(badges.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false'])
  })

  it('a badge shows only the videos of its type, and All shows them all again', async () => {
    resetDb(data())
    renderAt('new')
    await ready()
    fireEvent.click(filter().getByRole('button', { name: /^Shooting/ }))
    expect(catalogButtons().map((b) => b.textContent)).toEqual(['Volleys', 'Finishing'])
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Shooting'])
    expect(filter().getByRole('button', { name: /^Shooting/ })).toHaveAttribute('aria-pressed', 'true')
    expect(filter().getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(filter().getByRole('button', { name: /^Passing/ }))
    expect(catalogButtons().map((b) => b.textContent)).toEqual(['Rondo', 'Wall pass'])

    fireEvent.click(filter().getByRole('button', { name: /^All/ }))
    expect(catalogButtons().map((b) => b.textContent)).toEqual(['Rondo', 'Wall pass', 'Volleys', 'Finishing'])
  })

  it('videos picked under one badge stay picked under another, and are all saved', async () => {
    resetDb(data())
    db.rpcResults.save_training = { data: 'x9', error: null }
    renderAt('new')
    await ready()
    fireEvent.click(filter().getByRole('button', { name: /^Passing/ }))
    fireEvent.click(catalogButton('Wall pass'))
    fireEvent.click(filter().getByRole('button', { name: /^Shooting/ }))
    fireEvent.click(catalogButton('Volleys'))
    expect(pickedTitles()).toEqual([expect.stringMatching(/^1.*Wall pass/), expect.stringMatching(/^2.*Volleys/)])
    fireEvent.click(filter().getByRole('button', { name: /^All/ }))
    expect(catalogButton('Wall pass')).toHaveAttribute('aria-pressed', 'true')
    expect(catalogButton('Volleys')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('VIEW x9')).toBeInTheDocument()
    expect(saveArgs()[0]).toMatchObject({ p_video_ids: ['v2', 'v3'] })
  })

  it('with no videos in the catalog there is no filter', async () => {
    resetDb({ training_types: data().training_types })
    renderAt('new')
    await screen.findByText('No videos in the catalog yet')
    expect(screen.queryByRole('group', { name: 'Filter by type' })).not.toBeInTheDocument()
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

  it('Enter in the title cannot save a half-built training: the fields are in no form', async () => {
    resetDb(data())
    renderAt('new')
    await ready()
    expect(screen.getByLabelText('Title (optional)').closest('form')).toBeNull()
    expect(screen.getByLabelText('Date').closest('form')).toBeNull()
  })

  it('after saving, Back leaves the builder behind instead of reopening an empty form', async () => {
    resetDb(data())
    db.rpcResults.save_training = { data: 'x9', error: null }
    const router = renderFromList('new')
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('VIEW x9')).toBeInTheDocument()
    expect(router.state.historyAction).toBe('REPLACE')
    await router.navigate(-1)
    expect(await screen.findByText('LIST')).toBeInTheDocument()
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

describe('TrainingBuilderPage, a long catalog', () => {
  // 25 passing videos, then 3 shooting videos
  const long = () => ({
    training_types: [
      { id: 't1', name: 'Passing', sort_order: 0 },
      { id: 't2', name: 'Shooting', sort_order: 1 },
    ],
    training_videos: [
      ...Array.from({ length: 25 }, (_, i) => ({ id: `p${i + 1}`, type_id: 't1', title: `Pass ${i + 1}`, youtube_id: 'dQw4w9WgXcQ', sort_order: i })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: `s${i + 1}`, type_id: 't2', title: `Shot ${i + 1}`, youtube_id: 'abcdefghijk', sort_order: i })),
    ],
  })
  const started = () => screen.findByRole('button', { name: 'Pass 1' })
  const shownTitles = () => catalogButtons().map((b) => b.textContent)

  it('shows the first 10 videos and says how many are left', async () => {
    resetDb(long())
    renderAt('new')
    await started()
    expect(shownTitles()).toEqual(Array.from({ length: 10 }, (_, i) => `Pass ${i + 1}`))
    expect(screen.getByRole('button', { name: 'Show more (18 left)' })).toBeInTheDocument()
    // The badges still count the whole catalog
    expect(filter().getAllByRole('button').map((b) => b.textContent)).toEqual(['All28', 'Passing25', 'Shooting3'])
  })

  it('Show more adds 10 at a time, type after type, until nothing is left', async () => {
    resetDb(long())
    renderAt('new')
    await started()
    fireEvent.click(screen.getByRole('button', { name: /^Show more/ }))
    expect(shownTitles()).toHaveLength(20)
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Passing'])
    expect(screen.getByRole('button', { name: 'Show more (8 left)' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Show more/ }))
    expect(shownTitles()).toHaveLength(28)
    expect(shownTitles().slice(-4)).toEqual(['Pass 25', 'Shot 1', 'Shot 2', 'Shot 3'])
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Passing', 'Shooting'])
    expect(screen.queryByRole('button', { name: /^Show more/ })).not.toBeInTheDocument()
  })

  it('choosing a badge starts again at 10, and a short type has no Show more', async () => {
    resetDb(long())
    renderAt('new')
    await started()
    fireEvent.click(screen.getByRole('button', { name: /^Show more/ }))
    expect(shownTitles()).toHaveLength(20)

    fireEvent.click(filter().getByRole('button', { name: /^Passing/ }))
    expect(shownTitles()).toHaveLength(10)
    expect(screen.getByRole('button', { name: 'Show more (15 left)' })).toBeInTheDocument()

    fireEvent.click(filter().getByRole('button', { name: /^Shooting/ }))
    expect(shownTitles()).toEqual(['Shot 1', 'Shot 2', 'Shot 3'])
    expect(screen.queryByRole('button', { name: /^Show more/ })).not.toBeInTheDocument()

    fireEvent.click(filter().getByRole('button', { name: /^All/ }))
    expect(shownTitles()).toHaveLength(10)
  })

  it('a picked video that is not shown yet stays picked and is saved', async () => {
    resetDb({ ...long(), trainings: [{ id: 'x1', league_id: 'L1', training_date: '2026-10-10', title: 'Friday' }],
      training_items: [{ training_id: 'x1', video_id: 's3', position: 0, league_id: 'L1' }] })
    db.rpcResults.save_training = { data: 'x1', error: null }
    renderAt('x1/edit')
    await started()
    expect(screen.queryByRole('button', { name: 'Shot 3' })).not.toBeInTheDocument()
    expect(pickedTitles()).toEqual([expect.stringMatching(/^1.*Shot 3/)])
    fireEvent.click(catalogButton('Pass 2'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('VIEW x1')).toBeInTheDocument()
    expect(saveArgs()[0]).toMatchObject({ p_video_ids: ['s3', 'p2'] })
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
    fireEvent.click(screen.getByRole('button', { name: 'Delete plan' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Delete this plan?')).toBeInTheDocument()
    expect(rows('trainings').map((t) => t.id)).toContain('x1')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete plan' }))
    expect(await screen.findByText('LIST')).toBeInTheDocument()
    expect(rows('trainings').map((t) => t.id)).toEqual(['x3'])
  })

  it('after deleting, Back does not return to the deleted training', async () => {
    resetDb(data())
    const router = renderFromList('x1/edit')
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Delete plan' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete plan' }))
    expect(await screen.findByText('LIST')).toBeInTheDocument()
    expect(router.state.historyAction).toBe('REPLACE')
  })

  it.each(['x3/edit', 'nope/edit'])('%s is not found in this league', async (path) => {
    resetDb(data())
    renderAt(path)
    expect(await screen.findByText('Page not found')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })
})
