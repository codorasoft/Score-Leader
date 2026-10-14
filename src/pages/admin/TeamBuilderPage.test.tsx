import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'
import { db, resetDb, rows } from '../../test/fakeSupabase'
import { finishedLeague } from '../../test/fixtures'
import { FEATURES } from '../../lib/features'

vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)

import TeamBuilderPage from './TeamBuilderPage'

const attending = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']

beforeEach(() => {
  localStorage.clear()
  const league = finishedLeague()
  resetDb({
    ...league,
    sessions: [...league.sessions, { league_id: 'L1', id: 's2', date: '2026-10-06', status: 'draft', share_token: 'tok2', created_at: '2026-10-06T17:00:00Z', team_count: 3, team_size: 5, draft_teams: null }],
    session_players: attending.map((player_id) => ({ league_id: 'L1', session_id: 's2', player_id })),
  })
})

function MatchStub() {
  const { matchId } = useParams()
  return <p>match page {matchId}</p>
}

function BoardStub() {
  const { lineupId } = useParams()
  return <p>board page {lineupId}</p>
}

const renderPage = (features = FEATURES) => render(
  <MemoryRouter initialEntries={['/admin/eagles/sessions/s2/teams']}><InLeague features={features}>
    <Routes>
      <Route path="/admin/eagles/sessions/:sessionId/teams" element={<TeamBuilderPage />} />
      <Route path="/admin/eagles/sessions/:sessionId/match/:matchId" element={<MatchStub />} />
      <Route path="/admin/eagles/lineups/:lineupId" element={<BoardStub />} />
    </Routes>
  </InLeague></MemoryRouter>,
)

it('splits the attending players into three teams of two', async () => {
  renderPage()
  await waitFor(() => expect(screen.getAllByText(/^2 players/)).toHaveLength(3))
  for (const name of ['Ali', 'Omar', 'Sami', 'Zaid', 'Hadi', 'Nour']) expect(screen.getByText(name)).toBeInTheDocument()
  expect(screen.queryByText('Retired')).not.toBeInTheDocument()
  // Only Ali is a keeper
  expect(screen.getByText(/Fewer goalkeepers than teams \(3\)/)).toBeInTheDocument()
})

it('saves the teams, starts the session and opens match 1 with the chosen team waiting', async () => {
  const user = userEvent.setup()
  renderPage()
  await waitFor(() => expect(screen.getAllByText(/^2 players/)).toHaveLength(3))
  // Green and Yellow play first, so Blue waits
  await user.click(screen.getByRole('button', { name: 'Green Team' }))
  await user.click(screen.getByRole('button', { name: 'Yellow Team' }))
  await user.click(screen.getByRole('button', { name: 'Confirm Teams & Start' }))

  const created = rows('teams').filter((t) => t.session_id === 's2')
  await waitFor(() => expect(screen.getByText(/^match page/)).toBeInTheDocument())
  expect(created.map((t) => t.color).sort()).toEqual(['blue', 'green', 'yellow'])
  const createdIds = created.map((t) => t.id)
  const placed = rows('team_players').filter((tp) => createdIds.includes(tp.team_id))
  expect(placed.map((tp) => tp.player_id).sort()).toEqual(attending)

  expect(rows('sessions').find((s) => s.id === 's2')?.status).toBe('active')
  const first = rows('matches').find((m) => m.session_id === 's2')!
  const blue = created.find((t) => t.color === 'blue')!
  expect(first).toMatchObject({ match_number: 1, period: 1, status: 'pending', waiting_team_id: blue.id })
  expect([first.team1_id, first.team2_id]).not.toContain(blue.id)
  expect(screen.getByText(`match page ${first.id}`)).toBeInTheDocument()
})

it('a confirm that cannot be saved says so, saves nothing and can be tapped again', async () => {
  db.rpcResults.confirm_teams = { data: null, error: { message: 'Failed to fetch' } }
  const user = userEvent.setup()
  renderPage()
  await waitFor(() => expect(screen.getAllByText(/^2 players/)).toHaveLength(3))
  await user.click(screen.getByRole('button', { name: 'Confirm Teams & Start' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not start the session')
  expect(rows('teams').filter((t) => t.session_id === 's2')).toEqual([])
  expect(rows('sessions').find((s) => s.id === 's2')?.status).toBe('draft')
  expect(screen.queryByText(/^match page/)).toBeNull()

  // With signal back, the same tap goes through
  delete db.rpcResults.confirm_teams
  await user.click(screen.getByRole('button', { name: 'Confirm Teams & Start' }))
  await waitFor(() => expect(screen.getByText(/^match page/)).toBeInTheDocument())
  expect(rows('teams').filter((t) => t.session_id === 's2')).toHaveLength(3)
  expect(screen.queryByRole('alert')).toBeNull()
})

it('teams confirmed already (on another tap or phone) open their match 1, with nothing saved twice', async () => {
  const user = userEvent.setup()
  renderPage()
  await waitFor(() => expect(screen.getAllByText(/^2 players/)).toHaveLength(3))
  rows('teams').push({ id: 'done-g', session_id: 's2', color: 'green' })
  rows('matches').push({ id: 'done-m1', session_id: 's2', match_number: 1, status: 'pending' })
  await user.click(screen.getByRole('button', { name: 'Confirm Teams & Start' }))

  expect(await screen.findByText('match page done-m1')).toBeInTheDocument()
  expect(rows('teams').filter((t) => t.session_id === 's2')).toHaveLength(1)
})

it('offers the stars/form slider only with smart balancing', async () => {
  const { unmount } = renderPage()
  expect(await screen.findByLabelText('Balance teams by')).toBeInTheDocument()
  unmount()
  renderPage(FEATURES.filter((f) => f !== 'smart_balancing'))
  await waitFor(() => expect(screen.getAllByText(/^2 players/)).toHaveLength(3))
  expect(screen.queryByLabelText('Balance teams by')).not.toBeInTheDocument()
  expect(screen.queryByText(/Split duos/)).not.toBeInTheDocument()
})

it('a 4-team session makes four teams and queues the two that do not start', async () => {
  rows('sessions').find((x) => x.id === 's2')!.team_count = 4
  const extra = ['Rami', 'Tariq', 'Faris', 'Bilal', 'Jad', 'Karim', 'Laith'].map((name, i) =>
    ({ league_id: 'L1', id: `q${i}`, name, position: 'MID', skill_rating: 3, photo_url: null, is_active: true, created_at: '2026-01-01T00:00:00Z' }))
  rows('players').push(...extra)
  rows('session_players').push(...extra.map((pl) => ({ league_id: 'L1', session_id: 's2', player_id: pl.id })))
  const user = userEvent.setup()
  renderPage()
  // 13 players over 4 teams: 4, 3, 3, 3
  await waitFor(() => expect(screen.getAllByText(/^[34] players/)).toHaveLength(4))
  expect(screen.getAllByText(/^4 players/)).toHaveLength(1)

  await user.click(screen.getByRole('button', { name: 'Blue Team' }))
  await user.click(screen.getByRole('button', { name: 'Orange Team' }))
  await user.click(screen.getByRole('button', { name: 'Confirm Teams & Start' }))
  await waitFor(() => expect(screen.getByText(/^match page/)).toBeInTheDocument())

  const created = rows('teams').filter((t) => t.session_id === 's2')
  expect(created.map((t) => t.color)).toEqual(['green', 'blue', 'yellow', 'orange'])
  const id = (c: string) => created.find((t) => t.color === c)!.id
  const first = rows('matches').find((m) => m.session_id === 's2')!
  expect([first.team1_id, first.team2_id].sort()).toEqual([id('blue'), id('orange')].sort())
  expect(first.queue).toEqual([id('green'), id('yellow')])
  expect(first.waiting_team_id).toBe(id('green'))
})

it('the keeper warning counts the teams in the session', async () => {
  rows('sessions').find((x) => x.id === 's2')!.team_count = 2
  renderPage()
  // Only Ali keeps goal, and this session has 2 teams
  expect(await screen.findByText(/Fewer goalkeepers than teams \(2\)/)).toBeInTheDocument()
})

it("does not load another league's session", async () => {
  rows('sessions').find((x) => x.id === 's2')!.league_id = 'L2'
  renderPage()
  await waitFor(() => expect(db.reads).toBeGreaterThan(0))
  await new Promise((r) => setTimeout(r, 50))
  expect(screen.queryByText('Ali')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Confirm Teams & Start' })).toBeDisabled()
})

it('does not ask who plays first in a 2-team session (both always play)', async () => {
  rows('sessions').find((x) => x.id === 's2')!.team_count = 2
  renderPage()
  await waitFor(() => expect(screen.getAllByText(/^3 players/)).toHaveLength(2))
  expect(screen.queryByText('Who plays first?')).not.toBeInTheDocument()
})

describe('the teams are remembered until they are confirmed', () => {
  const s2 = () => rows('sessions').find((x) => x.id === 's2')!
  const saved = () => s2().draft_teams as string[][] | null | undefined
  // Which team's card a player is on
  const teamOf = (name: string) => screen.getByText(name).closest('section')!.querySelector('h2')!.textContent
  const sorted = (teams: string[][]) => teams.map((t) => [...t].sort())
  // An arrangement the balancer never makes (it keeps team sizes within one of each other)
  const uneven = [['p1', 'p2', 'p3', 'p4'], ['p5'], ['p6']]

  it('a first visit saves the teams it made', async () => {
    renderPage()
    await waitFor(() => expect(saved()).toHaveLength(3))
    expect(saved()!.flat().sort()).toEqual(attending)
    for (const [i, color] of ['Green Team', 'Blue Team', 'Yellow Team'].entries()) {
      for (const id of saved()![i]) expect(teamOf(rows('players').find((pl) => pl.id === id)!.name as string)).toBe(color)
    }
  })

  it('coming back shows the saved teams instead of a new shuffle', async () => {
    s2().draft_teams = uneven
    renderPage()
    expect(await screen.findByText(/^4 players/)).toBeInTheDocument()
    expect(screen.getAllByText(/^1 player ·/)).toHaveLength(2)
    for (const name of ['Ali', 'Omar', 'Sami', 'Zaid']) expect(teamOf(name)).toBe('Green Team')
    expect(teamOf('Hadi')).toBe('Blue Team')
    expect(teamOf('Nour')).toBe('Yellow Team')
    // Nothing was reshuffled, so nothing was written
    expect(db.writes).toEqual([])
  })

  it('a swap is saved', async () => {
    s2().draft_teams = [['p1', 'p2'], ['p3', 'p4'], ['p5', 'p6']]
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /Omar/ }))
    await user.click(screen.getByRole('button', { name: /Sami/ }))
    await waitFor(() => expect(saved()).toEqual([['p1', 'p3'], ['p2', 'p4'], ['p5', 'p6']]))
  })

  it('a move to another team is saved', async () => {
    s2().draft_teams = [['p1', 'p2'], ['p3', 'p4'], ['p5', 'p6']]
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /Omar/ }))
    await user.click(screen.getAllByRole('button', { name: 'Move here' })[1])
    await waitFor(() => expect(saved()).toEqual([['p1'], ['p3', 'p4'], ['p5', 'p6', 'p2']]))
  })

  it('Shuffle All makes new teams and saves them', async () => {
    s2().draft_teams = uneven
    const user = userEvent.setup()
    renderPage()
    await screen.findByText(/^4 players/)
    await user.click(screen.getByRole('button', { name: 'Shuffle All' }))
    await waitFor(() => expect(saved()!.map((t) => t.length)).toEqual([2, 2, 2]))
    expect(screen.getAllByText(/^2 players/)).toHaveLength(3)
    expect(saved()!.flat().sort()).toEqual(attending)
  })

  it('changing the stars/form mix makes new teams and saves them', async () => {
    s2().draft_teams = uneven
    renderPage()
    await screen.findByText(/^4 players/)
    fireEvent.change(screen.getByLabelText('Balance teams by'), { target: { value: '80' } })
    await waitFor(() => expect(saved()!.map((t) => t.length)).toEqual([2, 2, 2]))
    expect(screen.getAllByText(/^2 players/)).toHaveLength(3)
  })

  it('changing the split duos rule makes new teams and saves them', async () => {
    s2().draft_teams = uneven
    const user = userEvent.setup()
    renderPage()
    await screen.findByText(/^4 players/)
    await user.click(screen.getByRole('checkbox'))
    await waitFor(() => expect(saved()!.map((t) => t.length)).toEqual([2, 2, 2]))
  })

  it('makes new teams when the saved ones no longer match who is attending', async () => {
    // Nour (p6) was added after these teams were saved, and p7 is no longer attending
    s2().draft_teams = [['p1', 'p2'], ['p3', 'p4'], ['p5', 'p7']]
    renderPage()
    await waitFor(() => expect(screen.getAllByText(/^2 players/)).toHaveLength(3))
    expect(screen.getByText('Nour')).toBeInTheDocument()
    expect(screen.queryByText('Retired')).not.toBeInTheDocument()
    await waitFor(() => expect(saved()!.flat().sort()).toEqual(attending))
  })

  it('confirming starts with the saved teams and clears them', async () => {
    s2().draft_teams = uneven
    const user = userEvent.setup()
    renderPage()
    await screen.findByText(/^4 players/)
    await user.click(screen.getByRole('button', { name: 'Green Team' }))
    await user.click(screen.getByRole('button', { name: 'Blue Team' }))
    await user.click(screen.getByRole('button', { name: 'Confirm Teams & Start' }))
    await waitFor(() => expect(screen.getByText(/^match page/)).toBeInTheDocument())

    const idOf = (color: string) => rows('teams').find((t) => t.session_id === 's2' && t.color === color)!.id
    const playersOf = (color: string) => rows('team_players').filter((tp) => tp.team_id === idOf(color)).map((tp) => tp.player_id as string)
    expect(sorted([playersOf('green'), playersOf('blue'), playersOf('yellow')])).toEqual(uneven)
    await waitFor(() => expect(saved()).toBeNull())
    expect(s2().status).toBe('active')
  })

  it('does not save an arrangement for a session that has already started', async () => {
    s2().status = 'active'
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByText(/^2 players/)).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Shuffle All' }))
    expect(db.writes).toEqual([])
    expect(saved()).toBeNull()
  })

  it('on a database that does not have the column yet, works as before and sends no saves', async () => {
    // The app can be deployed before the migration; a refused save would show an error each time
    delete s2().draft_teams
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByText(/^2 players/)).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Shuffle All' }))
    await user.click(screen.getByRole('button', { name: /Omar/ }))
    await user.click(screen.getAllByRole('button', { name: 'Move here' })[0])
    await user.click(screen.getByRole('button', { name: 'Green Team' }))
    await user.click(screen.getByRole('button', { name: 'Blue Team' }))
    await user.click(screen.getByRole('button', { name: 'Confirm Teams & Start' }))
    await waitFor(() => expect(screen.getByText(/^match page/)).toBeInTheDocument())
    expect(s2().status).toBe('active')
    // The session is started by confirm_teams, not by a save from the page
    expect(db.writes.filter((w) => w.table === 'sessions')).toEqual([])
  })
})

describe('making a coach board from the teams', () => {
  const s2 = () => rows('sessions').find((x) => x.id === 's2')!
  const spotOf = (playerId: string) => rows('lineup_players').find((r) => r.player_id === playerId) as { lineup_id: string; x: number; y: number }

  it('puts every team on one new board, a row each, and opens it', async () => {
    s2().draft_teams = [['p1', 'p2'], ['p3', 'p4'], ['p5', 'p6']]
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByText(/^2 players/)).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Make coach board' }))

    await waitFor(() => expect(screen.getByText(/^board page/)).toBeInTheDocument())
    expect(rows('lineups')).toHaveLength(1)
    const board = rows('lineups')[0]
    expect(board).toMatchObject({ league_id: 'L1', name: '2026-10-06: Green / Blue / Yellow', guests: [] })
    expect(screen.getByText(`board page ${board.id}`)).toBeInTheDocument()

    expect(rows('lineup_players').map((r) => r.player_id).sort()).toEqual(attending)
    expect(rows('lineup_players').every((r) => r.lineup_id === board.id)).toBe(true)
    // Green on the top row, Blue in the middle, Yellow at the bottom; team-mates side by side
    for (const [a, b] of [['p1', 'p2'], ['p3', 'p4'], ['p5', 'p6']]) {
      expect(spotOf(a).y).toBe(spotOf(b).y)
      expect(spotOf(a).x).toBeLessThan(spotOf(b).x)
    }
    expect(spotOf('p1').y).toBeLessThan(spotOf('p3').y)
    expect(spotOf('p3').y).toBeLessThan(spotOf('p5').y)
  })

  it('writes each team name above its row', async () => {
    s2().draft_teams = [['p1', 'p2'], ['p3', 'p4'], ['p5', 'p6']]
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByText(/^2 players/)).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Make coach board' }))
    await waitFor(() => expect(screen.getByText(/^board page/)).toBeInTheDocument())

    const labels = rows('lineups')[0].drawings as { id: string; kind: string; team: string; text: string; x: number; y: number }[]
    expect(labels.map((l) => [l.kind, l.team, l.text, l.x])).toEqual([
      ['label', 'green', 'Green Team', 0.5], ['label', 'blue', 'Blue Team', 0.5], ['label', 'yellow', 'Yellow Team', 0.5],
    ])
    expect(new Set(labels.map((l) => l.id)).size).toBe(3)
    // Each name sits between the row above and its own row
    expect(labels[0].y).toBeLessThan(spotOf('p1').y)
    expect(labels[1].y).toBeGreaterThan(spotOf('p1').y)
    expect(labels[1].y).toBeLessThan(spotOf('p3').y)
    expect(labels[2].y).toBeGreaterThan(spotOf('p3').y)
    expect(labels[2].y).toBeLessThan(spotOf('p5').y)
  })

  it('leaves out the name of a team with nobody in it', async () => {
    s2().draft_teams = [['p1', 'p2', 'p3'], ['p4', 'p5', 'p6'], []]
    const user = userEvent.setup()
    renderPage()
    await screen.findByText(/^0 players/)
    await user.click(screen.getByRole('button', { name: 'Make coach board' }))
    await waitFor(() => expect(screen.getByText(/^board page/)).toBeInTheDocument())
    expect((rows('lineups')[0].drawings as { team: string }[]).map((l) => l.team)).toEqual(['green', 'blue'])
  })

  it('uses the teams as they are arranged now', async () => {
    s2().draft_teams = [['p1', 'p2'], ['p3', 'p4'], ['p5', 'p6']]
    const user = userEvent.setup()
    renderPage()
    // Omar moves from Green to Yellow before the board is made
    await user.click(await screen.findByRole('button', { name: /Omar/ }))
    await user.click(screen.getAllByRole('button', { name: 'Move here' })[1])
    await user.click(screen.getByRole('button', { name: 'Make coach board' }))
    await waitFor(() => expect(screen.getByText(/^board page/)).toBeInTheDocument())
    expect(spotOf('p2').y).toBe(spotOf('p5').y)
    expect(spotOf('p1')).toMatchObject({ x: 0.5 })
  })

  it('is offered only to leagues with the coach board', async () => {
    renderPage(FEATURES.filter((f) => f !== 'coach_board'))
    await waitFor(() => expect(screen.getAllByText(/^2 players/)).toHaveLength(3))
    expect(screen.queryByRole('button', { name: 'Make coach board' })).not.toBeInTheDocument()
  })

  it('cannot be pressed before there are teams', async () => {
    rows('session_players').length = 0
    renderPage()
    await waitFor(() => expect(db.reads).toBeGreaterThan(0))
    expect(screen.getByRole('button', { name: 'Make coach board' })).toBeDisabled()
  })

  it('stays on the teams and leaves no empty board behind when the players cannot be placed', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByText(/^2 players/)).toHaveLength(3))
    db.errors.lineup_players = { message: 'Failed to fetch' }
    await user.click(screen.getByRole('button', { name: 'Make coach board' }))
    await waitFor(() => expect(db.writes.some((w) => w.table === 'lineups' && w.op === 'delete')).toBe(true))
    expect(rows('lineups')).toEqual([])
    expect(screen.queryByText(/^board page/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Make coach board' })).toBeEnabled()
  })
})
