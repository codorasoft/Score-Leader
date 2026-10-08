import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { db, resetDb, rows } from '../test/fakeSupabase'
import { players } from '../test/fixtures'

vi.mock('../lib/supabase', async () => (await import('../test/fakeSupabase')).supabaseModule)

import { SessionVotes } from './SessionVotes'

const vote = (id: string, award_type: string, status = 'open', extra = {}) => ({
  id, league_id: 'L1', session_id: 's1', award_type, status, vote_token: `tok-${id}`, winner_player_id: null,
  created_at: `2026-09-20T20:0${id.slice(-1)}:00Z`, ...extra,
})

beforeEach(() => {
  resetDb({
    players,
    award_votes: [vote('v1', 'mvp'), vote('v2', 'fair_play', 'closed', { winner_player_id: 'p3' })],
    award_vote_nominations: [
      { award_vote_id: 'v1', player_id: 'p1' }, { award_vote_id: 'v1', player_id: 'p2' },
      { award_vote_id: 'v2', player_id: 'p3' }, { award_vote_id: 'v2', player_id: 'p4' },
    ],
    award_vote_entries: [
      { award_vote_id: 'v1', player_id: 'p2' }, { award_vote_id: 'v1', player_id: 'p2' }, { award_vote_id: 'v1', player_id: 'p1' },
      { award_vote_id: 'v2', player_id: 'p3' },
    ],
  })
})

it('shows each vote with its nominees, counts and winner', async () => {
  render(<SessionVotes sessionId="s1" />)
  expect(await screen.findByText('3 votes', { exact: false })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Close vote · Winner: Omar/ })).toBeInTheDocument()
  expect(screen.getByText('Ali')).toBeInTheDocument()
  expect(screen.getByText('Winner: Sami')).toBeInTheDocument()
})

it('loads the votes, nominees, names and ballots in one request', async () => {
  render(<SessionVotes sessionId="s1" />)
  await screen.findByRole('button', { name: /Close vote/ })
  expect(db.reads).toBe(1)
})

it('closing a vote records the award and shows the vote as closed', async () => {
  render(<SessionVotes sessionId="s1" />)
  await userEvent.click(await screen.findByRole('button', { name: /Close vote · Winner: Omar/ }))
  await waitFor(() => expect(rows('award_votes').find((v) => v.id === 'v1')).toMatchObject({ status: 'closed', winner_player_id: 'p2' }))
  expect(rows('session_awards')).toMatchObject([{ session_id: 's1', award_type: 'mvp', winner_player_id: 'p2', decided_by: 'vote', is_tied: false }])
  await waitFor(() => expect(screen.queryByRole('button', { name: /Close vote/ })).not.toBeInTheDocument())
  expect(screen.getByText('Winner: Omar')).toBeInTheDocument()
})

it('shows nothing when the session has no votes', async () => {
  resetDb({ players })
  const { container } = render(<SessionVotes sessionId="s1" />)
  await waitFor(() => expect(db.reads).toBeGreaterThan(0))
  expect(container).toBeEmptyDOMElement()
})
