import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'
import { db, resetDb } from '../../test/fakeSupabase'
import { player } from '../../test/fixtures'
import { inArabic } from '../../test/arabic'

vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)

import CoachEventPage from './CoachEventPage'

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <InLeague>
      <Routes>
        <Route path="/admin/:slug/coach/new/:kind" element={<CoachEventPage />} />
        <Route path="/admin/:slug/coach/days/:eventId" element={<CoachEventPage />} />
        <Route path="/admin/:slug/coach" element={<p>Coach home</p>} />
      </Routes>
    </InLeague>
  </MemoryRouter>,
)

const squad = () => [
  player('p1', 'Ali', 'GK', 5),
  player('p2', 'Omar', 'ATT', 4),
  player('p3', 'Sami', 'MID', 3),
  player('p7', 'Retired', 'DEF', 3, { is_active: false }),
  player('px', 'Stranger', 'ATT', 5, { league_id: 'L2' }),
]

const saved = () => db.rpcs.find((c) => c.fn === 'save_coach_event')?.args as Record<string, unknown> | undefined

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 31, 18, 0))
})
afterEach(() => vi.useRealTimers())

describe('a new training', () => {
  it('lists the active players as absent, marks attendance with a tap, and saves every player with their rating', async () => {
    resetDb({ players: squad() })
    db.rpcResults.save_coach_event = { data: 'ev1', error: null }
    renderAt('/admin/eagles/coach/new/training')
    expect(await screen.findByRole('heading', { name: 'New training' })).toBeInTheDocument()
    expect(screen.queryByText('Retired')).not.toBeInTheDocument()
    expect(screen.queryByText('Stranger')).not.toBeInTheDocument()

    const ali = screen.getByRole('button', { name: 'Attendance of Ali: Absent' })
    // Absent players cannot be rated
    expect(screen.getByRole('combobox', { name: 'Rating of Ali' })).toBeDisabled()
    fireEvent.click(ali)
    expect(screen.getByRole('button', { name: 'Attendance of Ali: Present' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'Rating of Ali' }), { target: { value: '8' } })
    // Omar: present, then late
    fireEvent.click(screen.getByRole('button', { name: 'Attendance of Omar: Absent' }))
    fireEvent.click(screen.getByRole('button', { name: 'Attendance of Omar: Present' }))
    expect(screen.getByText('Present 1 · Late 1 · Excused 0 · Absent 1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Coach home')).toBeInTheDocument()
    expect(saved()).toMatchObject({
      p_id: null, p_league_id: 'L1', p_kind: 'training', p_date: '2026-10-31', p_match_type: null, p_our_score: null,
      p_players: [
        { player_id: 'p1', attendance: 'present', rating: 8, role: null, position: null },
        { player_id: 'p2', attendance: 'late', rating: null },
        { player_id: 'p3', attendance: 'absent', rating: null },
      ],
    })
  })

  it('marks everyone present at once', async () => {
    resetDb({ players: squad() })
    renderAt('/admin/eagles/coach/new/training')
    fireEvent.click(await screen.findByRole('button', { name: 'All present' }))
    expect(screen.getAllByRole('button', { name: /^Attendance of .*: Present$/ })).toHaveLength(3)
  })
})

describe('a new match', () => {
  it('needs an opponent and both scores or neither', async () => {
    resetDb({ players: squad() })
    renderAt('/admin/eagles/coach/new/match')
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }))
    expect(screen.getByText('Enter the opponent')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Opponent' }), { target: { value: 'Rivals FC' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Our goals' }), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Enter both scores, or leave both empty')).toBeInTheDocument()
    expect(saved()).toBeUndefined()
  })

  it('saves the type, score and only the squad, each with role, position, rating, goals and assists', async () => {
    resetDb({ players: squad() })
    db.rpcResults.save_coach_event = { data: 'ev2', error: null }
    renderAt('/admin/eagles/coach/new/match')
    fireEvent.change(await screen.findByRole('textbox', { name: 'Opponent' }), { target: { value: 'Rivals FC' } })
    fireEvent.click(screen.getByRole('button', { name: 'League' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Our goals' }), { target: { value: '3' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Their goals' }), { target: { value: '1' } })

    fireEvent.change(screen.getByRole('combobox', { name: 'Role of Omar' }), { target: { value: 'starter' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Position of Omar' }), { target: { value: 'MID' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Rating of Omar' }), { target: { value: '9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Goals of Omar +' }))
    fireEvent.click(screen.getByRole('button', { name: 'Goals of Omar +' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Role of Sami' }), { target: { value: 'unused' } })
    // Someone who did not play has no position or rating to give
    expect(screen.queryByRole('combobox', { name: 'Rating of Sami' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Coach home')).toBeInTheDocument()
    expect(saved()).toMatchObject({
      p_kind: 'match', p_title: 'Rivals FC', p_match_type: 'league', p_our_score: 3, p_their_score: 1,
      p_players: [
        { player_id: 'p2', attendance: 'present', role: 'starter', position: 'MID', rating: 9, goals: 2, assists: 0 },
        { player_id: 'p3', role: 'unused', position: null, rating: null, goals: 0 },
      ],
    })
    expect((saved()!.p_players as unknown[])).toHaveLength(2)
  })

  it('fills starters, substitutes and positions from a coach board', async () => {
    resetDb({
      players: squad(),
      lineups: [{ id: 'b1', league_id: 'L1', name: 'Saturday XI', updated_at: '2026-10-30T10:00:00Z' }],
      lineup_players: [
        { lineup_id: 'b1', player_id: 'p1', league_id: 'L1', x: 0.5, y: 0.92, bench_order: null },
        { lineup_id: 'b1', player_id: 'p3', league_id: 'L1', x: 0.5, y: 0.3, bench_order: null },
        { lineup_id: 'b1', player_id: 'p2', league_id: 'L1', x: 0, y: 0, bench_order: 0 },
      ],
    })
    renderAt('/admin/eagles/coach/new/match')
    fireEvent.change(await screen.findByRole('combobox', { name: /Line up from a coach board/ }), { target: { value: 'b1' } })
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Role of Ali' })).toHaveValue('starter'))
    expect(screen.getByRole('combobox', { name: 'Position of Ali' })).toHaveValue('GK')
    expect(screen.getByRole('combobox', { name: 'Role of Sami' })).toHaveValue('starter')
    expect(screen.getByRole('combobox', { name: 'Position of Sami' })).toHaveValue('ATT')
    expect(screen.getByRole('combobox', { name: 'Role of Omar' })).toHaveValue('sub')
    expect(screen.getByText('Starters 2 · Substitutes 1 · Did not play 0')).toBeInTheDocument()
  })
})

describe('a saved day', () => {
  const day = () => ({
    players: squad(),
    coach_events: [{
      id: 'ev1', league_id: 'L1', kind: 'match', event_date: '2026-10-20', title: 'Rivals FC', match_type: 'official',
      our_score: 1, their_score: 1, lineup_id: null, created_at: '2026-10-20T10:00:00Z',
    }],
    coach_event_players: [
      { event_id: 'ev1', player_id: 'p7', league_id: 'L1', attendance: 'present', role: 'starter', position: 'DEF', rating: 6, goals: 0, assists: 1 },
    ],
  })

  it('opens as saved, including a player who has since left', async () => {
    resetDb(day())
    renderAt('/admin/eagles/coach/days/ev1')
    expect(await screen.findByRole('textbox', { name: 'Opponent' })).toHaveValue('Rivals FC')
    expect(screen.getByRole('button', { name: 'Official' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('textbox', { name: 'Our goals' })).toHaveValue('1')
    expect(screen.getByRole('combobox', { name: 'Role of Retired' })).toHaveValue('starter')
    expect(screen.getByRole('combobox', { name: 'Rating of Retired' })).toHaveValue('6')
    expect(screen.getByRole('combobox', { name: 'Role of Ali' })).toHaveValue('none')
  })

  it('deletes after a confirmation', async () => {
    resetDb(day())
    renderAt('/admin/eagles/coach/days/ev1')
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('Coach home')).toBeInTheDocument()
    expect(db.tables.coach_events).toHaveLength(0)
  })

  it("says so for another league's day", async () => {
    resetDb({ ...day(), coach_events: [{ ...day().coach_events[0], league_id: 'L2' }] })
    renderAt('/admin/eagles/coach/days/ev1')
    expect(await screen.findByText(/not available|not found/i)).toBeInTheDocument()
  })
})

it('reads in Arabic', async () => {
  await inArabic(async () => {
    resetDb({ players: squad() })
    renderAt('/admin/eagles/coach/new/training')
    expect(await screen.findByRole('heading', { name: 'تدريب جديد' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'حضور Ali: غائب' })).toBeInTheDocument()
  })
})
