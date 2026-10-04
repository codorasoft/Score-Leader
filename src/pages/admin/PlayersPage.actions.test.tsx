import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

const update = vi.fn()
const updateEq = vi.fn().mockResolvedValue({ error: null })

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({
            data: [{ id: 'p1', name: 'Ali', position: 'MID', skill_rating: 3, photo_url: null, is_active: true, created_at: '' }],
          }),
        }),
      }),
      update: (payload: unknown) => { update(payload); return { eq: updateEq } },
    }),
  },
}))

import PlayersPage from './PlayersPage'

const renderPage = () => render(<MemoryRouter><PlayersPage /></MemoryRouter>)

it('shows separate, clearly labelled Edit and Remove buttons for each player', async () => {
  renderPage()
  expect(await screen.findByRole('button', { name: 'Edit Ali' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Remove Ali' })).toBeInTheDocument()
})

it('asks for confirmation before removing, and cancel keeps the player', async () => {
  renderPage()
  fireEvent.click(await screen.findByRole('button', { name: 'Remove Ali' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('Remove Ali?')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(update).not.toHaveBeenCalled()
})

it('removes the player only after confirming', async () => {
  renderPage()
  fireEvent.click(await screen.findByRole('button', { name: 'Remove Ali' }))
  fireEvent.click(screen.getByRole('button', { name: 'Yes, remove' }))
  await waitFor(() => expect(update).toHaveBeenCalledWith({ is_active: false }))
  expect(updateEq).toHaveBeenCalledWith('id', 'p1')
})
