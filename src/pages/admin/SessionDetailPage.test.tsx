import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'

const h = vi.hoisted(() => ({ sessionLeague: 'OTHER', eqCalls: [] as [string, unknown][] }))

// The mock only returns the session when the league filter matches its owner.
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const filters: Record<string, unknown> = {}
      const chain: Record<string, unknown> = {
        select: () => chain,
        order: () => chain,
        in: () => chain,
        eq: (col: string, val: unknown) => {
          filters[col] = val
          if (table === 'sessions') h.eqCalls.push([col, val])
          return chain
        },
        single: async () =>
          table === 'sessions' && filters.league_id === h.sessionLeague
            ? { data: { id: 's1', date: '2026-10-01', league_id: h.sessionLeague, share_token: 't', status: 'completed' } }
            : { data: null },
        then: (resolve: (v: unknown) => void) => resolve({ data: [] }),
      }
      return chain
    },
  },
}))

import { InLeague } from '../../test/league'
import SessionDetailPage from './SessionDetailPage'

const renderPage = () =>
  render(
    <InLeague><MemoryRouter initialEntries={['/admin/eagles/sessions/s1']}>
      <Routes>
        <Route path="/admin/eagles/sessions/:sessionId" element={<SessionDetailPage />} />
        <Route path="/admin/eagles/history" element={<p>history page</p>} />
      </Routes>
    </MemoryRouter></InLeague>,
  )

it("redirects to history when the session belongs to another league", async () => {
  h.sessionLeague = 'OTHER'
  renderPage()
  expect(await screen.findByText('history page')).toBeInTheDocument()
  expect(h.eqCalls).toContainEqual(['league_id', 'L1'])
})

it('shows the session when it belongs to the current league', async () => {
  h.sessionLeague = 'L1'
  renderPage()
  expect(await screen.findByText('2026-10-01')).toBeInTheDocument()
  expect(screen.queryByText('history page')).not.toBeInTheDocument()
})
