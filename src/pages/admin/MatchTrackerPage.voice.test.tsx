import { render, screen, waitFor, within } from '@testing-library/react'
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
let untilStop = false
const understandVoice = vi.fn(async (input: unknown) => { void input; return { ok: true as const, command: answer } })
vi.mock('../../lib/speech', () => ({
  speechSupported: () => supported,
  speechLang: () => 'en-US',
  listenOnce: (_lang: string, onText: (t: string) => void, options: { onReady?: () => void } = {}) => {
    if (hang) return { done: new Promise(() => {}), stop: () => {}, cancel: () => {} }
    options.onReady?.()
    // Push to talk: nothing is final until the mic is let go
    if (untilStop) {
      onText(heard)
      let finish = () => {}
      const done = new Promise((resolve) => { finish = () => resolve({ text: heard, alternatives: [] }) })
      return { done, stop: () => finish(), cancel: () => {} }
    }
    onText(heard)
    return { done: Promise.resolve({ text: heard, alternatives: [`${heard}!`] }), stop: () => {}, cancel: () => {} }
  },
}))
vi.mock('../../lib/voiceApi', () => ({ understandVoice: (input: unknown) => understandVoice(input) }))

import MatchTrackerPage from './MatchTrackerPage'
import { outbox } from '../../lib/pitchOutbox'

const cmd = (c: Partial<VoiceCommand>): VoiceCommand => ({ action: 'unknown', playerId: null, otherId: null, suspensionMinutes: null, candidates: [], otherCandidates: [], ...c })

beforeEach(() => {
  outbox.dismissRejected()
  localStorage.clear()
  supported = true
  hang = false
  untilStop = false
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

it('takes the one player a misheard surname points to, and saves only after Confirm', async () => {
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
  expect(await screen.findByText('محمد العجل')).toBeInTheDocument()
  expect(screen.queryByText('Who scored?')).not.toBeInTheDocument()
  expect(rows('match_events')).toHaveLength(0)
  await user.click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(rows('match_events').find((e) => e.event_type === 'goal')).toMatchObject({ player_id: 'p2' }))
  expect(rows('match_events').some((e) => e.event_type === 'assist')).toBe(false)
})

it('understands a clear command in the app without asking Claude', async () => {
  heard = 'goal Omar'
  answer = cmd({ action: 'unknown' })
  const user = await kickOff()

  await user.click(screen.getByRole('button', { name: '🎙️ Voice' }))
  expect(await screen.findByRole('heading', { name: '⚽ Goal' })).toBeInTheDocument()
  expect(understandVoice).not.toHaveBeenCalled()
  expect(rows('match_events')).toHaveLength(0)
  await user.click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(rows('match_events').find((e) => e.event_type === 'goal')).toMatchObject({ player_id: 'p2' }))
})

it('takes the only player on the list instead of asking', async () => {
  heard = 'yellow Sammy'
  answer = cmd({ action: 'yellow_card', candidates: ['p3'] })
  const user = await kickOff()

  await user.click(screen.getByRole('button', { name: '🎙️ Voice' }))
  await screen.findByRole('heading', { name: '🟨 Yellow card' })
  expect(screen.queryByText('Which player?')).not.toBeInTheDocument()
  expect(screen.getByText('Sami')).toBeInTheDocument()
  // "Not this player" offers everyone, not the same list of one
  await user.click(screen.getByRole('button', { name: 'Not this player' }))
  expect(screen.getByRole('button', { name: 'Omar' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Sami' }))
  await user.click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(rows('match_events').find((e) => e.event_type === 'yellow_card')).toMatchObject({ player_id: 'p3' }))
})

it('keeps a clear scorer and asks only who assisted', async () => {
  heard = 'goal Omar assist Sa'
  answer = cmd({ action: 'goal', playerId: 'p2', otherCandidates: ['p1', 'p3'] })
  const user = await kickOff()

  await user.click(screen.getByRole('button', { name: '🎙️ Voice' }))
  expect(await screen.findByText('Who assisted? Tap Confirm if nobody did.')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Ali' }))
  await user.click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(rows('match_events').find((e) => e.event_type === 'assist')).toMatchObject({ player_id: 'p1' }))
  expect(rows('match_events').find((e) => e.event_type === 'goal')).toMatchObject({ player_id: 'p2' })
})

it('a swap with one clear player asks for the other from another team', async () => {
  heard = 'swap Ali with mmm'
  answer = cmd({ action: 'swap', playerId: 'p1' })
  const user = await kickOff()

  await user.click(screen.getByRole('button', { name: '🎙️ Voice' }))
  expect(await screen.findByText('Swap Ali with?')).toBeInTheDocument()
  // Ali's own team is not offered
  expect(screen.queryByRole('button', { name: 'Omar' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Sami' }))
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled()
})

it('push to talk: holding the mic listens until it is let go', async () => {
  heard = 'pause'
  untilStop = true
  const user = await kickOff()
  const mic = screen.getByRole('button', { name: '🎙️ Voice' })
  const now = vi.spyOn(Date, 'now')

  now.mockReturnValue(1_000)
  await user.pointer({ keys: '[MouseLeft>]', target: mic })
  expect(await screen.findByText("Speak now, and let go when you're done")).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Listening… say what happened' })).toBeInTheDocument()

  now.mockReturnValue(2_500)
  await user.pointer({ keys: '[/MouseLeft]', target: mic })
  await screen.findByRole('heading', { name: '⏸ Pause the clock' })
  now.mockRestore()
  await user.click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(m1().timer_status).toBe('paused'))
})

it('a quick tap keeps listening after the finger is lifted', async () => {
  heard = 'pause'
  untilStop = true
  const user = await kickOff()
  await user.click(screen.getByRole('button', { name: '🎙️ Voice' }))
  expect(await screen.findByRole('heading', { name: 'Listening… say what happened' })).toBeInTheDocument()
  expect(screen.queryByText("Speak now, and let go when you're done")).not.toBeInTheDocument()
  // The referee ends it with Done, or by going quiet
  await user.click(screen.getByRole('button', { name: 'Done' }))
  await screen.findByRole('heading', { name: '⏸ Pause the clock' })
})

it('a score card shows that team\'s players and what they did in the match', async () => {
  heard = 'goal Omar'
  const user = await kickOff()
  await user.click(screen.getByRole('button', { name: '🎙️ Voice' }))
  await user.click(await screen.findByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(m1().team1_score).toBe(1))

  await user.click(screen.getByRole('button', { name: 'Green Team: show players' }))
  const sheet = await screen.findByRole('dialog', { name: /Green Team/ })
  expect(sheet).toHaveTextContent('2 players')
  expect(sheet).toHaveTextContent('Ali')
  expect(sheet).toHaveTextContent('Omar⚽')
  expect(sheet).not.toHaveTextContent('Sami')
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Blue Team: show players' }))
  expect(await screen.findByRole('dialog', { name: /Blue Team/ })).toHaveTextContent('Sami')
})

describe('saving a clear command on its own', () => {
  const chooseAuto = async (user: Awaited<ReturnType<typeof kickOff>>) => {
    await user.click(screen.getByRole('radio', { name: 'Save on its own when clear' }))
  }

  it('is off until chosen, and is remembered on this phone', async () => {
    const user = await kickOff()
    expect(screen.getByRole('radio', { name: 'I confirm' })).toBeChecked()
    await chooseAuto(user)
    expect(localStorage.getItem('voice.autoSave')).toBe('1')
  })

  it('records a clear goal with no Confirm, says so, and Undo takes it back', async () => {
    heard = 'goal Omar assist Ali'
    answer = cmd({ action: 'goal', playerId: 'p2', otherId: 'p1' })
    const user = await kickOff()
    await chooseAuto(user)

    await user.click(screen.getByRole('button', { name: '🎙️ Voice' }))
    await waitFor(() => expect(m1().team1_score).toBe(1))
    expect(rows('match_events').find((e) => e.event_type === 'assist')).toMatchObject({ player_id: 'p1' })
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
    const saved = await screen.findByRole('status')
    expect(saved).toHaveTextContent('Saved by voice')
    expect(saved).toHaveTextContent('⚽ Goal — Omar')

    await user.click(within(saved).getByRole('button', { name: '↶ Undo' }))
    await waitFor(() => expect(m1().team1_score).toBe(0))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('pauses the clock on its own', async () => {
    heard = 'pause'
    const user = await kickOff()
    await chooseAuto(user)
    await user.click(screen.getByRole('button', { name: '🎙️ Voice' }))
    await waitFor(() => expect(m1().timer_status).toBe('paused'))
    expect(await screen.findByRole('status')).toHaveTextContent('⏸ Pause the clock')
  })

  it('still asks when the player was a guess', async () => {
    heard = 'yellow Sam'
    answer = cmd({ action: 'yellow_card', candidates: ['p3'] })
    const user = await kickOff()
    await chooseAuto(user)
    await user.click(screen.getByRole('button', { name: '🎙️ Voice' }))
    // One guess is filled in, but the referee still confirms it
    await screen.findByRole('heading', { name: '🟨 Yellow card' })
    expect(rows('match_events')).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(rows('match_events').find((e) => e.event_type === 'yellow_card')).toMatchObject({ player_id: 'p3' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('still asks for an unsure assist, and never undoes on its own', async () => {
    heard = 'goal Omar assist Sa'
    answer = cmd({ action: 'goal', playerId: 'p2', otherCandidates: ['p1', 'p3'] })
    const user = await kickOff()
    await chooseAuto(user)
    await user.click(screen.getByRole('button', { name: '🎙️ Voice' }))
    expect(await screen.findByText('Who assisted? Tap Confirm if nobody did.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(m1().team1_score).toBe(1))

    heard = 'undo'
    await user.click(screen.getByRole('button', { name: '🎙️ Voice' }))
    await screen.findByRole('heading', { name: '↶ Undo the last event' })
    expect(m1().team1_score).toBe(1)
  })
})

it('a misheard name after the assist word never shows up as the scorer', async () => {
  heard = 'هدف أسيست دجل'
  const namedPlayers = players.map((p) => p.id === 'p2' ? { ...p, name: 'محمد العجل' } : p)
  resetDb({
    players: namedPlayers, teams, team_players: teamPlayers,
    sessions: [{ ...session, status: 'active' }], matches: [match('m1')], match_events: [],
  })
  answer = readVoiceAnswer(
    { action: 'goal', player: null, other_player: null, suspension_minutes: null, candidates: [] },
    [{ id: 'p1', name: 'Ali', team: 'green', playing: true }, { id: 'p2', name: 'محمد العجل', team: 'green', playing: true }],
    { text: heard, alternatives: [] },
  )
  const user = await kickOff()
  await user.click(screen.getByRole('button', { name: '🎙️ Voice' }))
  // The scorer is asked; محمد العجل is not put in the scorer's place
  expect(await screen.findByText('Who scored?')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Ali' }))
  // Then the assister, offered from the name heard after the assist word
  expect(screen.getByText('Who assisted? Tap Confirm if nobody did.')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'محمد العجل' }))
  expect(screen.getByText('Assist: محمد العجل')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(rows('match_events').find((e) => e.event_type === 'goal')).toMatchObject({ player_id: 'p1' }))
  expect(rows('match_events').find((e) => e.event_type === 'assist')).toMatchObject({ player_id: 'p2' })
})

it('a guess offered for both roles is not taken as the scorer', async () => {
  heard = 'goal mmm assist Om'
  answer = cmd({ action: 'goal', candidates: ['p2'], otherCandidates: ['p2'] })
  const user = await kickOff()
  await user.click(screen.getByRole('button', { name: '🎙️ Voice' }))
  expect(await screen.findByText('Who scored?')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
})
