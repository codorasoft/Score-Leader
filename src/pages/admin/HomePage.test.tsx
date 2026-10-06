import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'
import { FEATURES, type FeatureKey } from '../../lib/features'

// Every query resolves to the rows set for its table; filters are accepted and ignored.
const h = vi.hoisted(() => ({ rows: {} as Record<string, unknown[]>, count: 0 }))
vi.mock('../../lib/supabase', () => {
  const builder = (table: string) => {
    const result = () => ({ data: h.rows[table] ?? [], count: h.count, error: null })
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'is', 'order', 'limit']) b[m] = () => b
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve(result()).then(ok)
    return b
  }
  return { supabase: { from: builder } }
})

import HomePage from './HomePage'

const today = new Date().toISOString().slice(0, 10)
const session = (id: string, date: string, status: string) => ({ id, date, status, share_token: 't' + id, created_at: date + 'T10:00:00Z', league_id: 'L1' })
const match = (status: string, extra = {}) => ({
  id: 'm1', session_id: 's1', match_number: 3, team1_id: 'ta', team2_id: 'tb', waiting_team_id: 'tc', status,
  team1_score: 2, team2_score: 1, timer_status: 'paused', timer_started_at: null, timer_elapsed_seconds: 125, league_id: 'L1', ...extra,
})

function renderHome(features: readonly FeatureKey[] = FEATURES, url = '/admin/eagles/home') {
  return render(<MemoryRouter initialEntries={[url]}><InLeague features={features}><HomePage /></InLeague></MemoryRouter>)
}

beforeEach(() => { h.rows = {}; h.count = 0 })

describe('live / start block', () => {
  it('nothing open: start button and when the league last played', async () => {
    h.rows.sessions = [session('s0', '2026-09-01', 'completed')]
    renderHome()
    expect(await screen.findByRole('button', { name: /Start new session/ })).toBeInTheDocument()
    expect(screen.getByText(/Last played:/)).toBeInTheDocument()
  })
  it('start new session opens the new-session popup', async () => {
    h.rows.sessions = [session('s0', '2026-09-01', 'completed')]
    renderHome()
    fireEvent.click(await screen.findByRole('button', { name: /Start new session/ }))
    expect(await screen.findByRole('dialog', { name: 'New session' })).toBeInTheDocument()
  })
  it('opens the popup straight away when asked to by the link', async () => {
    h.rows.sessions = [session('s0', '2026-09-01', 'completed')]
    renderHome(FEATURES, '/admin/eagles/home?new=1')
    expect(await screen.findByRole('dialog', { name: 'New session' })).toBeInTheDocument()
  })
  it('a running match: score, clock and resume', async () => {
    h.rows.sessions = [session('s1', today, 'active')]
    h.rows.matches = [match('active')]
    h.rows.teams = [{ id: 'ta', session_id: 's1', color: 'green', name: null }, { id: 'tb', session_id: 's1', color: 'blue', name: null }]
    renderHome()
    expect(await screen.findByText('Live now')).toBeInTheDocument()
    expect(screen.getByText('2 – 1')).toBeInTheDocument()
    expect(screen.getByText('02:05')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Resume/ })).toHaveAttribute('href', '/admin/eagles/sessions/s1/match/m1')
  })
  it('a new session without players: continue to attendance', async () => {
    h.rows.sessions = [session('s1', today, 'draft')]
    renderHome()
    expect(await screen.findByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/admin/eagles/sessions/s1/players')
  })
  it('a session still picking teams: continue to the team builder', async () => {
    h.rows.sessions = [session('s1', today, 'draft')]
    h.rows.session_players = [{ session_id: 's1', player_id: 'p1' }]
    renderHome()
    expect(await screen.findByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/admin/eagles/sessions/s1/teams')
  })
})

describe('to do block', () => {
  beforeEach(() => {
    h.rows.sessions = [session('old', '2026-10-01', 'active'), session('s9', '2026-09-20', 'completed')]
    h.rows.award_votes = [{ id: 'v1', award_type: 'mvp', session_id: 's9' }]
    h.rows.award_vote_entries = [{ award_vote_id: 'v1' }, { award_vote_id: 'v1' }]
    h.count = 3
  })
  it('lists open votes, unfinished sessions and players without photos', async () => {
    renderHome()
    expect(await screen.findByRole('link', { name: /MVP vote .*2 votes/ })).toHaveAttribute('href', '/admin/eagles/sessions/s9')
    expect(screen.getByRole('link', { name: /is still open\. Finish it/ })).toHaveAttribute('href', '/admin/eagles/sessions/old')
    expect(screen.getByRole('link', { name: /3 players have no photo/ })).toHaveAttribute('href', '/admin/eagles/players')
  })
  it('hides vote and photo reminders when those features are off', async () => {
    renderHome(['cards'])
    expect(await screen.findByRole('link', { name: /Finish it/ })).toBeInTheDocument()
    expect(screen.queryByText(/MVP vote/)).not.toBeInTheDocument()
    expect(screen.queryByText(/no photo/)).not.toBeInTheDocument()
  })
  it('says all done when nothing is waiting', async () => {
    h.rows = { sessions: [session('s9', '2026-09-20', 'completed')] }
    h.count = 0
    renderHome()
    expect(await screen.findByText('All done ✓')).toBeInTheDocument()
  })
})

describe('coach board block', () => {
  it('opens the last edited board', async () => {
    h.rows.lineups = [{ id: 'b1', name: 'Saturday 4-4-2', updated_at: '2026-10-05T12:00:00Z' }]
    renderHome()
    expect(await screen.findByRole('link', { name: /Saturday 4-4-2/ })).toHaveAttribute('href', '/admin/eagles/lineups/b1')
    expect(screen.getByRole('link', { name: '+ New board' })).toHaveAttribute('href', '/admin/eagles/lineups/new')
  })
  it('offers the first board when there is none', async () => {
    renderHome()
    expect(await screen.findByRole('link', { name: 'Create your first board' })).toHaveAttribute('href', '/admin/eagles/lineups/new')
  })
  it('is hidden when the coach board is off', async () => {
    renderHome(['cards'])
    await screen.findByText('To do')
    expect(screen.queryByText('Coach Board')).not.toBeInTheDocument()
    expect(screen.queryByText('Create your first board')).not.toBeInTheDocument()
  })
})
