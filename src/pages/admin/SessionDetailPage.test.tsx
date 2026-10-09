import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)

import { InLeague } from '../../test/league'
import { db, resetDb } from '../../test/fakeSupabase'
import { finishedLeague, session } from '../../test/fixtures'
import { PRESETS } from '../../utils/matchFormat'
import { FEATURES, type FeatureKey } from '../../lib/features'
import SessionDetailPage from './SessionDetailPage'

const renderPage = (features?: readonly FeatureKey[]) =>
  render(
    <InLeague features={features}><MemoryRouter initialEntries={['/admin/eagles/sessions/s1']}>
      <Routes>
        <Route path="/admin/eagles/sessions/:sessionId" element={<SessionDetailPage />} />
        <Route path="/admin/eagles/history" element={<p>history page</p>} />
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
