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
  expect(links.map((l) => l.textContent)).toEqual(['Home', 'Players', 'History', 'Training plan', 'Coach Board', "Coach's schedule"])
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

it('the phone tab bar splits its full width between the tabs it has', () => {
  const bar = renderAt('/admin/eagles/home')
  const nav = bar.getAllByRole('link')[0].closest('nav') as HTMLElement
  expect(nav.style.gridTemplateColumns).toBe('repeat(6, minmax(0, 1fr))')
})

it('the phone tab bar has three equal columns without the coach board', () => {
  const bar = renderAt('/admin/eagles/home', ['cards'])
  const nav = bar.getAllByRole('link')[0].closest('nav') as HTMLElement
  expect(nav.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))')
})

it('with training only there are four tabs, and Training is current inside a training', () => {
  const nav = renderAt('/admin/eagles/trainings/t1', ['training'])
  const links = nav.getAllByRole('link')
  expect(links.map((l) => l.textContent)).toEqual(['Home', 'Players', 'History', 'Training plan'])
  expect(nav.getByRole('link', { name: 'Training plan' })).toHaveAttribute('href', '/admin/eagles/trainings')
  expect(nav.getByRole('link', { name: 'Training plan' })).toHaveAttribute('aria-current', 'page')
  expect(nav.getByRole('link', { name: 'History' })).not.toHaveAttribute('aria-current')
})

it('with the schedule only there are four tabs, and Schedule is current on its page', () => {
  const nav = renderAt('/admin/eagles/schedule', ['schedule'])
  expect(nav.getAllByRole('link').map((l) => l.textContent)).toEqual(['Home', 'Players', 'History', "Coach's schedule"])
  expect(nav.getByRole('link', { name: "Coach's schedule" })).toHaveAttribute('href', '/admin/eagles/schedule')
  expect(nav.getByRole('link', { name: "Coach's schedule" })).toHaveAttribute('aria-current', 'page')
  expect(nav.getByRole('link', { name: 'History' })).not.toHaveAttribute('aria-current')
  // A long name goes onto a second line on a phone instead of being cut off
  const label = nav.getByText("Coach's schedule")
  expect(label).toHaveClass('line-clamp-2')
  expect(label).not.toHaveClass('truncate')
})
