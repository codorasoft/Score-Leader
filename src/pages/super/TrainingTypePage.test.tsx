import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { db, resetDb, rows } from '../../test/fakeSupabase'

vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)

import TrainingTypePage from './TrainingTypePage'

const catalog = () => ({
  training_types: [
    { id: 't1', name: 'Passing', sort_order: 0, created_at: '2026-10-01T10:00:00Z' },
    { id: 't2', name: 'Shooting', sort_order: 1, created_at: '2026-10-02T10:00:00Z' },
  ],
  training_videos: [
    { id: 'v1', type_id: 't1', title: 'Rondo', youtube_id: 'dQw4w9WgXcQ', sort_order: 0, created_at: '2026-10-01T10:00:00Z' },
    { id: 'v2', type_id: 't1', title: 'Wall pass', youtube_id: 'aqz-KE-bpKQ', sort_order: 1, created_at: '2026-10-02T10:00:00Z' },
    { id: 'v3', type_id: 't2', title: 'Volleys', youtube_id: 'abcdefghijk', sort_order: 0, created_at: '2026-10-03T10:00:00Z' },
  ],
  training_items: [
    { training_id: 'x1', video_id: 'v1' }, { training_id: 'x2', video_id: 'v1' },
  ],
})

const renderAt = (typeId = 't1') => render(
  <MemoryRouter initialEntries={[`/super/training/${typeId}`]}>
    <Routes>
      <Route path="/super/training" element={<p>TYPES LIST</p>} />
      <Route path="/super/training/:typeId" element={<TrainingTypePage />} />
    </Routes>
  </MemoryRouter>,
)
const videoRow = async (title: string) => (await screen.findByText(title)).closest('li') as HTMLElement
const fillAdd = (link: string, title: string) => {
  const form = screen.getByRole('form', { name: 'Add' })
  fireEvent.change(within(form).getByLabelText('YouTube link'), { target: { value: link } })
  fireEvent.change(within(form).getByLabelText('Video title'), { target: { value: title } })
  return within(form)
}
const videoInserts = () => db.writes.filter((w) => w.table === 'training_videos' && w.op === 'insert')

describe('TrainingTypePage', () => {
  it('shows the type and only its videos, in order', async () => {
    resetDb(catalog())
    renderAt()
    expect(await screen.findByRole('heading', { name: 'Passing' })).toBeInTheDocument()
    const titles = (await screen.findAllByRole('listitem')).map((li) => li.textContent)
    expect(titles).toEqual([expect.stringContaining('Rondo'), expect.stringContaining('Wall pass')])
    expect(screen.queryByText('Volleys')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Training types/ })).toHaveAttribute('href', '/super/training')
    // ‹ and › turn round by themselves in Arabic; flipping them again would point them the wrong way
    expect(document.querySelector('[class*="scale-x"]')).toBeNull()
  })

  it('says so when the type has no videos', async () => {
    resetDb({ training_types: catalog().training_types })
    renderAt()
    expect(await screen.findByText('No videos in this type yet')).toBeInTheDocument()
  })

  it('an unknown type is not found', async () => {
    resetDb(catalog())
    renderAt('nope')
    expect(await screen.findByText('Page not found')).toBeInTheDocument()
  })

  it('refuses a link that is not a YouTube video', async () => {
    resetDb(catalog())
    renderAt()
    await videoRow('Rondo')
    const form = fillAdd('https://vimeo.com/123456', 'Finishing')
    expect(form.getByText('This is not a YouTube video link')).toBeInTheDocument()
    expect(form.getByRole('button', { name: 'Add' })).toBeDisabled()
  })

  it('previews a valid link and needs a title before it can be added', async () => {
    resetDb(catalog())
    renderAt()
    await videoRow('Rondo')
    const form = fillAdd('https://youtu.be/ZZZZZZZZZZZ', '  ')
    expect(document.querySelector('img[src="https://i.ytimg.com/vi/ZZZZZZZZZZZ/hqdefault.jpg"]')).not.toBeNull()
    expect(form.queryByText('This is not a YouTube video link')).not.toBeInTheDocument()
    expect(form.getByRole('button', { name: 'Add' })).toBeDisabled()
  })

  it('adds a video by its id at the end of the type, then clears the form', async () => {
    resetDb(catalog())
    renderAt()
    await videoRow('Rondo')
    const form = fillAdd(' https://youtu.be/ZZZZZZZZZZZ?si=abc ', ' Finishing ')
    fireEvent.click(form.getByRole('button', { name: 'Add' }))
    expect(await videoRow('Finishing')).toBeInTheDocument()
    expect(videoInserts()).toMatchObject([
      { values: { type_id: 't1', title: 'Finishing', youtube_id: 'ZZZZZZZZZZZ', sort_order: 2 } },
    ])
    expect(form.getByLabelText('YouTube link')).toHaveValue('')
    expect(form.getByLabelText('Video title')).toHaveValue('')
  })

  it('says when the video is already in this type', async () => {
    resetDb(catalog())
    renderAt()
    await videoRow('Rondo')
    db.errors.training_videos = { message: 'duplicate key value violates unique constraint', code: '23505' }
    const form = fillAdd('https://youtu.be/dQw4w9WgXcQ', 'Rondo again')
    fireEvent.click(form.getByRole('button', { name: 'Add' }))
    expect(await form.findByText('This video is already in this type')).toBeInTheDocument()
    expect(form.getByLabelText('Video title')).toHaveValue('Rondo again')
  })

  it('a second tap while the first add is still running adds nothing more', async () => {
    resetDb(catalog())
    renderAt()
    await videoRow('Rondo')
    let release = () => {}
    db.holds.training_videos = new Promise<void>((r) => { release = r })
    const form = fillAdd('https://youtu.be/ZZZZZZZZZZZ', 'Finishing')
    fireEvent.click(form.getByRole('button', { name: 'Add' }))
    expect(form.getByRole('button', { name: 'Add' })).toBeDisabled()
    fireEvent.click(form.getByRole('button', { name: 'Add' }))
    delete db.holds.training_videos
    release()
    expect(await videoRow('Finishing')).toBeInTheDocument()
    expect(videoInserts()).toHaveLength(1)
  })

  it('deleting a video says how many trainings use it, and removes it on confirm', async () => {
    resetDb(catalog())
    renderAt()
    fireEvent.click(within(await videoRow('Rondo')).getByRole('button', { name: 'Delete video' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Delete “Rondo”?')).toBeInTheDocument()
    expect(await within(dialog).findByText('Used in 2 trainings; it will be removed from them.')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete video' }))
    await waitFor(() => expect(screen.queryByText('Rondo')).not.toBeInTheDocument())
    expect(rows('training_videos').map((v) => v.id)).toEqual(['v2', 'v3'])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('the video cannot be deleted before its use count is known', async () => {
    resetDb(catalog())
    renderAt()
    const row = await videoRow('Rondo')
    let release = () => {}
    db.holds.training_items = new Promise<void>((r) => { release = r })
    fireEvent.click(within(row).getByRole('button', { name: 'Delete video' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Delete video' })).toBeDisabled()
    delete db.holds.training_items
    release()
    expect(await within(dialog).findByText('Used in 2 trainings; it will be removed from them.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Delete video' })).toBeEnabled()
  })

  it('when the use count cannot be read, the video can still be deleted', async () => {
    resetDb(catalog())
    renderAt()
    const row = await videoRow('Rondo')
    db.errors.training_items = { message: 'offline' }
    fireEvent.click(within(row).getByRole('button', { name: 'Delete video' }))
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Delete video' })).toBeEnabled())
    expect(within(dialog).queryByText(/Used in/)).not.toBeInTheDocument()
  })

  it('deleting an unused video mentions no trainings, and Cancel keeps it', async () => {
    resetDb(catalog())
    renderAt()
    fireEvent.click(within(await videoRow('Wall pass')).getByRole('button', { name: 'Delete video' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Delete “Wall pass”?')).toBeInTheDocument()
    await waitFor(() => expect(db.reads).toBeGreaterThan(2))
    expect(within(dialog).queryByText(/Used in/)).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(rows('training_videos')).toHaveLength(3)
  })

  it('edits a video’s title and link', async () => {
    resetDb(catalog())
    renderAt()
    const row = await videoRow('Rondo')
    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }))
    expect(within(row).getByLabelText('YouTube link')).toHaveValue('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    fireEvent.change(within(row).getByLabelText('Video title'), { target: { value: 'Rondo 4v2' } })
    fireEvent.change(within(row).getByLabelText('YouTube link'), { target: { value: 'https://youtu.be/YYYYYYYYYYY' } })
    fireEvent.click(within(row).getByRole('button', { name: 'Save' }))
    expect(await videoRow('Rondo 4v2')).toBeInTheDocument()
    expect(rows('training_videos').find((v) => v.id === 'v1')).toMatchObject({ title: 'Rondo 4v2', youtube_id: 'YYYYYYYYYYY', type_id: 't1' })
  })

  it('does not save an edit with a bad link', async () => {
    resetDb(catalog())
    renderAt()
    const row = await videoRow('Rondo')
    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }))
    fireEvent.change(within(row).getByLabelText('YouTube link'), { target: { value: 'nope' } })
    expect(within(row).getByText('This is not a YouTube video link')).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('moves a video down by swapping places with the next one', async () => {
    resetDb(catalog())
    renderAt()
    fireEvent.click(within(await videoRow('Rondo')).getByRole('button', { name: 'Move down' }))
    await waitFor(() => expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Wall pass'))
    expect(rows('training_videos').find((v) => v.id === 'v1')).toMatchObject({ sort_order: 1 })
    expect(rows('training_videos').find((v) => v.id === 'v2')).toMatchObject({ sort_order: 0 })
  })

  it('renames the type', async () => {
    resetDb(catalog())
    renderAt()
    await screen.findByRole('heading', { name: 'Passing' })
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    fireEvent.change(screen.getByLabelText('Type name'), { target: { value: ' Short passing ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('heading', { name: 'Short passing' })).toBeInTheDocument()
    expect(rows('training_types').find((t) => t.id === 't1')).toMatchObject({ name: 'Short passing' })
  })

  it('deletes the type after saying how many videos go with it', async () => {
    resetDb(catalog())
    renderAt()
    await screen.findByRole('heading', { name: 'Passing' })
    fireEvent.click(screen.getByRole('button', { name: 'Delete type' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Delete “Passing” and its 2 videos?')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete type' }))
    expect(await screen.findByText('TYPES LIST')).toBeInTheDocument()
    expect(rows('training_types').map((t) => t.id)).toEqual(['t2'])
  })

  it('after deleting the type, Back does not return to the deleted type', async () => {
    resetDb(catalog())
    const router = createMemoryRouter([
      { path: '/super/training', element: <p>TYPES LIST</p> },
      { path: '/super/training/:typeId', element: <TrainingTypePage /> },
    ], { initialEntries: ['/super/training', '/super/training/t1'] })
    render(<RouterProvider router={router} />)
    await screen.findByRole('heading', { name: 'Passing' })
    fireEvent.click(screen.getByRole('button', { name: 'Delete type' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete type' }))
    expect(await screen.findByText('TYPES LIST')).toBeInTheDocument()
    expect(router.state.historyAction).toBe('REPLACE')
  })

  it('plays one video at a time', async () => {
    resetDb(catalog())
    renderAt()
    await videoRow('Rondo')
    fireEvent.click(screen.getByRole('button', { name: 'Play Rondo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Play Wall pass' }))
    const frames = document.querySelectorAll('iframe')
    expect(frames).toHaveLength(1)
    expect(frames[0]).toHaveAttribute('title', 'Wall pass')
    expect(screen.getByRole('button', { name: 'Play Rondo' })).toBeInTheDocument()
  })

  it('offers a retry when the catalog cannot be loaded', async () => {
    resetDb(catalog())
    db.errors.training_videos = { message: 'offline' }
    renderAt()
    expect(await screen.findByText('Could not load. Check your connection.')).toBeInTheDocument()
    db.errors = {}
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { name: 'Passing' })).toBeInTheDocument()
  })
})
