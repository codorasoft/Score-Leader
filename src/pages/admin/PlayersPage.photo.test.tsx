import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, beforeAll } from 'vitest'

const update = vi.fn()
const OLD = 'https://x.supabase.co/storage/v1/object/public/player-photos/players/p1-1.jpg'
const NEW = 'https://x.supabase.co/storage/v1/object/public/player-photos/players/p1-2.jpg'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({
        data: [{ id: 'p1', name: 'Ali', position: 'MID', skill_rating: 3, photo_url: OLD, is_active: true, created_at: '' }],
      }) }) }),
      update: (payload: unknown) => { update(payload); return { eq: () => Promise.resolve({ error: null }) } },
    }),
  },
}))

const uploadPlayerPhoto = vi.fn().mockResolvedValue(NEW)
const deletePlayerPhoto = vi.fn().mockResolvedValue(undefined)
vi.mock('../../lib/playerPhoto', () => ({
  uploadPlayerPhoto: (...a: unknown[]) => uploadPlayerPhoto(...a),
  deletePlayerPhoto: (...a: unknown[]) => deletePlayerPhoto(...a),
}))

// The real adjuster needs a loaded image; this stand-in returns a finished photo
const CROPPED = new Blob(['cropped'], { type: 'image/jpeg' })
vi.mock('../../components/PhotoCropper', () => ({
  PhotoCropper: ({ src, onDone }: { src: string; onDone: (b: Blob) => void }) =>
    <button onClick={() => onDone(CROPPED)}>adjusting {src}</button>,
}))

import PlayersPage from './PlayersPage'

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
})

it('opens the adjuster for a chosen photo, uploads the adjusted photo and deletes the old file', async () => {
  render(<MemoryRouter><PlayersPage /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Ali' }))

  const file = new File(['x'], 'me.jpg', { type: 'image/jpeg' })
  fireEvent.change(screen.getByLabelText(/Change photo/), { target: { files: [file] } })
  fireEvent.click(screen.getByRole('button', { name: 'adjusting blob:preview' }))
  // The preview is decorative (alt=""), so look it up by its source
  expect(document.querySelector('img[src="blob:preview"]')).not.toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ photo_url: NEW })))
  expect(uploadPlayerPhoto).toHaveBeenCalledWith('p1', CROPPED)
  expect(deletePlayerPhoto).toHaveBeenCalledWith(OLD)
})

it('removes a photo and deletes its file', async () => {
  update.mockClear()
  deletePlayerPhoto.mockClear()
  render(<MemoryRouter><PlayersPage /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Ali' }))
  fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ photo_url: null })))
  expect(deletePlayerPhoto).toHaveBeenCalledWith(OLD)
})

it('re-opens the saved photo in the adjuster', async () => {
  render(<MemoryRouter><PlayersPage /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Ali' }))
  fireEvent.click(screen.getByRole('button', { name: /Adjust/ }))
  expect(screen.getByRole('button', { name: `adjusting ${OLD}` })).toBeInTheDocument()
})
