import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)

import { InLeague } from '../../test/league'
import { db, resetDb } from '../../test/fakeSupabase'
import { finishedLeague, match, players, session } from '../../test/fixtures'
import { PRESETS } from '../../utils/matchFormat'
import { FEATURES, type FeatureKey } from '../../lib/features'
import SessionDetailPage from './SessionDetailPage'

const renderPage = (features?: readonly FeatureKey[]) =>
  render(
    <InLeague features={features}><MemoryRouter initialEntries={['/admin/eagles/sessions/s1']}>
      <Routes>
        <Route path="/admin/eagles/sessions/:sessionId" element={<SessionDetailPage />} />
        <Route path="/admin/eagles/history" element={<p>history page</p>} />
        <Route path="/admin/eagles/sessions/:sessionId/teams" element={<p>teams page</p>} />
        <Route path="/admin/eagles/sessions/:sessionId/players" element={<p>players page</p>} />
      </Routes>
    </MemoryRouter></InLeague>,
  )

it("redirects to history when the session belongs to another league", async () => {
  resetDb({ ...finishedLeague(), sessions: [{ ...session, league_id: 'OTHER' }] })
  renderPage()
  expect(await screen.findByText('history page')).toBeInTheDocument()
})

it('shows the session when it belongs to the current league', async () => {
  resetDb(finishedLeague())
  renderPage()
  expect(await screen.findByText('2026-09-20')).toBeInTheDocument()
  expect(screen.queryByText('history page')).not.toBeInTheDocument()
})

it('loads the session, teams, matches, goals, players and awards in one round', async () => {
  resetDb(finishedLeague())
  // Voting off: the votes panel loads on its own and is not counted here
  renderPage(FEATURES.filter((f) => f !== 'voting'))
  expect(await screen.findByText('2026-09-20')).toBeInTheDocument()
  expect((await screen.findAllByText('Omar')).length).toBeGreaterThan(0)
  // The session with everything linked to it, and its awards, side by side
  expect(db.reads).toBe(2)
})

it('shows the session format under the date', async () => {
  resetDb({ ...finishedLeague(), sessions: [{ ...session, ...PRESETS.halves }] })
  renderPage(FEATURES.filter((f) => f !== 'voting'))
  expect(await screen.findByText('2 × 10 min · no goal limit · a draw stays a draw')).toBeInTheDocument()
})

describe('editing a level match', () => {
  // Only match 2 (Green v Yellow, level) is kept, so the page has a single Edit button
  const level = (extra: Parameters<typeof match>[1]) => match('m2', {
    match_number: 2, team1_id: 'tg', team2_id: 'ty', waiting_team_id: 'tb', queue: ['tb'], status: 'completed', team1_score: 0, team2_score: 0, ...extra,
  })

  it('stay rule: a level match offers the winner picker', async () => {
    resetDb({ ...finishedLeague(), match_events: [], matches: [level({ is_draw: true, draw_resolved_by: 'late_team', winner_team_id: 'ty' })] })
    renderPage(FEATURES.filter((f) => f !== 'voting'))
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    expect(screen.getByText('Winner')).toBeInTheDocument()
  })

  it('draw rule: a draw that stands offers no winner to pick', async () => {
    resetDb({
      ...finishedLeague(), match_events: [], sessions: [{ ...session, ...PRESETS.halves }],
      matches: [level({ is_draw: true, draw_resolved_by: null, winner_team_id: null })],
    })
    renderPage(FEATURES.filter((f) => f !== 'voting'))
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
    expect(screen.queryByText('Winner')).not.toBeInTheDocument()
  })
})

it('offers a retry instead of leaving the page when loading fails', async () => {
  resetDb(finishedLeague())
  db.errors.sessions = { message: 'Failed to fetch' }
  renderPage()
  expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument()
  expect(screen.queryByText('history page')).not.toBeInTheDocument()

  delete db.errors.sessions
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByText('2026-09-20')).toBeInTheDocument()
})

it('redirects to history when the session id in the URL is malformed', async () => {
  resetDb(finishedLeague())
  db.errors.sessions = { code: '22P02', message: 'invalid input syntax for type uuid' }
  renderPage()
  expect(await screen.findByText('history page')).toBeInTheDocument()
})

describe('a session whose teams are not confirmed yet', () => {
  const draft = { ...session, status: 'draft' as const }
  const attendance = ['p1', 'p2'].map((player_id) => ({ league_id: 'L1', session_id: 's1', player_id }))

  it('leads to the team builder instead of an empty match list', async () => {
    resetDb({ players, sessions: [draft], session_players: attendance })
    renderPage()
    expect(await screen.findByText('Teams are not confirmed yet')).toBeInTheDocument()
    expect(screen.queryByText('No completed matches yet')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Choose teams' }))
    expect(await screen.findByText('teams page')).toBeInTheDocument()
  })

  it('leads to picking players first when nobody is picked yet', async () => {
    resetDb({ players, sessions: [draft] })
    renderPage()
    await userEvent.click(await screen.findByRole('link', { name: 'Choose players' }))
    expect(await screen.findByText('players page')).toBeInTheDocument()
  })

  it('is not offered once the teams are confirmed', async () => {
    resetDb({ ...finishedLeague(), sessions: [{ ...session, status: 'active' }], matches: [] })
    renderPage()
    expect(await screen.findByText('No completed matches yet')).toBeInTheDocument()
    expect(screen.queryByText('Teams are not confirmed yet')).not.toBeInTheDocument()
  })
})
