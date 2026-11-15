import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'
import { resetDb, rows } from '../../test/fakeSupabase'
import { match, players, session, teamPlayers, teams } from '../../test/fixtures'
import { FEATURES } from '../../lib/features'
import type { VoiceCommand } from '../../lib/voiceApi'
import { readVoiceAnswer } from '../../../supabase/functions/_shared/voiceCommand'

vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)

// The browser hears `heard`; Claude answers `answer`
let heard = ''
let answer: VoiceCommand
let supported = true
// Listening that never ends, to see the sheet while the mic is on
let hang = false
const understandVoice = vi.fn(async (input: unknown) => { void input; return { ok: true as const, command: answer } })
vi.mock('../../lib/speech', () => ({
  speechSupported: () => supported,
  speechLang: () => 'en-US',
  listenOnce: (_lang: string, onText: (t: string) => void) => {
    if (hang) return { done: new Promise(() => {}), stop: () => {}, cancel: () => {} }
    onText(heard)
    return { done: Promise.resolve({ text: heard, alternatives: [`${heard}!`] }), stop: () => {}, cancel: () => {} }
  },
}))
vi.mock('../../lib/voiceApi', () => ({ understandVoice: (input: unknown) => understandVoice(input) }))

import MatchTrackerPage from './MatchTrackerPage'
import { outbox } from '../../lib/pitchOutbox'

const cmd = (c: Partial<VoiceCommand>): VoiceCommand => ({ action: 'unknown', playerId: null, otherId: null, suspensionMinutes: null, candidates: [], ...c })

beforeEach(() => {
  outbox.dismissRejected()
  localStorage.clear()
  supported = true
  hang = false
  understandVoice.mockClear()
  resetDb({
    players, teams, team_players: teamPlayers,
    sessions: [{ ...session, status: 'active' }],
    matches: [match('m1')],
    match_events: [],
  })
})

const renderPage = () => render(
  <MemoryRouter initialEntries={['/admin/eagles/sessions/s1/match/m1']}><InLeague features={FEATURES}>
    <Routes><Route path="/admin/eagles/sessions/:sessionId/match/:matchId" element={<MatchTrackerPage />} /></Routes>
  </InLeague></MemoryRouter>,
)
const m1 = () => rows('matches').find((m) => m.id === 'm1')!

async function kickOff() {
  const user = userEvent.setup()
  renderPage()
  await user.click(await screen.findByRole('button', { name: '▶ Start' }))
  await waitFor(() => expect(m1().timer_status).toBe('running'))
  return user
}

it('records a spoken goal with its assist after Confirm', async () => {
  heard = 'goal Omar assist Ali'
  answer = cmd({ action: 'goal', playerId: 'p2', otherId: 'p1' })
  const user = await kickOff()

  await user.click(screen.getByRole('button', { name: '🎙️ Voice' }))
  expect(await screen.findByRole('heading', { name: '⚽ Goal' })).toBeInTheDocument()
  expect(screen.getByText('«goal Omar assist Ali»')).toBeInTheDocument()
  expect(screen.getByText('Assist: Ali')).toBeInTheDocument()
  // Nothing is saved before Confirm
  expect(rows('match_events')).toHaveLength(0)

  // Claude gets the players on the pitch and the waiting team (for swaps)
  const sent = understandVoice.mock.calls[0][0] as { text: string; alternatives: string[]; players: { id: string; playing: boolean }[] }
  expect(sent.text).toBe('goal Omar assist Ali')
  expect(sent.alternatives).toEqual(['goal Omar assist Ali!'])
  expect(sent.players.find((p) => p.id === 'p5')).toMatchObject({ playing: false })
  expect(sent.players.find((p) => p.id === 'p2')).toMatchObject({ playing: true })

  await user.click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(m1().team1_score).toBe(1))
  const goal = rows('match_events').find((e) => e.event_type === 'goal')!
  expect(goal).toMatchObject({ player_id: 'p2', team_id: 'tg' })
  expect(rows('match_events').find((e) => e.event_type === 'assist')).toMatchObject({ player_id: 'p1', related_event_id: goal.id })
})

it('asks which player when the name could be several, then records the card', async () => {
  heard = 'yellow Sam'
  answer = cmd({ action: 'yellow_card', candidates: ['p3', 'p4'] })
  const user = await kickOff()

  await user.click(screen.getByRole('button', { name: '🎙️ Voice' }))
  expect(await screen.findByText('Which player?')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Omar' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Sami' }))
  await user.click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(rows('match_events').find((e) => e.event_type === 'yellow_card')).toMatchObject({ player_id: 'p3', team_id: 'tb' }))
})

it('a red card waits for the suspension length', async () => {
  heard = 'red Zaid'
  answer = cmd({ action: 'red_card', playerId: 'p4' })
  const user = await kickOff()

  await user.click(screen.getByRole('button', { name: '🎙️ Voice' }))
  await screen.findByRole('heading', { name: '🟥 Red card' })
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: '3 min' }))
  await user.click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(rows('match_events').find((e) => e.event_type === 'red_card')).toMatchObject({ player_id: 'p4', suspension_minutes: 3 }))
})

it('pauses the clock by voice', async () => {
  heard = 'pause'
  answer = cmd({ action: 'pause' })
  const user = await kickOff()

  await user.click(screen.getByRole('button', { name: '🎙️ Voice' }))
  await screen.findByRole('heading', { name: '⏸ Pause the clock' })
  await user.click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(m1().timer_status).toBe('paused'))
})

it('Edit opens the usual dialog instead', async () => {
  heard = 'goal Omar'
  answer = cmd({ action: 'goal', playerId: 'p2' })
  const user = await kickOff()

  await user.click(screen.getByRole('button', { name: '🎙️ Voice' }))
  await screen.findByRole('heading', { name: '⚽ Goal' })
  await user.click(screen.getByRole('button', { name: 'Edit' }))
  expect(screen.getByRole('heading', { name: 'Who scored?' })).toBeInTheDocument()
})

it('says so when it did not understand, and saves nothing', async () => {
  heard = 'what a game'
  answer = cmd({ action: 'unknown' })
  const user = await kickOff()

  await user.click(screen.getByRole('button', { name: '🎙️ Voice' }))
  expect(await screen.findByRole('heading', { name: "Didn't get that" })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  expect(rows('match_events')).toHaveLength(0)
})

it('the mic is locked until the clock starts', async () => {
  renderPage()
  expect(await screen.findByRole('button', { name: '🎙️ Voice' })).toBeDisabled()
})

it('hides the mic where the browser has no speech recognition', async () => {
  supported = false
  renderPage()
  await screen.findByRole('button', { name: '▶ Start' })
  expect(screen.queryByRole('button', { name: '🎙️ Voice' })).not.toBeInTheDocument()
})

it('changing the scorer to the assister leaves the goal with no assist', async () => {
  heard = 'goal Omar assist Ali'
  answer = cmd({ action: 'goal', playerId: 'p2', otherId: 'p1' })
  const user = await kickOff()

  await user.click(screen.getByRole('button', { name: '🎙️ Voice' }))
  await user.click(await screen.findByRole('button', { name: 'Not this player' }))
  await user.click(screen.getByRole('button', { name: 'Ali' }))
  expect(screen.getByText('No assist')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Confirm' }))

  await waitFor(() => expect(rows('match_events').find((e) => e.event_type === 'goal')).toMatchObject({ player_id: 'p1' }))
  expect(rows('match_events').some((e) => e.event_type === 'assist')).toBe(false)
})

it('will not swap two players of the same team', async () => {
  heard = 'swap Ali with Omar'
  answer = cmd({ action: 'swap', playerId: 'p1', otherId: 'p2' })
  const user = await kickOff()

  await user.click(screen.getByRole('button', { name: '🎙️ Voice' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Both players are on the same team')
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  expect(rows('match_events')).toHaveLength(0)
})

it('Try again shows the mic listening straight away', async () => {
  heard = 'what a game'
  answer = cmd({ action: 'unknown' })
  const user = await kickOff()

  await user.click(screen.getByRole('button', { name: '🎙️ Voice' }))
  await screen.findByRole('heading', { name: "Didn't get that" })
  hang = true
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(screen.getByRole('heading', { name: 'Listening… say what happened' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: "Didn't get that" })).not.toBeInTheDocument()
})

it('keeps a clear assist and asks for a scorer that was not understood', async () => {
  heard = 'goal mmm assist Ali'
  answer = cmd({ action: 'goal', otherId: 'p1' })
  const user = await kickOff()

  await user.click(screen.getByRole('button', { name: '🎙️ Voice' }))
  expect(await screen.findByText('Who scored?')).toBeInTheDocument()
  expect(screen.getByText('Assist: Ali')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Omar' }))
  await user.click(screen.getByRole('button', { name: 'Confirm' }))

  await waitFor(() => expect(rows('match_events').find((e) => e.event_type === 'goal')).toMatchObject({ player_id: 'p2' }))
  expect(rows('match_events').find((e) => e.event_type === 'assist')).toMatchObject({ player_id: 'p1' })
})

it('one tap makes the named player the scorer when the name came back as the assist', async () => {
  heard = 'goal from Ali'
  answer = cmd({ action: 'goal', otherId: 'p1' })
  const user = await kickOff()

  await user.click(screen.getByRole('button', { name: '🎙️ Voice' }))
  await user.click(await screen.findByRole('button', { name: 'Ali scored it (no assist)' }))
  await user.click(screen.getByRole('button', { name: 'Confirm' }))

  await waitFor(() => expect(rows('match_events').find((e) => e.event_type === 'goal')).toMatchObject({ player_id: 'p1' }))
  expect(rows('match_events').some((e) => e.event_type === 'assist')).toBe(false)
})

it('offers a player by their misheard surname and saves only after they are picked and confirmed', async () => {
  heard = 'دجل سجل جول'
  const namedPlayers = players.map((p) => p.id === 'p2' ? { ...p, name: 'محمد العجل' } : p)
  resetDb({
    players: namedPlayers, teams, team_players: teamPlayers,
    sessions: [{ ...session, status: 'active' }], matches: [match('m1')], match_events: [],
  })
  answer = readVoiceAnswer(
    { action: 'goal', player: null, other_player: null, suspension_minutes: null, candidates: [] },
    [{ id: 'p2', name: 'محمد العجل', team: 'green', playing: true }],
    { text: heard, alternatives: [] },
  )
  const user = await kickOff()
  await user.click(screen.getByRole('button', { name: '🎙️ Voice' }))
  await screen.findByText('Who scored?')
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  expect(rows('match_events')).toHaveLength(0)
  await user.click(screen.getByRole('button', { name: 'محمد العجل' }))
  expect(rows('match_events')).toHaveLength(0)
  await user.click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(rows('match_events').find((e) => e.event_type === 'goal')).toMatchObject({ player_id: 'p2' }))
  expect(rows('match_events').some((e) => e.event_type === 'assist')).toBe(false)
})
