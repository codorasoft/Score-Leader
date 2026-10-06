import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => Promise.resolve({ data: [] }), in: () => Promise.resolve({ data: [] }) }),
    }),
  },
}))

import AwardsPage from './AwardsPage'

const renderPage = (features: Parameters<typeof InLeague>[0]['features']) =>
  render(
    <InLeague features={features}>
      <MemoryRouter initialEntries={['/s/S1/awards']}>
        <Routes><Route path="/s/:sessionId/awards" element={<AwardsPage />} /></Routes>
      </MemoryRouter>
    </InLeague>,
  )

it('has no Open vote tab without voting', () => {
  renderPage(['awards'])
  expect(screen.getAllByRole('button', { name: 'Admin picks' }).length).toBeGreaterThan(0)
  expect(screen.queryByRole('button', { name: 'Open vote' })).not.toBeInTheDocument()
})

it('has the Open vote tab with voting', () => {
  renderPage(['awards', 'voting'])
  expect(screen.getAllByRole('button', { name: 'Open vote' }).length).toBeGreaterThan(0)
})
