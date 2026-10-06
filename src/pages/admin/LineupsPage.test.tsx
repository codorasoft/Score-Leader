import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'
import { resetDb } from '../../test/fakeSupabase'

vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)

import LineupsPage from './LineupsPage'

const renderPage = () => render(<MemoryRouter><InLeague><LineupsPage /></InLeague></MemoryRouter>)

it("lists this league's boards, newest first, with player counts and links", async () => {
  resetDb({
    lineups: [
      { id: 'b1', league_id: 'L1', name: 'Friday', updated_at: '2026-09-01T10:00:00Z' },
      { id: 'b2', league_id: 'L1', name: 'Cup final', updated_at: '2026-10-01T10:00:00Z' },
      { id: 'bx', league_id: 'L2', name: 'Not ours', updated_at: '2026-10-02T10:00:00Z' },
    ],
    lineup_players: [
      { lineup_id: 'b1', league_id: 'L1' }, { lineup_id: 'b1', league_id: 'L1' }, { lineup_id: 'b2', league_id: 'L1' },
    ],
  })
  renderPage()
  const links = await screen.findAllByRole('link', { name: /Friday|Cup final/ })
  expect(links.map((l) => l.textContent)).toEqual([expect.stringContaining('Cup final'), expect.stringContaining('Friday')])
  expect(links[0]).toHaveAttribute('href', '/admin/eagles/lineups/b2')
  expect(links[0]).toHaveTextContent('1 player')
  expect(links[1]).toHaveTextContent('2 players')
  expect(screen.queryByText('Not ours')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: /New board/ })).toHaveAttribute('href', '/admin/eagles/lineups/new')
})

it('says so when there are no boards yet', async () => {
  resetDb()
  renderPage()
  expect(await screen.findByText(/No saved boards yet/)).toBeInTheDocument()
})
