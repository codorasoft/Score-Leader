import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Link, MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { LeagueProvider } from '../contexts/LeagueContext'
import { testLeague } from '../test/league'
import { db, resetDb } from '../test/fakeSupabase'
import { FEATURES, type FeatureKey } from '../lib/features'
import { isHandled, resetTodaySeen } from '../lib/todaySeen'
import { createReportingFetch } from '../lib/reportingFetch'

vi.mock('../lib/supabase', async () => (await import('../test/fakeSupabase')).supabaseModule)

import TodayReminder from './TodayReminder'

const item = (over: Record<string, unknown>) => ({
  league_id: 'L1', kind: 'task', title: 'Item', item_date: '2026-10-12', start_time: null, end_time: null, note: null,
  repeat_days: [], repeat_until: null, skipped_dates: [], done_dates: [], ...over,
})
const monday = () => ({ schedule_items: [item({ id: 'gym', title: 'Gym' }), item({ id: 'cup', league_id: 'L2', title: 'Cup final' })] })

const tree = (path: string, features: readonly FeatureKey[] = FEATURES, league = {}) => (
  <MemoryRouter initialEntries={[path]}>
    <LeagueProvider league={{ ...testLeague(features), ...league }}>
      <Link to="/admin/eagles/home">leave</Link>
      <TodayReminder />
    </LeagueProvider>
  </MemoryRouter>
)
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
const comeBack = () => act(() => {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
})

// Only the date is faked, so waiting for the popup still works. Today is Monday 12 October 2026
beforeEach(() => {
  localStorage.clear()
  resetTodaySeen()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

it("opens with today's items and remembers the day", async () => {
  resetDb(monday())
  render(tree('/admin/eagles/home'))
  const dialog = await screen.findByRole('dialog', { name: 'Today' })
  expect(dialog).toHaveTextContent('Monday, October 12, 2026')
  expect(dialog).toHaveTextContent('Gym')
  expect(dialog).not.toHaveTextContent('Cup final')
  expect(isHandled('L1', '2026-10-12')).toBe(true)
})

it('stays closed on a day with nothing, and remembers the day all the same', async () => {
  resetDb({})
  render(tree('/admin/eagles/home'))
  await waitFor(() => expect(isHandled('L1', '2026-10-12')).toBe(true))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('does not open a second time on the same day', async () => {
  resetDb(monday())
  const first = render(tree('/admin/eagles/home'))
  fireEvent.click(await screen.findByRole('button', { name: 'Got it' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  first.unmount()
  const reads = db.reads
  render(tree('/admin/eagles/players'))
  await settle()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(db.reads).toBe(reads)
})

it('opens again for another league', async () => {
  resetDb(monday())
  const view = render(tree('/admin/eagles/home'))
  fireEvent.click(await screen.findByRole('button', { name: 'Got it' }))
  view.rerender(tree('/admin/eagles/home', FEATURES, { id: 'L2', slug: 'lions' }))
  expect(await screen.findByRole('dialog')).toHaveTextContent('Cup final')
})

it('drops an answer for a league that was left, without remembering its day', async () => {
  resetDb(monday())
  let answer = () => {}
  db.holds.schedule_items = new Promise<void>((r) => { answer = r })
  const view = render(tree('/admin/eagles/home'))
  view.rerender(tree('/admin/eagles/home', FEATURES, { id: 'L3', slug: 'owls' }))
  answer()
  await waitFor(() => expect(isHandled('L3', '2026-10-12')).toBe(true))
  expect(isHandled('L1', '2026-10-12')).toBe(false)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('does nothing without the schedule feature', async () => {
  resetDb(monday())
  render(tree('/admin/eagles/home', FEATURES.filter((f) => f !== 'schedule')))
  await settle()
  expect(db.reads).toBe(0)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('waits while a match is being tracked, and runs on leaving it', async () => {
  resetDb(monday())
  render(tree('/admin/eagles/sessions/s1/match/m1'))
  await settle()
  expect(db.reads).toBe(0)
  fireEvent.click(screen.getByRole('link', { name: 'leave' }))
  expect(await screen.findByRole('dialog', { name: 'Today' })).toBeInTheDocument()
})

it('a failed read shows nothing and is tried again when the app comes back to the front', async () => {
  resetDb(monday())
  db.errors.schedule_items = { message: 'down' }
  render(tree('/admin/eagles/home'))
  await settle()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(isHandled('L1', '2026-10-12')).toBe(false)
  db.errors = {}
  comeBack()
  expect(await screen.findByRole('dialog', { name: 'Today' })).toBeInTheDocument()
})

it('an app left open past midnight shows the new day on coming back', async () => {
  resetDb({ schedule_items: [item({ id: 'gym', title: 'Gym' }), item({ id: 'tue', title: 'Call the referee', item_date: '2026-10-13' })] })
  vi.setSystemTime(new Date(2026, 9, 12, 23, 30))
  render(tree('/admin/eagles/home'))
  fireEvent.click(await screen.findByRole('button', { name: 'Got it' }))
  vi.setSystemTime(new Date(2026, 9, 13, 0, 30))
  comeBack()
  const dialog = await screen.findByRole('dialog', { name: 'Today' })
  expect(dialog).toHaveTextContent('Tuesday, October 13, 2026')
  expect(dialog).toHaveTextContent('Call the referee')
  expect(dialog).not.toHaveTextContent('Gym')
})

it('opens once under StrictMode', async () => {
  resetDb(monday())
  render(<StrictMode>{tree('/admin/eagles/home')}</StrictMode>)
  expect(await screen.findAllByRole('dialog')).toHaveLength(1)
  expect(isHandled('L1', '2026-10-12')).toBe(true)
})

it('makes its reads quietly: with no connection, or refused, they raise no toast', async () => {
  resetDb(monday())
  render(tree('/admin/eagles/home'))
  await screen.findByRole('dialog', { name: 'Today' })
  // Two reads of the schedule items, one of the sessions, one of the training plans
  expect(db.signals).toHaveLength(4)
  const report = vi.fn()
  const offline = createReportingFetch(() => Promise.reject(new TypeError('Failed to fetch')), report)
  const refused = createReportingFetch(async () => new Response(JSON.stringify({ message: 'no' }), { status: 403 }), report)
  for (const signal of db.signals) {
    await expect(offline('https://x.supabase.co/rest/v1/schedule_items', { signal })).rejects.toThrow()
    await refused('https://x.supabase.co/rest/v1/schedule_items', { signal })
  }
  expect(report).not.toHaveBeenCalled()
})
