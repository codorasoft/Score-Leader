import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'

const eqs: unknown[][] = []
const rows = [
  { id: 'a', date: '2026-10-01', status: 'active', share_token: 'tok-a' },
  { id: 'b', date: '2026-09-20', status: 'completed', share_token: 'tok-b' },
  { id: 'c', date: '2026-09-10', status: 'completed', share_token: 'tok-c' },
]
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => {
      let status = ''
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = (...a: unknown[]) => { eqs.push(a); if (a[0] === 'status') status = a[1] as string; return q }
      q.order = () => q
      q.limit = () => Promise.resolve({ data: rows.filter((r) => r.status === status) })
      return q
    },
  },
}))

import LeagueHomePage from './LeagueHomePage'

it('shows the active session and completed history with share links, no features needed', async () => {
  render(<MemoryRouter><InLeague features={[]}><LeagueHomePage /></InLeague></MemoryRouter>)
  await waitFor(() => expect(document.querySelector('a[href="/s/tok-a"]')).not.toBeNull())
  expect(document.querySelector('a[href="/s/tok-b"]')).not.toBeNull()
  expect(document.querySelector('a[href="/s/tok-c"]')).not.toBeNull()
  expect(screen.getByRole('heading', { name: 'Eagles' })).toBeInTheDocument()
  expect(eqs).toContainEqual(['league_id', 'L1'])
})
