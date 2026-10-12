import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { db, resetDb, rows } from '../../test/fakeSupabase'

vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)

import TrainingTypesPage from './TrainingTypesPage'

const catalog = () => ({
  training_types: [
    { id: 't2', name: 'Shooting', sort_order: 1, created_at: '2026-10-02T10:00:00Z' },
    { id: 't1', name: 'Passing', sort_order: 0, created_at: '2026-10-01T10:00:00Z' },
  ],
  training_videos: [
    { id: 'v1', type_id: 't1', title: 'Rondo', youtube_id: 'dQw4w9WgXcQ', sort_order: 0 },
    { id: 'v2', type_id: 't1', title: 'Wall pass', youtube_id: 'aqz-KE-bpKQ', sort_order: 1 },
    { id: 'v3', type_id: 't2', title: 'Volleys', youtube_id: 'abcdefghijk', sort_order: 0 },
  ],
})

const renderPage = () => render(<MemoryRouter><TrainingTypesPage /></MemoryRouter>)
const typeLinks = () => screen.findAllByRole('link')
const inserts = () => db.writes.filter((w) => w.table === 'training_types' && w.op === 'insert')

describe('TrainingTypesPage', () => {
  it('lists the types in order with their video counts and a link to each', async () => {
    resetDb(catalog())
    renderPage()
    const links = await typeLinks()
    expect(links.map((l) => l.textContent)).toEqual([
      expect.stringContaining('Passing'), expect.stringContaining('Shooting'),
    ])
    expect(links[0]).toHaveTextContent('2 videos')
    expect(links[1]).toHaveTextContent('1 video')
    expect(links[0]).toHaveAttribute('href', '/super/training/t1')
  })

  it('says so when there are no types yet', async () => {
    resetDb()
    renderPage()
    expect(await screen.findByText('No training types yet')).toBeInTheDocument()
  })

  it('adds a type at the end of the list', async () => {
    resetDb(catalog())
    renderPage()
    await typeLinks()
    fireEvent.change(screen.getByLabelText('Type name'), { target: { value: ' Warm-up ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByRole('link', { name: /Warm-up/ })).toBeInTheDocument()
    expect(inserts()).toMatchObject([{ values: { name: 'Warm-up', sort_order: 2 } }])
    expect(screen.getByLabelText('Type name')).toHaveValue('')
    expect((await typeLinks()).at(-1)).toHaveTextContent('Warm-up')
  })

  it('does not add an empty name', async () => {
    resetDb(catalog())
    renderPage()
    await typeLinks()
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Type name'), { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
  })

  it('a second tap while the first add is still running adds nothing more', async () => {
    resetDb(catalog())
    renderPage()
    await typeLinks()
    let release = () => {}
    db.holds.training_types = new Promise<void>((r) => { release = r })
    fireEvent.change(screen.getByLabelText('Type name'), { target: { value: 'Warm-up' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    delete db.holds.training_types
    release()
    expect(await screen.findByRole('link', { name: /Warm-up/ })).toBeInTheDocument()
    expect(inserts()).toHaveLength(1)
  })

  it('moves a type down by swapping places with the next one', async () => {
    resetDb(catalog())
    renderPage()
    const [first] = await screen.findAllByRole('listitem')
    fireEvent.click(within(first).getByRole('button', { name: 'Move down' }))
    await waitFor(async () => expect((await typeLinks())[0]).toHaveTextContent('Shooting'))
    expect(rows('training_types').find((t) => t.id === 't1')).toMatchObject({ sort_order: 1 })
    expect(rows('training_types').find((t) => t.id === 't2')).toMatchObject({ sort_order: 0 })
  })

  it('the first type cannot move up and the last cannot move down', async () => {
    resetDb(catalog())
    renderPage()
    const [first, last] = await screen.findAllByRole('listitem')
    expect(within(first).queryByRole('button', { name: 'Move up' })).not.toBeInTheDocument()
    expect(within(first).getByRole('button', { name: 'Move down' })).toBeInTheDocument()
    expect(within(last).getByRole('button', { name: 'Move up' })).toBeInTheDocument()
    expect(within(last).queryByRole('button', { name: 'Move down' })).not.toBeInTheDocument()
  })

  it('offers a retry when the catalog cannot be loaded', async () => {
    resetDb(catalog())
    db.errors.training_types = { message: 'offline' }
    renderPage()
    expect(await screen.findByText('Could not load. Check your connection.')).toBeInTheDocument()
    expect(screen.queryByText('No training types yet')).not.toBeInTheDocument()
    db.errors = {}
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('link', { name: /Passing/ })).toBeInTheDocument()
  })
})
