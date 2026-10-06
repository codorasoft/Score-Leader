import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'
import { db, resetDb, rows } from '../../test/fakeSupabase'
import { players } from '../../test/fixtures'
import { FEATURES } from '../../lib/features'

vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)
vi.mock('../../utils/fingerprint', () => ({ getFingerprint: async () => 'device-1' }))

import VotePage from './VotePage'

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
