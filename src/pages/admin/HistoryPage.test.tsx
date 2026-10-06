import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'

const eq = vi.fn().mockResolvedValue({ error: null })
const update = vi.fn(() => ({ eq }))
const sessions = [{ id: 'S1', date: '2026-10-01', status: 'active', share_token: 'tok', league_id: 'L1' }]

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'sessions') {
        return { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: sessions }) }) }), update }
      }
      return { select: () => ({ in: () => ({ in: () => ({ order: () => Promise.resolve({ data: [] }) }) }) }) }
    },
  },
}))

import HistoryPage from './HistoryPage'

const renderPage = (features: Parameters<typeof InLeague>[0]['features']) =>
  render(<InLeague features={features}><MemoryRouter><HistoryPage /></MemoryRouter></InLeague>)

it('with awards off, Finish session completes the session', async () => {
  renderPage(['cards'])
  fireEvent.click(await screen.findByRole('button', { name: /Finish Session/ }))
  await waitFor(() => expect(update).toHaveBeenCalledWith({ status: 'completed' }))
  expect(eq).toHaveBeenCalledWith('id', 'S1')
})

it('with awards on, shows the Awards link instead', async () => {
  renderPage(['awards'])
  expect(await screen.findByRole('link', { name: /Awards/ })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Finish Session/ })).not.toBeInTheDocument()
})
