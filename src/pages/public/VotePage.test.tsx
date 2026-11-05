import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'
import { db, resetDb, rows } from '../../test/fakeSupabase'
import { players } from '../../test/fixtures'
import { FEATURES } from '../../lib/features'

vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)

import VotePage from './VotePage'

// This phone has voted (or opened a vote) before: its id is already stored
beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('scoreleader.voter', 'device-1')
})

const vote = (status = 'open') => ({ id: 'v1', league_id: 'L1', session_id: 's1', award_type: 'mvp', status, vote_token: 'tok-v', decided_by: 'vote', winner_player_id: null })
const nominations = [{ award_vote_id: 'v1', player_id: 'p2' }, { award_vote_id: 'v1', player_id: 'p5' }]

const renderPage = (features = FEATURES) => render(
  <MemoryRouter initialEntries={['/v/tok-v']}><InLeague features={features}>
    <Routes><Route path="/v/:voteToken" element={<VotePage />} /></Routes>
  </InLeague></MemoryRouter>,
)

it('lets a player pick a nominee and records one vote for this device', async () => {
  resetDb({ award_votes: [vote()], award_vote_nominations: nominations, players })
  const user = userEvent.setup()
  renderPage()
  expect(await screen.findByRole('heading', { name: 'MVP' })).toBeInTheDocument()
  const submit = screen.getByRole('button', { name: 'Submit Vote' })
  expect(submit).toBeDisabled()
  expect(screen.queryByRole('button', { name: 'Ali' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Hadi' }))
  await user.click(submit)
  expect(await screen.findByText('Your vote has been recorded.')).toBeInTheDocument()
  expect(rows('award_vote_entries')).toEqual([expect.objectContaining({ award_vote_id: 'v1', voter_fingerprint: 'device-1', player_id: 'p5' })])
})

it('lets two phones of the same model both vote', async () => {
  resetDb({ award_votes: [vote()], award_vote_nominations: nominations, players })
  const user = userEvent.setup()
  // jsdom gives every render the same browser details, like two identical phones
  for (const choice of ['Hadi', 'Omar']) {
    localStorage.clear() // a phone that has never opened a vote
    const { unmount } = renderPage()
    await user.click(await screen.findByRole('button', { name: choice }))
    await user.click(screen.getByRole('button', { name: 'Submit Vote' }))
    expect(await screen.findByText('Your vote has been recorded.')).toBeInTheDocument()
    unmount()
  }
  const entries = rows('award_vote_entries')
  expect(entries.map((e) => e.player_id)).toEqual(['p5', 'p2'])
  expect(entries[0].voter_fingerprint).not.toBe(entries[1].voter_fingerprint)
})

it('does not offer a second vote from the same device', async () => {
  resetDb({
    award_votes: [vote()], award_vote_nominations: nominations, players,
    award_vote_entries: [{ id: 'x', award_vote_id: 'v1', voter_fingerprint: 'device-1', player_id: 'p2' }],
  })
  renderPage()
  expect(await screen.findByText('Your vote has been recorded.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Submit Vote' })).not.toBeInTheDocument()
})

it('shows a closed vote as closed', async () => {
  resetDb({ award_votes: [vote('closed')], award_vote_nominations: nominations, players })
  renderPage()
  expect(await screen.findByText('This vote is closed.')).toBeInTheDocument()
})

it('treats the vote as closed when voting is switched off for the league', async () => {
  resetDb({ award_votes: [vote()], award_vote_nominations: nominations, players })
  renderPage(FEATURES.filter((f) => f !== 'voting'))
  expect(await screen.findByText('This vote is closed.')).toBeInTheDocument()
})

it('says when the vote link is unknown', async () => {
  resetDb()
  renderPage()
  expect(await screen.findByText('Vote not found')).toBeInTheDocument()
  expect(db.writes).toEqual([])
})

it('keeps the choice and says so when the vote could not be saved', async () => {
  resetDb({ award_votes: [vote()], award_vote_nominations: nominations, players })
  const user = userEvent.setup()
  renderPage()
  await user.click(await screen.findByRole('button', { name: 'Hadi' }))
  db.errors.award_vote_entries = { message: 'Failed to fetch' }
  await user.click(screen.getByRole('button', { name: 'Submit Vote' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.')
  expect(screen.queryByText('Your vote has been recorded.')).not.toBeInTheDocument()

  delete db.errors.award_vote_entries
  await user.click(screen.getByRole('button', { name: 'Submit Vote' }))
  expect(await screen.findByText('Your vote has been recorded.')).toBeInTheDocument()
  expect(rows('award_vote_entries')).toHaveLength(1)
})

it('counts a duplicate vote from this device as already recorded', async () => {
  resetDb({ award_votes: [vote()], award_vote_nominations: nominations, players })
  const user = userEvent.setup()
  renderPage()
  await user.click(await screen.findByRole('button', { name: 'Hadi' }))
  db.errors.award_vote_entries = { message: 'duplicate key value violates unique constraint', code: '23505' }
  await user.click(screen.getByRole('button', { name: 'Submit Vote' }))
  expect(await screen.findByText('Your vote has been recorded.')).toBeInTheDocument()
})

it('shows the vote as closed when it closed while the page was open', async () => {
  resetDb({ award_votes: [vote()], award_vote_nominations: nominations, players })
  const user = userEvent.setup()
  renderPage()
  await user.click(await screen.findByRole('button', { name: 'Hadi' }))
  db.errors.award_vote_entries = { message: 'new row violates row-level security policy for table "award_vote_entries"', code: '42501' }
  await user.click(screen.getByRole('button', { name: 'Submit Vote' }))
  expect(await screen.findByText('This vote is closed.')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it.each(['award_votes', 'award_vote_entries', 'award_vote_nominations', 'players'])(
  'offers a retry when loading %s fails, without showing a missing vote or a partial ballot',
  async (table) => {
    resetDb({ award_votes: [vote()], award_vote_nominations: nominations, players })
    db.errors[table] = { message: 'Failed to fetch' }
    const user = userEvent.setup()
    renderPage()

    const retry = await screen.findByRole('button', { name: 'Retry' })
    expect(screen.queryByText('Vote not found')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Submit Vote' })).not.toBeInTheDocument()
    expect(db.writes).toEqual([])

    delete db.errors[table]
    await user.click(retry)
    expect(await screen.findByRole('button', { name: 'Hadi' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Omar' })).toBeInTheDocument()
  },
)

it('recovers from a rejected loading request', async () => {
  resetDb({ award_votes: [vote()], award_vote_nominations: nominations, players })
  let reject!: (error: Error) => void
  db.holds.award_votes = new Promise((_, fail) => { reject = fail })
  const user = userEvent.setup()
  renderPage()

  await act(async () => { reject(new Error('Connection interrupted')) })
  const retry = await screen.findByRole('button', { name: 'Retry' })
  delete db.holds.award_votes
  await user.click(retry)
  expect(await screen.findByRole('button', { name: 'Hadi' })).toBeInTheDocument()
})

it('re-enables submission after a rejected request and preserves the selected nominee', async () => {
  resetDb({ award_votes: [vote()], award_vote_nominations: nominations, players })
  const user = userEvent.setup()
  renderPage()
  await user.click(await screen.findByRole('button', { name: 'Hadi' }))
  let reject!: (error: Error) => void
  db.holds.award_vote_entries = new Promise((_, fail) => { reject = fail })
  const submit = screen.getByRole('button', { name: 'Submit Vote' })
  await user.click(submit)
  expect(submit).toBeDisabled()

  await act(async () => { reject(new Error('Connection interrupted')) })
  expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.')
  expect(submit).toBeEnabled()
  delete db.holds.award_vote_entries
  await user.click(submit)
  expect(await screen.findByText('Your vote has been recorded.')).toBeInTheDocument()
  expect(rows('award_vote_entries')).toEqual([expect.objectContaining({ player_id: 'p5' })])
})

it('shows a closed vote without depending on ballot queries', async () => {
  resetDb({ award_votes: [vote('closed')] })
  db.errors.award_vote_entries = { message: 'Failed to fetch' }
  db.errors.award_vote_nominations = { message: 'Failed to fetch' }
  renderPage()
  expect(await screen.findByText('This vote is closed.')).toBeInTheDocument()
})

it('does not mark a new ballot as submitted when the previous ballot finishes saving', async () => {
  resetDb({
    award_votes: [vote(), { ...vote(), id: 'v2', vote_token: 'tok-next', award_type: 'best_goal' }],
    award_vote_nominations: [...nominations, { award_vote_id: 'v2', player_id: 'p2' }],
    players,
  })
  const router = createMemoryRouter([
    { path: '/v/:voteToken', element: <InLeague><VotePage /></InLeague> },
  ], { initialEntries: ['/v/tok-v'] })
  const user = userEvent.setup()
  render(<RouterProvider router={router} />)
  await user.click(await screen.findByRole('button', { name: 'Hadi' }))
  let finish!: () => void
  db.holds.award_vote_entries = new Promise<void>((resolve) => { finish = resolve })
  await user.click(screen.getByRole('button', { name: 'Submit Vote' }))

  await act(async () => { await router.navigate('/v/tok-next') })
  await act(async () => { finish() })
  expect(await screen.findByRole('button', { name: 'Omar' })).toBeInTheDocument()
  expect(screen.queryByText('Your vote has been recorded.')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Hadi' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Submit Vote' })).toBeDisabled()

  await user.click(screen.getByRole('button', { name: 'Omar' }))
  await user.click(screen.getByRole('button', { name: 'Submit Vote' }))
  expect(await screen.findByText('Your vote has been recorded.')).toBeInTheDocument()
  expect(rows('award_vote_entries').map((entry) => [entry.award_vote_id, entry.player_id]))
    .toEqual([['v1', 'p5'], ['v2', 'p2']])
})
