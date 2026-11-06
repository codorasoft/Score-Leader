import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'
import { db, resetDb } from '../../test/fakeSupabase'
import { event, finishedLeague, match, session, team } from '../../test/fixtures'
import { PRESETS } from '../../utils/matchFormat'

vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)

import * as realtime from '../../hooks/useRealtime'
import * as sessionData from '../../lib/sessionData'
import * as standings from '../../utils/standings'
import LiveSessionPage from './LiveSessionPage'

const renderPage = () => render(
  <MemoryRouter initialEntries={['/s/tok1']}><InLeague>
    <Routes><Route path="/s/:token" element={<LiveSessionPage />} /></Routes>
  </InLeague></MemoryRouter>,
)

it('shows the match being played: clock, score, waiting team and goals', async () => {
  const league = finishedLeague()
  resetDb({
    ...league,
    sessions: [{ ...session, status: 'active' }],
    matches: [...league.matches, match('m3', {
      match_number: 3, team1_id: 'ty', team2_id: 'tb', waiting_team_id: 'tg', queue: ['tg'], status: 'active',
      team1_score: 1, team2_score: 0, timer_status: 'paused', timer_elapsed_seconds: 125,
    })],
    match_events: [...league.match_events, event('e9', 'm3', 'p6', 'ty', 'goal', { minute: 1, elapsed_seconds: 100 })],
  })
  renderPage()
  expect(await screen.findByText('Match #3')).toBeInTheDocument()
  expect(await screen.findByText('02:05')).toBeInTheDocument()
  expect(screen.getByText('Paused')).toBeInTheDocument()
  expect(screen.getByText('Next up: Green Team')).toBeInTheDocument()
  expect(screen.getAllByText('Nour').length).toBeGreaterThan(0)
})

it('shows the day and results when no match is being played', async () => {
  resetDb({ ...finishedLeague(), sessions: [{ ...session, status: 'active' }] })
  renderPage()
  expect(await screen.findByText('No active match')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /20 Sep/ })).toBeInTheDocument()
  expect(screen.getAllByText('Omar').length).toBeGreaterThan(0)
})

it.each(['pending', 'active'] as const)('shows the final results when a completed booking still has a %s match', async (status) => {
  const league = finishedLeague()
  resetDb({
    ...league,
    matches: [...league.matches, match('m3', { match_number: 3, status, period_seconds: [0] })],
  })
  renderPage()
  expect(await screen.findByRole('heading', { name: /Last match/i })).toBeInTheDocument()
  expect(screen.queryByText('Match #3')).not.toBeInTheDocument()
  expect(screen.queryByText('Half-time')).not.toBeInTheDocument()
  expect(screen.getByText('Completed')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /#2.*1.*Yellow Team wins/ })).toBeInTheDocument()
})

it('switches an open score page to the final results when only the booking status changes', async () => {
  const league = finishedLeague()
  resetDb({
    ...league,
    sessions: [{ ...session, status: 'active' }],
    matches: [...league.matches, match('m3', { match_number: 3 })],
  })
  let onSessionChange: (() => void) | undefined
  const subscription = vi.spyOn(realtime, 'useRealtime').mockImplementation((table, filter, cb) => {
    if (table === 'sessions') onSessionChange = filter.column === 'id' && filter.value === session.id ? cb : undefined
  })
  try {
    renderPage()
    expect(await screen.findByText('Match #3')).toBeInTheDocument()
    db.tables.sessions[0].status = 'completed'
    expect(onSessionChange).toBeDefined()
    act(() => onSessionChange?.())
    expect(await screen.findByText('Completed')).toBeInTheDocument()
    expect(screen.queryByText('Match #3')).not.toBeInTheDocument()
    expect(onSessionChange).toBeUndefined()
  } finally { subscription.mockRestore() }
})

it('loads the session, teams, matches, goals and players in one request', async () => {
  resetDb(finishedLeague())
  renderPage()
  expect(await screen.findByText('Completed')).toBeInTheDocument()
  expect(screen.getAllByText('Omar').length).toBeGreaterThan(0)
  expect(db.reads).toBe(1)
})

it('names a player who came on in a swap even though they are not on a team list', async () => {
  const league = finishedLeague()
  resetDb({
    ...league,
    match_events: [...league.match_events, event('e9', 'm1', 'p7', 'tg', 'goal')],
  })
  renderPage()
  expect((await screen.findAllByText('Retired')).length).toBeGreaterThan(0)
})

it('says the page is not found when the link is unknown', async () => {
  resetDb()
  renderPage()
  expect(await screen.findByText('Page not found')).toBeInTheDocument()
  expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
})

it('offers a retry when the session cannot be loaded', async () => {
  resetDb(finishedLeague())
  db.errors.sessions = { message: 'Failed to fetch' }
  const user = userEvent.setup()
  renderPage()
  await user.click(await screen.findByRole('button', { name: 'Retry' }))
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()

  delete db.errors.sessions
  await user.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByText('Completed')).toBeInTheDocument()
})

it('four teams: shows who comes on next, in order', async () => {
  const league = finishedLeague()
  resetDb({
    ...league,
    teams: [...league.teams, team('to', 's1', 'orange')],
    sessions: [{ ...session, status: 'active', team_count: 4 }],
    matches: [...league.matches, match('m3', {
      match_number: 3, team1_id: 'ty', team2_id: 'tg', waiting_team_id: 'to', queue: ['to', 'tb'], status: 'active', timer_status: 'paused',
    })],
  })
  renderPage()
  expect(await screen.findByText('Next up: Orange Team, then Blue Team')).toBeInTheDocument()
})

it('shows the period under the clock and Half-time between periods', async () => {
  const league = finishedLeague()
  resetDb({ ...league, sessions: [{ ...session, status: 'active', ...PRESETS.halves }], matches: [...league.matches, match('m3', { match_number: 3, status: 'active', period: 1, period_seconds: [600], timer_status: 'stopped', timer_elapsed_seconds: 600 })] })
  renderPage()
  expect(await screen.findByText('Half-time')).toBeInTheDocument()
  expect(screen.queryByText('Next match — not started yet')).not.toBeInTheDocument()
})

it('a finished shoot-out shows the penalty score', async () => {
  const league = finishedLeague()
  resetDb({ ...league, matches: [match('m1', { status: 'completed', is_draw: true, draw_resolved_by: 'penalties', winner_team_id: 'tg', penalties_team1: 4, penalties_team2: 3 })] })
  renderPage()
  expect(await screen.findByText(/pens 4–3/)).toBeInTheDocument()
})

it('during a live shoot-out the header shows Penalties, the shoot-out score and no clock', async () => {
  const league = finishedLeague()
  resetDb({
    ...league,
    sessions: [{ ...session, status: 'active', ...PRESETS.knockout }],
    matches: [...league.matches, match('m3', {
      match_number: 3, status: 'active', period: 5, period_seconds: [600, 600, 300, 300], timer_status: 'stopped',
      team1_score: 1, team2_score: 1, penalties_team1: 4, penalties_team2: 3,
    })],
  })
  renderPage()
  expect(await screen.findByText('Penalties')).toBeInTheDocument()
  expect(screen.getByText('4–3')).toBeInTheDocument()
  expect(screen.getByText('–')).toBeInTheDocument()
  expect(screen.queryByText('Next match — not started yet')).not.toBeInTheDocument()
})

it('a long period that runs over shows the overrun once, measured against that period', async () => {
  const league = finishedLeague()
  resetDb({
    ...league,
    sessions: [{ ...session, status: 'active', ...PRESETS.halves }],
    matches: [...league.matches, match('m3', { match_number: 3, status: 'active', period: 1, timer_status: 'paused', timer_elapsed_seconds: 1300 })],
  })
  renderPage()
  expect(await screen.findByText('+11:40')).toBeInTheDocument()
  expect(document.body.textContent).not.toMatch(/\+\d\d:\d\d \+/)
})

it('names the current period under the clock', async () => {
  const league = finishedLeague()
  resetDb({
    ...league,
    sessions: [{ ...session, status: 'active', ...PRESETS.halves }],
    matches: [...league.matches, match('m3', { match_number: 3, status: 'active', period: 2, period_seconds: [600], timer_status: 'paused', timer_elapsed_seconds: 30 })],
  })
  renderPage()
  expect(await screen.findByText('2nd half')).toBeInTheDocument()
  expect(screen.queryByText('Half-time')).not.toBeInTheDocument()
})

it('a Quick session shows Match under the clock and no period prefixes', async () => {
  const league = finishedLeague()
  resetDb({
    ...league,
    sessions: [{ ...session, status: 'active' }],
    matches: [...league.matches, match('m3', { match_number: 3, status: 'active', timer_status: 'paused', timer_elapsed_seconds: 30 })],
    match_events: [...league.match_events, event('e9', 'm3', 'p6', 'ty', 'goal', { elapsed_seconds: 20 })],
  })
  renderPage()
  expect(await screen.findByText('Match')).toBeInTheDocument()
  expect(screen.getAllByText('Nour').length).toBeGreaterThan(0)
  expect(document.body.textContent).not.toMatch(/\b[12]H\b/)
})

it('open extra time shows a clock that keeps counting up, named Extra time', async () => {
  const league = finishedLeague()
  resetDb({
    ...league,
    sessions: [{ ...session, status: 'active', ...PRESETS.knockout, extra_time_minutes: 0 }],
    matches: [...league.matches, match('m3', { match_number: 3, status: 'active', period: 3, period_seconds: [600, 600], timer_status: 'paused', timer_elapsed_seconds: 1000 })],
  })
  renderPage()
  expect(await screen.findByText('16:40')).toBeInTheDocument()
  expect(screen.getByText('Extra time')).toBeInTheDocument()
  expect(document.body.textContent).not.toMatch(/\+\d\d:\d\d/)
})

it('combines realtime notifications and follows up once after an in-flight read', async () => {
  const league = finishedLeague()
  resetDb({ ...league, sessions: [{ ...session, status: 'active' }], matches: [...league.matches, match('m3', { match_number: 3, status: 'active' })] })
  const listeners = new Map<string, () => void>()
  const subscription = vi.spyOn(realtime, 'useRealtime').mockImplementation((table, filter, cb) => {
    if (filter.value) listeners.set(table, cb)
  })
  const fetch = vi.spyOn(sessionData, 'fetchSession')
  vi.useFakeTimers()
  try {
    const page = renderPage()
    await act(async () => {})
    expect(fetch).toHaveBeenCalledTimes(1)
    let release!: () => void
    db.holds.sessions = new Promise<void>((resolve) => { release = resolve })
    const goal = () => { listeners.get('matches')!(); listeners.get('match_events')!(); listeners.get('match_events')!() }
    goal()
    await act(() => vi.advanceTimersByTimeAsync(250))
    expect(fetch).toHaveBeenCalledTimes(2)
    goal()
    await act(() => vi.advanceTimersByTimeAsync(500))
    expect(fetch).toHaveBeenCalledTimes(2)
    await act(async () => { release() })
    db.tables.matches.find((m) => m.id === 'm3')!.team1_score = 7
    await act(() => vi.advanceTimersByTimeAsync(250))
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(db.reads).toBe(3)
    expect(screen.getByText('7')).toBeInTheDocument()
    goal()
    page.unmount()
    await vi.advanceTimersByTimeAsync(300)
    expect(fetch).toHaveBeenCalledTimes(3)
  } finally {
    subscription.mockRestore()
    fetch.mockRestore()
    vi.useRealTimers()
  }
})

it('ticks the live clock without recalculating standings or reading the session again', async () => {
  vi.useFakeTimers()
  const compute = vi.spyOn(standings, 'computeStandings')
  try {
    const league = finishedLeague()
    resetDb({ ...league, sessions: [{ ...session, status: 'active' }], matches: [match('current', {
      status: 'active', timer_status: 'running', timer_started_at: new Date().toISOString(),
    })] })
    renderPage()
    await act(async () => {})
    expect(screen.getByText('00:00')).toBeInTheDocument()
    expect(compute).toHaveBeenCalled()
    compute.mockClear()
    await act(() => vi.advanceTimersByTimeAsync(3000))
    expect(screen.getByText('00:03')).toBeInTheDocument()
    expect(compute).not.toHaveBeenCalled()
    expect(db.reads).toBe(1)
  } finally {
    compute.mockRestore()
    vi.useRealTimers()
  }
})

it('refreshes scores missed while offline or asleep and coalesces wake signals from all subscriptions', async () => {
  const league = finishedLeague()
  resetDb({ ...league, sessions: [{ ...session, status: 'active' }], matches: [...league.matches, match('m3', { match_number: 3, status: 'active' })] })
  const fetch = vi.spyOn(sessionData, 'fetchSession')
  vi.useFakeTimers()
  try {
    const page = renderPage()
    await act(async () => {})
    expect(fetch).toHaveBeenCalledTimes(1)
    db.tables.matches.find((m) => m.id === 'm3')!.team1_score = 7
    act(() => {
      window.dispatchEvent(new Event('online'))
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await act(() => vi.advanceTimersByTimeAsync(250))
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(screen.getByText('7')).toBeInTheDocument()

    page.unmount()
    act(() => {
      window.dispatchEvent(new Event('online'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await vi.advanceTimersByTimeAsync(500)
    expect(fetch).toHaveBeenCalledTimes(2)
  } finally {
    Reflect.deleteProperty(document, 'visibilityState')
    fetch.mockRestore()
    vi.useRealTimers()
  }
})
