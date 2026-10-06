import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../test/league'
import { FEATURES, type FeatureKey } from '../lib/features'

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ signOut: vi.fn() }) }))
vi.mock('../contexts/MyLeaguesContext', () => ({
  useMyLeagues: () => ({
    leagues: [{ id: 'L1', owner_id: 'u1', name: 'Eagles', slug: 'eagles', logo_url: null, created_at: '' }],
    profile: { max_leagues: 1 },
    refresh: vi.fn(),
  }),
}))

import AdminLayout from './AdminLayout'

function renderAt(path: string, features: readonly FeatureKey[] = FEATURES) {
  render(<MemoryRouter initialEntries={[path]}><InLeague features={features}><AdminLayout /></InLeague></MemoryRouter>)
  // The mobile bar lists every tab once; use it so desktop and mobile links aren't counted twice
  return within(screen.getAllByRole('navigation').at(-1)!)
}

it('Home is the first tab and is marked current on the home page', () => {
  const nav = renderAt('/admin/eagles/home')
  const links = nav.getAllByRole('link')
  // No New Session tab: sessions start from Home
  expect(links.map((l) => l.textContent)).toEqual(['Home', 'Players', 'History', 'Coach Board'])
  expect(links[0]).toHaveAttribute('href', '/admin/eagles/home')
  expect(links[0]).toHaveAttribute('aria-current', 'page')
})

it('History stays current inside a session', () => {
  const nav = renderAt('/admin/eagles/sessions/s1/match/m1')
  expect(nav.getByRole('link', { name: 'History' })).toHaveAttribute('aria-current', 'page')
  expect(nav.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
})

it('without the coach board there are three tabs', () => {
  const nav = renderAt('/admin/eagles/home', ['cards'])
  expect(nav.getAllByRole('link')).toHaveLength(3)
})
