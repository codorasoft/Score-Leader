import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'
import { db, resetDb } from '../../test/fakeSupabase'
import { player } from '../../test/fixtures'

vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)

import CoachPage from './CoachPage'
import CoachPlayerPage from './CoachPlayerPage'

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <InLeague>
      <Routes>
        <Route path="/admin/:slug/coach" element={<CoachPage />} />
        <Route path="/admin/:slug/coach/players/:playerId" element={<CoachPlayerPage />} />
      </Routes>
    </InLeague>
  </MemoryRouter>,
)

const ev = (id: string, kind: 'training' | 'match', event_date: string, extra: Record<string, unknown> = {}) => ({
  id, league_id: 'L1', kind, event_date, title: null, match_type: kind === 'match' ? 'league' : null,
  our_score: null, their_score: null, lineup_id: null, created_at: `${event_date}T10:00:00Z`, ...extra,
})
const row = (event_id: string, player_id: string, extra: Record<string, unknown> = {}) => ({
  event_id, player_id, league_id: 'L1', attendance: 'present', role: null, position: null, rating: null, goals: 0, assists: 0, ...extra,
})

// Ali comes to every training and plays well; Omar misses training; Sami has one day only
const league = () => ({
  players: [player('p1', 'Ali', 'MID', 3), player('p2', 'Omar', 'ATT', 5), player('p3', 'Sami', 'DEF', 3)],
  coach_events: [
    ev('t1', 'training', '2026-10-20'),
    ev('t2', 'training', '2026-10-22', { title: 'Finishing' }),
    ev('m1', 'match', '2026-10-25', { title: 'Rivals FC', match_type: 'friendly', our_score: 2, their_score: 1 }),
    ev('m2', 'match', '2026-10-28', { title: 'City', match_type: 'league' }),
  ],
  coach_event_players: [
    row('t1', 'p1', { rating: 8 }), row('t1', 'p2', { attendance: 'absent' }), row('t1', 'p3', { rating: 5 }),
    row('t2', 'p1', { rating: 8 }), row('t2', 'p2', { attendance: 'absent' }),
    row('m1', 'p1', { role: 'starter', position: 'MID', rating: 8, goals: 1 }),
    row('m1', 'p2', { role: 'sub', position: 'ATT', rating: 6 }),
    row('m2', 'p1', { role: 'starter', position: 'DEF', rating: 6 }),
    row('m2', 'p2', { role: 'starter', position: 'ATT', rating: 7, goals: 1 }),
  ],
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 31, 18, 0))
})
afterEach(() => vi.useRealTimers())

describe('CoachPage', () => {
  it('ranks by Coach Rating, with not enough data last, and lists the days newest first', async () => {
    resetDb(league())
    renderAt('/admin/eagles/coach')
    const list = (await screen.findByRole('heading', { name: 'Coach ranking' })).closest('section')!
    const rows = within(list).getAllByRole('link')
    expect(rows.map((r) => r.querySelector('.font-semibold')?.textContent)).toEqual(['Ali', 'Omar', 'Sami'])
    expect(rows[0]).toHaveAttribute('href', '/admin/eagles/coach/players/p1')
    expect(rows[0]).toHaveTextContent('Attendance 100% · Training 8 · Matches 7')
    expect(rows[2]).toHaveTextContent('Not enough data')

    const days = within(screen.getByRole('heading', { name: 'Trainings and matches' }).closest('section')!).getAllByRole('link')
    expect(days.map((d) => d.getAttribute('href'))).toEqual(['m2', 'm1', 't2', 't1'].map((id) => `/admin/eagles/coach/days/${id}`))
    expect(days[1]).toHaveTextContent('vs Rivals FC')
    expect(days[1]).toHaveTextContent('Friendly · 2 in squad')
    expect(days[1]).toHaveTextContent('2–1')
    expect(days[2]).toHaveTextContent('Finishing')
    expect(days[3]).toHaveTextContent('Training')
    expect(days[3]).toHaveTextContent('2 present')
  })

  it('filters the ranking by match type', async () => {
    resetDb(league())
    renderAt('/admin/eagles/coach')
    fireEvent.click(await screen.findByRole('button', { name: 'League' }))
    const list = screen.getByRole('heading', { name: 'Coach ranking' }).closest('section')!
    const names = within(list).getAllByRole('link').map((r) => r.querySelector('.font-semibold')?.textContent)
    // Only the league match: Sami was not in it, and one day is not enough to be ranked
    expect(names).toEqual(['Ali', 'Omar'])
    expect(within(list).getAllByText('Not enough data')).toHaveLength(2)
  })

  it('links to a new training and a new match, and says how to start when there is nothing', async () => {
    resetDb({ players: league().players })
    renderAt('/admin/eagles/coach')
    expect(await screen.findByText(/Mark attendance at your next training/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Training/ })).toHaveAttribute('href', '/admin/eagles/coach/new/training')
    expect(screen.getByRole('link', { name: /Match/ })).toHaveAttribute('href', '/admin/eagles/coach/new/match')
  })

  it('offers a retry when it cannot load', async () => {
    resetDb(league())
    db.errors.coach_events = { message: 'offline' }
    renderAt('/admin/eagles/coach')
    expect(await screen.findByText('Could not load. Check your connection.')).toBeInTheDocument()
    db.errors = {}
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { name: 'Coach ranking' })).toBeInTheDocument()
  })
})

describe('CoachPlayerPage', () => {
  it('shows the rating, its parts, and the splits by type, role and position', async () => {
    resetDb(league())
    renderAt('/admin/eagles/coach/players/p1')
    expect(await screen.findByRole('heading', { name: 'Ali' })).toBeInTheDocument()
    expect(screen.getByText('Present 2 · Late 0 · Excused 0 · Absent 0')).toBeInTheDocument()

    const section = (name: string) => within(screen.getByRole('heading', { name }).closest('section')!)
    expect(section('By match type').getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Friendly1 gameAvg 8', 'Official0 games–', 'League1 gameAvg 6',
    ])
    expect(section('Starter or substitute').getAllByRole('listitem')[0]).toHaveTextContent('Starter2 gamesAvg 7')
    const positions = section('By position played').getAllByRole('listitem')
    expect(positions.map((li) => li.textContent)).toEqual(['Defender1 gameAvg 6', 'MidfielderBest1 gameAvg 8'])
    expect(section('Day by day').getAllByRole('link')).toHaveLength(4)
  })

  it('says when a player has nothing on record', async () => {
    resetDb({ ...league(), players: [...league().players, player('p4', 'New', 'GK', 3)] })
    renderAt('/admin/eagles/coach/players/p4')
    expect(await screen.findByText('Nothing on record yet.')).toBeInTheDocument()
    expect(screen.getByText('Not enough data')).toBeInTheDocument()
  })
})
