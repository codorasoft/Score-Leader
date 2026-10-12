import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'
import { db, resetDb } from '../../test/fakeSupabase'

vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)

import TrainingsPage from './TrainingsPage'

const renderPage = () => render(<MemoryRouter><InLeague><TrainingsPage /></InLeague></MemoryRouter>)

const trainings = () => ({
  trainings: [
    { id: 'x1', league_id: 'L1', training_date: '2026-10-10', title: 'Friday', created_at: '2026-10-01T10:00:00Z' },
    { id: 'x2', league_id: 'L1', training_date: '2026-10-12', title: null, created_at: '2026-10-02T10:00:00Z' },
    { id: 'x3', league_id: 'L2', training_date: '2026-10-12', title: 'Not ours', created_at: '2026-10-03T10:00:00Z' },
    { id: 'x4', league_id: 'L1', training_date: '2026-10-20', title: 'Later', created_at: '2026-10-04T10:00:00Z' },
    { id: 'x5', league_id: 'L1', training_date: '2026-10-14', title: 'Shooting day', created_at: '2026-10-05T10:00:00Z' },
  ],
  training_items: [
    { training_id: 'x2', video_id: 'v1', league_id: 'L1' }, { training_id: 'x2', video_id: 'v2', league_id: 'L1' },
    { training_id: 'x2', video_id: 'v3', league_id: 'L1' }, { training_id: 'x1', video_id: 'v1', league_id: 'L1' },
  ],
})

// Only the date is faked, so waiting for the page still works
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
})
afterEach(() => vi.useRealTimers())

const trainingLinks = () => screen.getAllByRole('link').filter((l) => !l.getAttribute('href')!.endsWith('/new'))

describe('TrainingsPage', () => {
  it("shows today's training first, then upcoming, then past", async () => {
    resetDb(trainings())
    renderPage()
    await screen.findByRole('heading', { name: 'Today' })
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Today', 'Upcoming', 'Past'])
    expect(trainingLinks().map((l) => l.getAttribute('href'))).toEqual([
      '/admin/eagles/trainings/x2', '/admin/eagles/trainings/x5', '/admin/eagles/trainings/x4', '/admin/eagles/trainings/x1',
    ])
    expect(screen.queryByText('Not ours')).not.toBeInTheDocument()
  })

  it('a row shows the title, or the day when there is none, and the video count', async () => {
    resetDb(trainings())
    renderPage()
    await screen.findByRole('heading', { name: 'Today' })
    const [today, , , past] = trainingLinks()
    expect(today).toHaveTextContent('Mon, Oct 12, 2026')
    expect(today).toHaveTextContent('3 videos')
    expect(past).toHaveTextContent('Friday')
    expect(past).toHaveTextContent('Sat, Oct 10, 2026')
    expect(past).toHaveTextContent('1 video')
  })

  it('leaves out the groups that have no training', async () => {
    resetDb({ trainings: [trainings().trainings[0]] })
    renderPage()
    await screen.findByRole('heading', { name: 'Past' })
    expect(screen.queryByRole('heading', { name: 'Today' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Upcoming' })).not.toBeInTheDocument()
  })

  it('links to a new training, and says so when there is none yet', async () => {
    resetDb()
    renderPage()
    expect(await screen.findByText('No trainings yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /New training/ })).toHaveAttribute('href', '/admin/eagles/trainings/new')
  })

  it('offers a retry when the trainings cannot be loaded', async () => {
    resetDb(trainings())
    db.errors.trainings = { message: 'offline' }
    renderPage()
    expect(await screen.findByText('Could not load. Check your connection.')).toBeInTheDocument()
    expect(screen.queryByText('No trainings yet')).not.toBeInTheDocument()
    db.errors = {}
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { name: 'Today' })).toBeInTheDocument()
  })
})
