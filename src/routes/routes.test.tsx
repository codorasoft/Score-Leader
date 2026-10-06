import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { AdminProfile, League, LeagueInfo } from '../lib/tenancy'
import { FEATURES } from '../lib/features'

const h = vi.hoisted(() => ({
  auth: {
    user: { id: 'u1' } as { id: string } | null,
    loading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
  },
  profile: { profile: null as unknown, loading: false } as { profile: unknown; loading: boolean; error?: boolean },
  retry: vi.fn(),
  leagues: [] as unknown[],
  leaguesError: false,
  infoBySlug: null as unknown,
  infoFails: false,
  infoById: null as unknown,
  sessionRow: null as unknown,
}))
const { stub } = vi.hoisted(() => ({ stub: (name: string) => ({ default: () => name }) }))

vi.mock('../hooks/useAuth', () => ({ useAuth: () => h.auth }))
vi.mock('../hooks/useProfile', () => ({ useProfile: () => ({ error: false, retry: h.retry, ...h.profile }) }))
vi.mock('../lib/tenancy', () => ({
  fetchMyLeagues: vi.fn(async () => {
    if (h.leaguesError) throw new Error('offline')
    return h.leagues
  }),
  fetchLeagueInfoBySlug: vi.fn(async () => {
    if (h.infoFails) throw new Error('offline')
    return h.infoBySlug
  }),
  fetchLeagueInfoById: vi.fn(async () => h.infoById),
}))
vi.mock('../lib/supabase', () => {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: h.sessionRow }) }
  return { supabase: { from: () => chain } }
})

vi.mock('../pages/admin/PlayersPage', () => stub('PlayersPage'))
vi.mock('../pages/admin/AttendancePage', () => stub('AttendancePage'))
vi.mock('../pages/admin/TeamBuilderPage', () => stub('TeamBuilderPage'))
vi.mock('../pages/admin/MatchTrackerPage', () => stub('MatchTrackerPage'))
vi.mock('../pages/admin/AwardsPage', () => stub('AwardsPage'))
vi.mock('../pages/admin/SessionDetailPage', () => stub('SessionDetailPage'))
vi.mock('../pages/admin/HistoryPage', () => stub('HistoryPage'))
vi.mock('../pages/admin/HomePage', () => stub('HomePage'))
vi.mock('../pages/admin/LineupsPage', () => stub('LineupsPage'))
vi.mock('../pages/admin/LineupEditorPage', () => stub('LineupEditorPage'))
vi.mock('../pages/public/LiveSessionPage', () => stub('LiveSessionPage'))
vi.mock('../pages/public/VotePage', () => stub('VotePage'))
vi.mock('../pages/public/LeaderboardPage', () => stub('LeaderboardPage'))
vi.mock('../pages/public/PlayerProfilePage', () => stub('PlayerProfilePage'))
vi.mock('../pages/public/RecordsPage', () => stub('RecordsPage'))
vi.mock('../pages/public/LeagueHomePage', () => stub('LeagueHomePage'))
vi.mock('../pages/public/CardsPage', () => stub('CardsPage'))

import { routes } from '../router'

const profile = (over: Partial<AdminProfile> = {}): AdminProfile => ({
  user_id: 'u1', role: 'admin', email: 'a@b.c', display_name: 'A', max_leagues: 3,
  features: [...FEATURES], is_disabled: false, created_at: '', ...over,
})
const league = (slug: string): League => ({
  id: `id-${slug}`, owner_id: 'u1', name: slug, slug, logo_url: null, created_at: '',
})
const info = (over: Partial<LeagueInfo> = {}): LeagueInfo => ({
  id: 'id-eagles', slug: 'eagles', name: 'Eagles', logo_url: null,
  features: [...FEATURES], is_available: true, ...over,
})

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}
const expectPath = (router: ReturnType<typeof renderAt>, path: string) =>
  waitFor(() => expect(router.state.location.pathname).toBe(path))

beforeEach(() => {
  localStorage.clear()
  h.auth.user = { id: 'u1' }
  h.auth.loading = false
  h.auth.signOut.mockClear()
  h.retry.mockClear()
  h.leaguesError = false
  h.profile = { profile: profile(), loading: false }
  h.leagues = [league('eagles'), league('tigers')]
  h.infoBySlug = info()
  h.infoFails = false
  h.infoById = info()
  h.sessionRow = null
})

describe('legacy public redirects', () => {
  it('sends /leaderboard to the legacy league', async () => {
    const router = renderAt('/leaderboard')
    await expectPath(router, '/l/eagles/leaderboard')
    expect(await screen.findByText('LeaderboardPage')).toBeInTheDocument()
  })
  it('keeps the player id', async () => {
    const router = renderAt('/players/p1')
    await expectPath(router, '/l/eagles/players/p1')
    expect(await screen.findByText('PlayerProfilePage')).toBeInTheDocument()
  })
  it('sends /records and /cards too', async () => {
    const router = renderAt('/records')
    await expectPath(router, '/l/eagles/records')
    router.navigate('/cards')
    await expectPath(router, '/l/eagles/cards')
  })
})

describe('admin redirects', () => {
  beforeEach(() => localStorage.setItem('scoreleader.lastLeague', 'tigers'))

  it('/admin goes to the last-used league', async () => {
    const router = renderAt('/admin')
    await expectPath(router, '/admin/tigers/home')
    expect(await screen.findByText('HomePage')).toBeInTheDocument()
  })
  it('/admin falls back to the first league when the last one is not owned', async () => {
    localStorage.setItem('scoreleader.lastLeague', 'gone')
    const router = renderAt('/admin')
    await expectPath(router, '/admin/eagles/home')
  })
  it('/admin/history keeps the page in the last-used league', async () => {
    const router = renderAt('/admin/history')
    await expectPath(router, '/admin/tigers/history')
  })
  it('/admin/sessions/s1 keeps the session id', async () => {
    const router = renderAt('/admin/sessions/s1')
    await expectPath(router, '/admin/tigers/sessions/s1')
    expect(await screen.findByText('SessionDetailPage')).toBeInTheDocument()
  })
  it('/admin/sessions/s1/match/m1 keeps the full path', async () => {
    const router = renderAt('/admin/sessions/s1/match/m1')
    await expectPath(router, '/admin/tigers/sessions/s1/match/m1')
    expect(await screen.findByText('MatchTrackerPage')).toBeInTheDocument()
  })
  it('/admin/players and /admin/lineups/l1 keep their page', async () => {
    const router = renderAt('/admin/players')
    await expectPath(router, '/admin/tigers/players')
    router.navigate('/admin/lineups/l1')
    await expectPath(router, '/admin/tigers/lineups/l1')
  })
  it('/admin with no leagues goes to create-first-league', async () => {
    h.leagues = []
    const router = renderAt('/admin')
    await expectPath(router, '/admin/leagues/new')
  })
  it('a slug the admin does not own goes back to /admin', async () => {
    localStorage.clear()
    const router = renderAt('/admin/other-league/history')
    await expectPath(router, '/admin/eagles/home')
  })
  it('remembers the league that was opened', async () => {
    localStorage.clear()
    const router = renderAt('/admin/tigers/players')
    await screen.findByText('PlayersPage')
    expect(router.state.location.pathname).toBe('/admin/tigers/players')
    // Saved by an effect right after the page renders
    await waitFor(() => expect(localStorage.getItem('scoreleader.lastLeague')).toBe('tigers'))
  })
  it('the league index opens home', async () => {
    const router = renderAt('/admin/eagles')
    await expectPath(router, '/admin/eagles/home')
  })
  it('coach board off sends lineups to history', async () => {
    h.profile = { profile: profile({ features: ['cards'] }), loading: false }
    const router = renderAt('/admin/eagles/lineups')
    await expectPath(router, '/admin/eagles/history')
  })
})

describe('leagues fetch failure', () => {
  it('keeps the deep link and offers a retry instead of create-first-league', async () => {
    h.leaguesError = true
    const router = renderAt('/admin/eagles/sessions/s1/match/m1')
    expect(await screen.findByText('Could not load. Check your connection.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin/eagles/sessions/s1/match/m1')

    h.leaguesError = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('MatchTrackerPage')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin/eagles/sessions/s1/match/m1')
  })
  it('/admin does not go to create-first-league when the fetch fails', async () => {
    h.leaguesError = true
    const router = renderAt('/admin')
    expect(await screen.findByText('Could not load. Check your connection.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin')
  })
})

describe('role guards', () => {
  it('superadmin at /admin goes to /super', async () => {
    h.profile = { profile: profile({ role: 'superadmin' }), loading: false }
    const router = renderAt('/admin')
    await expectPath(router, '/super')
  })
  it('admin at /super goes to /admin', async () => {
    localStorage.setItem('scoreleader.lastLeague', 'tigers')
    const router = renderAt('/super')
    await expectPath(router, '/admin/tigers/home')
  })
  it('signed-out user goes to /login', async () => {
    h.auth.user = null
    h.profile = { profile: null, loading: false }
    const router = renderAt('/admin/eagles/history')
    await expectPath(router, '/login')
  })
  it('disabled profile sees a message and is signed out', async () => {
    h.profile = { profile: profile({ is_disabled: true }), loading: false }
    renderAt('/admin')
    expect(await screen.findByText('Your account is disabled')).toBeInTheDocument()
    await waitFor(() => expect(h.auth.signOut).toHaveBeenCalledTimes(1))
  })
  it('a failed profile fetch offers a retry and does not sign out', async () => {
    h.profile = { profile: null, loading: false, error: true }
    renderAt('/admin/eagles/history')
    expect(await screen.findByText('Could not load. Check your connection.')).toBeInTheDocument()
    expect(screen.queryByText('Your account is disabled')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(h.retry).toHaveBeenCalled()
    expect(h.auth.signOut).not.toHaveBeenCalled()
  })
  it('missing profile is treated as disabled', async () => {
    h.profile = { profile: null, loading: false }
    renderAt('/admin')
    expect(await screen.findByText('Your account is disabled')).toBeInTheDocument()
    await waitFor(() => expect(h.auth.signOut).toHaveBeenCalled())
  })
})

describe('public league', () => {
  it('records off shows Page not found', async () => {
    h.infoBySlug = info({ features: ['leaderboard'] })
    renderAt('/l/eagles/records')
    expect(await screen.findByText('Page not found')).toBeInTheDocument()
    expect(screen.queryByText('RecordsPage')).not.toBeInTheDocument()
  })
  it('records on renders the page', async () => {
    renderAt('/l/eagles/records')
    expect(await screen.findByText('RecordsPage')).toBeInTheDocument()
  })
  it('unknown slug shows League not available', async () => {
    h.infoBySlug = null
    renderAt('/l/nope')
    expect(await screen.findByText('League not available')).toBeInTheDocument()
  })
  it('unavailable league shows League not available', async () => {
    h.infoBySlug = info({ is_available: false })
    renderAt('/l/eagles/leaderboard')
    expect(await screen.findByText('League not available')).toBeInTheDocument()
  })
  it('a failed request shows Retry, not League not available, and retry recovers', async () => {
    h.infoFails = true
    renderAt('/l/eagles')
    const retry = await screen.findByText('Retry')
    expect(screen.queryByText('League not available')).not.toBeInTheDocument()
    h.infoFails = false
    fireEvent.click(retry)
    expect(await screen.findByText('LeagueHomePage')).toBeInTheDocument()
  })
  it('league index renders the league home page', async () => {
    const router = renderAt('/l/eagles')
    expect(await screen.findByText('LeagueHomePage')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/l/eagles')
  })
})

describe('session links', () => {
  it('/s/:token renders the live page inside its league', async () => {
    h.sessionRow = { league_id: 'id-eagles' }
    renderAt('/s/tok')
    expect(await screen.findByText('LiveSessionPage')).toBeInTheDocument()
  })
  it('/s/vote/:voteToken renders the vote page', async () => {
    h.sessionRow = { league_id: 'id-eagles' }
    renderAt('/s/vote/v1')
    expect(await screen.findByText('VotePage')).toBeInTheDocument()
  })
  it('unknown token shows League not available', async () => {
    renderAt('/s/missing')
    expect(await screen.findByText('League not available')).toBeInTheDocument()
  })
})

describe('new session', () => {
  beforeEach(() => localStorage.setItem('scoreleader.lastLeague', 'tigers'))

  it('the old new-session page opens Home with the popup', async () => {
    const router = renderAt('/admin/eagles/sessions/new')
    await expectPath(router, '/admin/eagles/home')
    expect(router.state.location.search).toBe('?new=1')
  })
  it('attendance has its own page', async () => {
    renderAt('/admin/eagles/sessions/s1/players')
    expect(await screen.findByText('AttendancePage')).toBeInTheDocument()
  })
})
