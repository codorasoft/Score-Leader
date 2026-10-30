import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)

import { InLeague } from '../../test/league'
import { db, resetDb, rows } from '../../test/fakeSupabase'
import { event, finishedLeague, match, players, session } from '../../test/fixtures'
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
        <Route path="/admin/eagles/lineups/:lineupId" element={<p>board page</p>} />
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
  expect(await screen.findByText(/20 Sep/)).toBeInTheDocument()
  expect(screen.queryByText('history page')).not.toBeInTheDocument()
})

it('loads the session, teams, matches, goals, players and awards in one round', async () => {
  resetDb(finishedLeague())
  // Voting off: the votes panel loads on its own and is not counted here
  renderPage(FEATURES.filter((f) => f !== 'voting'))
  expect(await screen.findByText(/20 Sep/)).toBeInTheDocument()
  expect((await screen.findAllByText('Omar')).length).toBeGreaterThan(0)
  // The session with everything linked to it, and its awards, side by side
  expect(db.reads).toBe(2)
})

it('shows the session format under the date', async () => {
  resetDb({ ...finishedLeague(), sessions: [{ ...session, ...PRESETS.halves }] })
  renderPage(FEATURES.filter((f) => f !== 'voting'))
  expect(await screen.findByText('2 × 10 min · no goal limit · a draw stays a draw')).toBeInTheDocument()
})

it('says when the extra time is open', async () => {
  resetDb({ ...finishedLeague(), sessions: [{ ...session, ...PRESETS.knockout, extra_time_minutes: 0 }] })
  renderPage(FEATURES.filter((f) => f !== 'voting'))
  expect(await screen.findByText('2 × 10 min · open extra time · penalties · no goal limit')).toBeInTheDocument()
})

it('the goal list shown while editing measures times against the session format too', async () => {
  resetDb({
    ...finishedLeague(), sessions: [{ ...session, ...PRESETS.halves }],
    matches: [match('m1', { status: 'completed', team1_score: 1, winner_team_id: 'tg' })],
    match_events: [event('e1', 'm1', 'p2', 'tg', 'goal', { elapsed_seconds: 550 })],
  })
  renderPage(FEATURES.filter((f) => f !== 'voting'))
  await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
  expect(screen.getByText('09:10')).toBeInTheDocument()
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
  expect(await screen.findByText(/20 Sep/)).toBeInTheDocument()
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

  it('lets the picked players be changed before the teams are confirmed', async () => {
    resetDb({ players, sessions: [draft], session_players: attendance })
    renderPage()
    await userEvent.click(await screen.findByRole('link', { name: 'Change players' }))
    expect(await screen.findByText('players page')).toBeInTheDocument()
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

describe('going back to picking teams', () => {
  const underWay = { ...session, status: 'active' as const }
  const matchOne = match('m1', { status: 'pending' })

  it('takes a session nobody has played yet back to the team builder, keeping its teams', async () => {
    resetDb({ ...finishedLeague(), sessions: [underWay], matches: [matchOne], match_events: [] })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Back to picking teams' }))
    await userEvent.click(within(screen.getByText(/Match 1 is removed/).parentElement!).getByRole('button', { name: 'Back to picking teams' }))
    expect(await screen.findByText('teams page')).toBeInTheDocument()
    expect(db.rpcs).toEqual([{ fn: 'reopen_teams', args: { p_session_id: 's1', p_draft_teams: [['p1', 'p2'], ['p3', 'p4'], ['p5', 'p6']] } }])
    expect(rows('sessions')[0].status).toBe('draft')
    expect(rows('matches')).toEqual([])
    expect(rows('teams')).toEqual([])
  })

  it('is not offered once a goal has been recorded', async () => {
    resetDb({ ...finishedLeague(), sessions: [underWay], matches: [{ ...matchOne, status: 'active' }], match_events: [event('e1', 'm1', 'p2', 'tg', 'goal')] })
    renderPage()
    expect(await screen.findByText(/20 Sep/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back to picking teams' })).not.toBeInTheDocument()
  })

  it('is not offered for a finished session', async () => {
    resetDb(finishedLeague())
    renderPage()
    expect(await screen.findByText(/20 Sep/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back to picking teams' })).not.toBeInTheDocument()
  })
})

describe('making a coach board from the confirmed teams', () => {
  it('puts the teams on a new board, in colour order, and opens it', async () => {
    resetDb({ ...finishedLeague(), sessions: [{ ...session, status: 'active' }] })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Make coach board' }))
    expect(await screen.findByText('board page')).toBeInTheDocument()
    expect(rows('lineups')).toHaveLength(1)
    expect(rows('lineups')[0]).toMatchObject({ league_id: 'L1', name: '2026-09-20: Green / Blue / Yellow' })
    expect((rows('lineups')[0].drawings as { text: string }[]).map((d) => d.text)).toEqual(['Green Team', 'Blue Team', 'Yellow Team'])
    expect(rows('lineup_players').map((r) => r.player_id).sort()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'])
  })

  it('is not offered before the teams are confirmed', async () => {
    resetDb({ players, sessions: [{ ...session, status: 'draft' }] })
    renderPage()
    expect(await screen.findByText(/20 Sep/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Make coach board' })).not.toBeInTheDocument()
  })
})
