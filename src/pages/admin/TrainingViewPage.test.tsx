import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'
import { db, resetDb } from '../../test/fakeSupabase'

vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)

import TrainingViewPage from './TrainingViewPage'

const data = () => ({
  training_types: [
    { id: 't1', name: 'Passing', sort_order: 0 },
    { id: 't2', name: 'Shooting', sort_order: 1 },
  ],
  training_videos: [
    { id: 'v1', type_id: 't1', title: 'Rondo', youtube_id: 'dQw4w9WgXcQ', sort_order: 0 },
    { id: 'v3', type_id: 't2', title: 'Volleys', youtube_id: 'abcdefghijk', sort_order: 0 },
  ],
  trainings: [
    { id: 'x1', league_id: 'L1', training_date: '2026-10-10', title: 'Friday' },
    { id: 'x2', league_id: 'L1', training_date: '2026-10-12', title: null },
    { id: 'x3', league_id: 'L2', training_date: '2026-10-12', title: 'Not ours' },
  ],
  training_items: [
    { training_id: 'x1', video_id: 'v1', position: 1, league_id: 'L1' },
    { training_id: 'x1', video_id: 'v3', position: 0, league_id: 'L1' },
    { training_id: 'x3', video_id: 'v1', position: 0, league_id: 'L2' },
  ],
})

const renderAt = (id: string) => render(
  <MemoryRouter initialEntries={[`/admin/eagles/trainings/${id}`]}>
    <InLeague>
      <Routes><Route path="/admin/:slug/trainings/:trainingId" element={<TrainingViewPage />} /></Routes>
    </InLeague>
  </MemoryRouter>,
)

describe('TrainingViewPage', () => {
  it('shows the training and its videos, numbered in the saved order, with their types', async () => {
    resetDb(data())
    renderAt('x1')
    expect(await screen.findByRole('heading', { name: 'Friday' })).toBeInTheDocument()
    expect(screen.getByText('Sat, Oct 10, 2026')).toBeInTheDocument()
    const [first, second] = screen.getAllByRole('listitem')
    expect(first).toHaveTextContent(/^1/)
    expect(within(first).getByText('Volleys')).toBeInTheDocument()
    expect(within(first).getByText('Shooting')).toBeInTheDocument()
    expect(second).toHaveTextContent(/^2/)
    expect(within(second).getByText('Rondo')).toBeInTheDocument()
    expect(within(second).getByText('Passing')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/admin/eagles/trainings/x1/edit')
    expect(screen.getByRole('link', { name: /Training/ })).toHaveAttribute('href', '/admin/eagles/trainings')
    // ‹ and › turn round by themselves in Arabic; flipping them again would point them the wrong way
    expect(document.querySelector('[class*="scale-x"]')).toBeNull()
  })

  it('plays one video at a time, in the page', async () => {
    resetDb(data())
    renderAt('x1')
    fireEvent.click(await screen.findByRole('button', { name: 'Play Volleys' }))
    expect(document.querySelectorAll('iframe')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Play Rondo' }))
    const frames = document.querySelectorAll('iframe')
    expect(frames).toHaveLength(1)
    expect(frames[0]).toHaveAttribute('title', 'Rondo')
    expect(screen.getByRole('button', { name: 'Play Volleys' })).toBeInTheDocument()
  })

  it('a training without a title is headed by its day, and without videos says so', async () => {
    resetDb(data())
    renderAt('x2')
    expect(await screen.findByRole('heading', { name: 'Mon, Oct 12, 2026' })).toBeInTheDocument()
    expect(screen.getByText('No videos in this training')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/admin/eagles/trainings/x2/edit')
  })

  it.each(['x3', 'nope'])('training %s is not found in this league', async (id) => {
    resetDb(data())
    renderAt(id)
    expect(await screen.findByText('Page not found')).toBeInTheDocument()
    expect(screen.queryByText('Not ours')).not.toBeInTheDocument()
  })

  it('offers a retry when the training cannot be loaded', async () => {
    resetDb(data())
    db.errors.trainings = { message: 'offline' }
    renderAt('x1')
    expect(await screen.findByText('Could not load. Check your connection.')).toBeInTheDocument()
    db.errors = {}
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { name: 'Friday' })).toBeInTheDocument()
  })
})
