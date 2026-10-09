import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'
import { db, resetDb, rows } from '../../test/fakeSupabase'
import { match, player, players, session, team, teamPlayers, teams } from '../../test/fixtures'
import { FEATURES } from '../../lib/features'
import { PRESETS, type MatchFormat } from '../../utils/matchFormat'

vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)

import MatchTrackerPage from './MatchTrackerPage'

// Session s1 is under way: match 1, Green v Blue with Yellow waiting, not started yet
beforeEach(() => {
  localStorage.clear()
  resetDb({
    players, teams, team_players: teamPlayers,
    sessions: [{ ...session, status: 'active' }],
    matches: [match('m1')],
    match_events: [],
  })
})

// Match 1 is the page under test; any other match id is where "Continue" leads
function MatchRoute() {
  const { matchId } = useParams()
  return matchId === 'm1' ? <MatchTrackerPage /> : <p>next match {matchId}</p>
}

const renderPage = (features = FEATURES) => render(
  <MemoryRouter initialEntries={['/admin/eagles/sessions/s1/match/m1']}><InLeague features={features}>
    <Routes>
      <Route path="/admin/eagles/sessions/:sessionId/match/:matchId" element={<MatchRoute />} />
      <Route path="/admin/eagles/sessions/:sessionId/awards" element={<p>awards page</p>} />
    </Routes>
  </InLeague></MemoryRouter>,
)

const m1 = () => rows('matches').find((m) => m.id === 'm1')!
// Session s1 played in another format; match 1 as given
const seed = (format: MatchFormat, m = match('m1')) => resetDb({
  players, teams, team_players: teamPlayers,
  sessions: [{ ...session, status: 'active', ...format }],
  matches: [m],
  match_events: [],
})
const score = () => screen.getAllByText(/^\d+$/).map((el) => el.textContent)

it('shows who is playing and who waits, and blocks goals until the clock starts', async () => {
  renderPage()
  expect(await screen.findByText('Green Team')).toBeInTheDocument()
  expect(screen.getByText('Blue Team')).toBeInTheDocument()
  expect(screen.getByText('Next up: Yellow Team')).toBeInTheDocument()
  // The clock state catches up with the loaded match one render later
  await waitFor(() => expect(screen.getByRole('button', { name: '⚽ Goal' })).toBeDisabled())
  expect(screen.getByText('Press Start to record goals and cards')).toBeInTheDocument()
})

it('loads the match, teams, players and the day so far in one request', async () => {
  renderPage()
  expect(await screen.findByText('Green Team')).toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole('button', { name: '▶ Start' })).toBeInTheDocument())
  expect(db.reads).toBe(1)
})

it('starts the clock and records a goal with an assist', async () => {
  const user = userEvent.setup()
  renderPage()
  await user.click(await screen.findByRole('button', { name: '▶ Start' }))
  await waitFor(() => expect(m1()).toMatchObject({ timer_status: 'running', status: 'active' }))

  await user.click(screen.getByRole('button', { name: '⚽ Goal' }))
  expect(screen.getByRole('heading', { name: 'Who scored?' })).toBeInTheDocument()
  // Only the two playing teams can score
  expect(screen.queryByRole('button', { name: 'Hadi' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Omar' }))
  await user.click(screen.getByRole('button', { name: 'Ali' }))
  await user.click(screen.getByRole('button', { name: 'Confirm' }))

  await waitFor(() => expect(m1().team1_score).toBe(1))
  const goal = rows('match_events').find((e) => e.event_type === 'goal')!
  expect(goal).toMatchObject({ match_id: 'm1', player_id: 'p2', team_id: 'tg' })
  expect(rows('match_events').find((e) => e.event_type === 'assist')).toMatchObject({ player_id: 'p1', related_event_id: goal.id })
  expect(score().slice(0, 2)).toEqual(['1', '0'])
})

it('undoes the last goal', async () => {
  const user = userEvent.setup()
  renderPage()
  await user.click(await screen.findByRole('button', { name: '▶ Start' }))
  await user.click(screen.getByRole('button', { name: '⚽ Goal' }))
  await user.click(screen.getByRole('button', { name: 'Sami' }))
  await user.click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(m1().team2_score).toBe(1))

  await user.click(screen.getByRole('button', { name: /Undo.*Sami/ }))
  await user.click(screen.getByRole('button', { name: 'Yes, undo' }))
  await waitFor(() => expect(m1().team2_score).toBe(0))
  expect(rows('match_events')).toEqual([])
})

it('ending early asks first, then saves the result and sets up the next match', async () => {
  rows('matches')[0].team1_score = 1
  const user = userEvent.setup()
  renderPage()
  await user.click(await screen.findByRole('button', { name: 'End Match' }))
  expect(screen.getByRole('heading', { name: 'End match early?' })).toBeInTheDocument()
  expect(m1().status).toBe('pending')
  await user.click(screen.getByRole('button', { name: 'Yes, end it' }))

  expect(await screen.findByRole('heading', { name: 'Green Team wins!' })).toBeInTheDocument()
  expect(m1()).toMatchObject({ status: 'completed', winner_team_id: 'tg' })
  // Winner stays on, loser goes off to wait, the waiting team comes on
  const next = rows('matches').find((m) => m.match_number === 2)!
  expect(next).toMatchObject({ session_id: 's1', team1_id: 'tg', team2_id: 'ty', waiting_team_id: 'tb', status: 'pending' })

  await user.click(screen.getByRole('button', { name: 'Continue' }))
  expect(await screen.findByText(`next match ${next.id}`)).toBeInTheDocument()
})

it('a draw in match 1 goes to penalties', async () => {
  const user = userEvent.setup()
  renderPage()
  await user.click(await screen.findByRole('button', { name: 'End Match' }))
  await user.click(screen.getByRole('button', { name: 'Yes, end it' }))
  expect(await screen.findByRole('heading', { name: 'Penalty Shootout' })).toBeInTheDocument()

  const confirm = screen.getByRole('button', { name: 'Confirm Penalty Result' })
  expect(confirm).toBeDisabled()
  const [, blueUp] = screen.getAllByRole('button', { name: '+' }).slice(0, 2)
  await user.click(blueUp)
  await user.click(confirm)

  await waitFor(() => expect(m1()).toMatchObject({ status: 'completed', is_draw: true, draw_resolved_by: 'penalties', winner_team_id: 'tb' }))
  expect(await screen.findByRole('heading', { name: 'Blue Team wins!' })).toBeInTheDocument()
})

it('hides card and swap buttons when those features are off', async () => {
  renderPage(FEATURES.filter((f) => f !== 'cards' && f !== 'swaps'))
  expect(await screen.findByRole('button', { name: '⚽ Goal' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '🟨 Card' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '↔ Swap' })).not.toBeInTheDocument()
})

describe('more or fewer than three teams', () => {
  it('four teams: the winner stays, the first waiting team comes on and the loser joins the queue', async () => {
    rows('teams').push(team('to', 's1', 'orange'))
    rows('players').push(player('p8', 'Rami', 'MID', 3), player('p9', 'Tariq', 'ATT', 3))
    rows('team_players').push({ league_id: 'L1', team_id: 'to', player_id: 'p8' }, { league_id: 'L1', team_id: 'to', player_id: 'p9' })
    Object.assign(rows('sessions')[0], { team_count: 4 })
    Object.assign(rows('matches')[0], { queue: ['ty', 'to'], waiting_team_id: 'ty', team1_score: 1 })
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText('Next up: Yellow Team, then Orange Team')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'End Match' }))
    await user.click(screen.getByRole('button', { name: 'Yes, end it' }))

    expect(await screen.findByRole('heading', { name: 'Green Team wins!' })).toBeInTheDocument()
    expect(screen.getByText('Next up: Orange Team, then Blue Team')).toBeInTheDocument()
    const next = rows('matches').find((m) => m.match_number === 2)!
    expect(next).toMatchObject({ team1_id: 'tg', team2_id: 'ty', queue: ['to', 'tb'], waiting_team_id: 'to' })
    expect(db.writes.find((w) => w.table === 'matches' && w.op === 'insert')?.values).toMatchObject({ period: 1 })
  })

  it('two teams: the same two play again and nobody is shown waiting', async () => {
    rows('teams').splice(2, 1)
    rows('team_players').splice(4, 2)
    Object.assign(rows('sessions')[0], { team_count: 2 })
    Object.assign(rows('matches')[0], { match_number: 2, queue: [], waiting_team_id: null, team2_score: 1 })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'End Match' }))
    expect(screen.queryByText(/Next up/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Yes, end it' }))

    expect(await screen.findByRole('heading', { name: 'Blue Team wins!' })).toBeInTheDocument()
    expect(screen.queryByText(/Next up/)).not.toBeInTheDocument()
    expect(rows('matches').find((m) => m.match_number === 3)).toMatchObject({ team1_id: 'tb', team2_id: 'tg', queue: [], waiting_team_id: null })
  })
})

describe('periods', () => {
  it('a single-period session still shows End Match, never End 1st half', async () => {
    renderPage()
    await screen.findByText('Green Team')
    expect(screen.getByRole('button', { name: 'End Match' })).toBeInTheDocument()
    expect(screen.queryByText(/half/)).toBeNull()
  })

  it('halves: End 1st half freezes the clock, shows the break, Start 2nd half resumes at 00:00', async () => {
    seed(PRESETS.halves)
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '▶ Start' }))
    // Time is not up yet, so ending the half asks first
    await user.click(screen.getByRole('button', { name: 'End 1st half' }))
    expect(screen.getByRole('heading', { name: 'End match early?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Yes, end it' }))
    expect(await screen.findByText('1st half finished')).toBeInTheDocument()
    expect(m1()).toMatchObject({ status: 'active', timer_status: 'stopped', period_seconds: [expect.any(Number)] })
    // The ended half's clock cannot be restarted
    expect(screen.queryByRole('button', { name: '▶ Start' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Start 2nd half' }))
    await waitFor(() => expect(m1()).toMatchObject({ period: 2, timer_status: 'running', timer_elapsed_seconds: 0 }))
    expect(await screen.findByText('2nd half')).toBeInTheDocument()
    expect(m1().period_seconds).toHaveLength(1)
  })

  it('reloading between periods shows the break screen, not a fresh start', async () => {
    seed(PRESETS.halves, match('m1', { period: 1, period_seconds: [600], timer_status: 'stopped', timer_elapsed_seconds: 600, status: 'active' }))
    renderPage()
    expect(await screen.findByRole('button', { name: 'Start 2nd half' })).toBeInTheDocument()
    expect(screen.getByText('1st half finished')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '▶ Start' })).toBeNull()
  })

  it('knockout: level after 2nd half offers extra time; level after ET2 goes to penalties and saves the score', async () => {
    seed(PRESETS.knockout, match('m1', { period: 2, period_seconds: [600, 600], timer_status: 'stopped', timer_elapsed_seconds: 600, status: 'active' }))
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Start Extra time 1' }))
    await waitFor(() => expect(m1()).toMatchObject({ period: 3, timer_status: 'running' }))
    await user.click(await screen.findByRole('button', { name: 'End Extra time 1' }))
    await user.click(screen.getByRole('button', { name: 'Yes, end it' }))
    await user.click(await screen.findByRole('button', { name: 'Start Extra time 2' }))
    await waitFor(() => expect(m1()).toMatchObject({ period: 4, timer_status: 'running' }))
    await user.click(await screen.findByRole('button', { name: 'End Extra time 2' }))
    await user.click(screen.getByRole('button', { name: 'Yes, end it' }))

    await user.click(await screen.findByRole('button', { name: 'Go to penalties' }))
    await waitFor(() => expect(m1()).toMatchObject({ period: 5, timer_status: 'stopped' }))
    expect(await screen.findByRole('heading', { name: 'Penalty Shootout' })).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: '+' })[0])
    await user.click(screen.getByRole('button', { name: 'Confirm Penalty Result' }))

    await waitFor(() => expect(m1()).toMatchObject({
      status: 'completed', draw_resolved_by: 'penalties', winner_team_id: 'tg', penalties_team1: 1, penalties_team2: 0,
    }))
    // Each period was recorded once
    expect(m1().period_seconds).toHaveLength(4)
  })

  it('knockout: reloading during the shoot-out comes back to the shoot-out', async () => {
    seed(PRESETS.knockout, match('m1', { period: 5, period_seconds: [600, 600, 300, 300], timer_status: 'stopped', status: 'active' }))
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Penalty Shootout' })).toBeInTheDocument()
  })

  it('knockout: a leader after extra time ends the match as extra_time', async () => {
    seed(PRESETS.knockout, match('m1', { period: 4, period_seconds: [600, 600, 300], timer_status: 'running', team1_score: 1, status: 'active' }))
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'End Match' }))
    await user.click(screen.getByRole('button', { name: 'Yes, end it' }))
    await waitFor(() => expect(m1()).toMatchObject({ status: 'completed', is_draw: false, draw_resolved_by: 'extra_time', winner_team_id: 'tg' }))
    expect(m1().period_seconds).toHaveLength(4)
  })
})
