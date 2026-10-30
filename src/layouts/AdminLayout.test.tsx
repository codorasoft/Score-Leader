import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
// The check itself has its own tests; here only that the layout carries it
vi.mock('../components/TodayReminder', () => ({ default: () => <div data-testid="today-reminder" /> }))
vi.mock('../lib/push', () => ({ keepPushRight: vi.fn(async () => {}) }))

import { keepPushRight } from '../lib/push'
import AdminLayout from './AdminLayout'

function renderAt(path: string, features: readonly FeatureKey[] = FEATURES) {
  render(<MemoryRouter initialEntries={[path]}><InLeague features={features}><AdminLayout /></InLeague></MemoryRouter>)
  // The phone's bottom bar is the last navigation
  return within(screen.getAllByRole('navigation').at(-1)!)
}

// The desktop bar lists every tab
const desktop = () => within(screen.getAllByRole('navigation')[0])

it('Home is the first tab and is marked current on the home page', () => {
  renderAt('/admin/eagles/home')
  const links = desktop().getAllByRole('link')
  // No New Session tab: sessions start from Home
  expect(links.map((l) => l.textContent)).toEqual(['Home', 'Players', 'History', 'Training plan', 'Coach Board', "Coach's schedule"])
  expect(links[0]).toHaveAttribute('href', '/admin/eagles/home')
  expect(links[0]).toHaveAttribute('aria-current', 'page')
})

it('History stays current inside a session', () => {
  const nav = renderAt('/admin/eagles/sessions/s1/players')
  expect(nav.getByRole('link', { name: 'History' })).toHaveAttribute('aria-current', 'page')
  expect(nav.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
})

describe("the phone's bottom bar", () => {
  it('shows three tabs and More when there are more than four, with the rest and the settings under More', async () => {
    const user = userEvent.setup()
    const bar = renderAt('/admin/eagles/home')
    expect(screen.getByRole('navigation', { name: 'Main menu' })).toHaveClass('fixed', 'bottom-0')
    expect(bar.getAllByRole('link').map((l) => l.textContent)).toEqual(['Home', 'Players', 'History'])
    const more = bar.getByRole('button', { name: 'More' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    await user.click(more)
    const menu = document.getElementById('more-menu')!
    expect(within(menu).getAllByRole('link').map((l) => l.textContent)).toEqual(['Training plan', 'Coach Board', "Coach's schedule", 'League settings'])
    expect(within(menu).getByRole('link', { name: "Coach's schedule" })).toHaveAttribute('href', '/admin/eagles/schedule')
  })

  it('splits its full width between the tabs it has', () => {
    const bar = renderAt('/admin/eagles/home')
    const nav = bar.getAllByRole('link')[0].closest('nav') as HTMLElement
    expect(nav.style.gridTemplateColumns).toBe('repeat(4, minmax(0, 1fr))')
  })

  it('has three equal tabs and no More without the extra features', () => {
    const bar = renderAt('/admin/eagles/home', ['cards'])
    expect(bar.getAllByRole('link')).toHaveLength(3)
    expect(bar.queryByRole('button', { name: 'More' })).not.toBeInTheDocument()
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
    expect(nav.getByRole('link', { name: "Coach's schedule" })).toHaveAttribute('aria-current', 'page')
    // A long name goes onto a second line on a phone instead of being cut off
    const label = nav.getByText("Coach's schedule")
    expect(label).toHaveClass('line-clamp-2')
    expect(label).not.toHaveClass('truncate')
  })

  it('marks More current on a page under it', () => {
    const bar = renderAt('/admin/eagles/lineups')
    expect(bar.getByRole('button', { name: 'More' }).className).toContain('text-white')
  })

  it('is left out on the match screen, so nothing sits between the coach and the match', () => {
    renderAt('/admin/eagles/sessions/s1/match/m1')
    expect(screen.queryByRole('navigation', { name: 'Main menu' })).not.toBeInTheDocument()
    expect(document.documentElement).not.toHaveClass('has-bottom-bar')
  })
})

it("carries the once-a-day check for today's items", () => {
  renderAt('/admin/eagles/players')
  expect(screen.getByTestId('today-reminder')).toBeInTheDocument()
})

describe('the morning notification', () => {
  beforeEach(() => { vi.mocked(keepPushRight).mockClear() })

  it("is kept right, in the app's language, when the admin area opens", () => {
    renderAt('/admin/eagles/players')
    expect(keepPushRight).toHaveBeenCalledTimes(1)
    expect(keepPushRight).toHaveBeenCalledWith('en')
  })

  it('is left alone without the schedule', () => {
    renderAt('/admin/eagles/players', FEATURES.filter((f) => f !== 'schedule'))
    expect(keepPushRight).not.toHaveBeenCalled()
  })
})

it('the match screen leads back to its session', () => {
  renderAt('/admin/eagles/sessions/s1/match/m1')
  expect(screen.getByRole('link', { name: /Session/ })).toHaveAttribute('href', '/admin/eagles/sessions/s1')
})
