import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'
import { inArabic } from '../../test/arabic'
import { db, resetDb } from '../../test/fakeSupabase'
import { player } from '../../test/fixtures'
import { PRESETS } from '../../utils/matchFormat'
import { localToday } from '../../utils/trainingDays'
import { FEATURES, type FeatureKey } from '../../lib/features'

vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)

import HomePage from './HomePage'

// Rows per table for the next render; the in-memory database really filters them
const h = { rows: {} as Record<string, Record<string, unknown>[]> }
const noPhoto = (n: number) => Array.from({ length: n }, (_, i) => player(`np${i}`, `No photo ${i}`, 'MID', 3))

const today = new Date().toISOString().slice(0, 10)
const session = (id: string, date: string, status: string) => ({ id, date, status, share_token: 't' + id, created_at: date + 'T10:00:00Z', league_id: 'L1' })
const match = (status: string, extra = {}) => ({
  id: 'm1', session_id: 's1', match_number: 3, team1_id: 'ta', team2_id: 'tb', waiting_team_id: 'tc', status,
  team1_score: 2, team2_score: 1, timer_status: 'paused', timer_started_at: null, timer_elapsed_seconds: 125, league_id: 'L1', ...extra,
})

function renderHome(features: readonly FeatureKey[] = FEATURES, url = '/admin/eagles/home') {
  resetDb(h.rows)
  return render(<MemoryRouter initialEntries={[url]}><InLeague features={features}><HomePage /></InLeague></MemoryRouter>)
}

beforeEach(() => { h.rows = {} })

it('asks all its questions at once instead of waiting for the session list first', async () => {
  h.rows.sessions = [session('s1', today, 'active')]
  h.rows.award_votes = [{ id: 'v1', award_type: 'mvp', session_id: 's1', league_id: 'L1', status: 'open' }]
  h.rows.award_vote_entries = [{ award_vote_id: 'v1' }]
  let answerSessions = () => {}
  renderHome()
  db.holds.sessions = new Promise<void>((r) => { answerSessions = r })
  // While the sessions are still on their way, the votes (with their counts), photos, boards, and
  // today's schedule items (two reads) and training plans are already asked
  await waitFor(() => expect(db.reads).toBe(6))
  answerSessions()
  expect(await screen.findByRole('link', { name: /MVP vote .*1 vote/ })).toBeInTheDocument()
  // Three reads of the sessions: the list, the unfinished ones, and today's for the Today card
  expect(db.reads).toBe(9)
})

describe('live / start block', () => {
  it('nothing open: start button and when the league last played', async () => {
    h.rows.sessions = [session('s0', '2026-09-01', 'completed')]
    renderHome()
    expect(await screen.findByRole('button', { name: /Start new session/ })).toBeInTheDocument()
    expect(screen.getByText(/Last played:/)).toBeInTheDocument()
  })
  it('start new session opens the new-session popup', async () => {
    h.rows.sessions = [session('s0', '2026-09-01', 'completed')]
    renderHome()
    fireEvent.click(await screen.findByRole('button', { name: /Start new session/ }))
    expect(await screen.findByRole('dialog', { name: 'New session' })).toBeInTheDocument()
  })
  it('opens the popup straight away when asked to by the link', async () => {
    h.rows.sessions = [session('s0', '2026-09-01', 'completed')]
    renderHome(FEATURES, '/admin/eagles/home?new=1')
    expect(await screen.findByRole('dialog', { name: 'New session' })).toBeInTheDocument()
  })
  it('a running match: score, clock and resume', async () => {
    h.rows.sessions = [session('s1', today, 'active')]
    h.rows.matches = [match('active')]
    h.rows.teams = [{ id: 'ta', session_id: 's1', color: 'green', name: null }, { id: 'tb', session_id: 's1', color: 'blue', name: null }]
    renderHome()
    expect(await screen.findByText('Live now')).toBeInTheDocument()
    expect(screen.getByText('2 – 1')).toBeInTheDocument()
    expect(screen.getByText('02:05')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Resume/ })).toHaveAttribute('href', '/admin/eagles/sessions/s1/match/m1')
  })
  it('a running match in halves shows the clock against the period length', async () => {
    h.rows.sessions = [{ ...session('s1', today, 'active'), ...PRESETS.halves }]
    h.rows.matches = [match('active', { period: 1, period_seconds: [], timer_elapsed_seconds: 650 })]
    h.rows.teams = [{ id: 'ta', session_id: 's1', color: 'green', name: null }, { id: 'tb', session_id: 's1', color: 'blue', name: null }]
    renderHome()
    expect(await screen.findByText('10:00 +00:50')).toBeInTheDocument()
  })
  it('a match in open extra time shows its clock counting up', async () => {
    h.rows.sessions = [{ ...session('s1', today, 'active'), ...PRESETS.knockout, extra_time_minutes: 0 }]
    h.rows.matches = [match('active', { period: 3, period_seconds: [600, 600], timer_elapsed_seconds: 1000 })]
    h.rows.teams = [{ id: 'ta', session_id: 's1', color: 'green', name: null }, { id: 'tb', session_id: 's1', color: 'blue', name: null }]
    renderHome()
    expect(await screen.findByText('16:40')).toBeInTheDocument()
  })

  it('a new session without players: continue to attendance', async () => {
    h.rows.sessions = [session('s1', today, 'draft')]
    renderHome()
    expect(await screen.findByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/admin/eagles/sessions/s1/players')
  })
  it('a session still picking teams: continue to the team builder', async () => {
    h.rows.sessions = [session('s1', today, 'draft')]
    h.rows.session_players = [{ session_id: 's1', player_id: 'p1' }]
    renderHome()
    expect(await screen.findByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/admin/eagles/sessions/s1/teams')
  })
})

describe('starting a session while another is unfinished', () => {
  it('a live match still offers to start a new session', async () => {
    h.rows.sessions = [session('s1', '2026-09-27', 'active')]
    h.rows.matches = [match('pending')]
    renderHome()
    expect(await screen.findByText('Live now')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Start new session/ }))
    expect(await screen.findByRole('dialog', { name: 'New session' })).toBeInTheDocument()
  })
  it('an open or half-set-up session still offers it too', async () => {
    h.rows.sessions = [session('s1', '2026-09-27', 'draft')]
    renderHome()
    expect(await screen.findByRole('link', { name: 'Continue' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Start new session/ })).toBeInTheDocument()
  })
  it('the old new-session link opens the popup even with a session open', async () => {
    h.rows.sessions = [session('s1', '2026-09-27', 'active')]
    renderHome(FEATURES, '/admin/eagles/home?new=1')
    expect(await screen.findByRole('dialog', { name: 'New session' })).toBeInTheDocument()
  })
})

describe('live match shows who is next', () => {
  it('names the waiting team', async () => {
    h.rows.sessions = [session('s1', today, 'active')]
    h.rows.matches = [match('active', { queue: ['tc'] })]
    h.rows.teams = [
      { id: 'ta', session_id: 's1', color: 'green', name: null }, { id: 'tb', session_id: 's1', color: 'blue', name: null },
      { id: 'tc', session_id: 's1', color: 'yellow', name: null },
    ]
    renderHome()
    expect(await screen.findByText('Next up: Yellow Team')).toBeInTheDocument()
  })
})

describe('to do block', () => {
  beforeEach(() => {
    h.rows.sessions = [session('old', '2026-10-01', 'active'), session('s9', '2026-09-20', 'completed')]
    h.rows.award_votes = [{ id: 'v1', award_type: 'mvp', session_id: 's9', league_id: 'L1', status: 'open' }]
    h.rows.award_vote_entries = [{ award_vote_id: 'v1' }, { award_vote_id: 'v1' }]
    h.rows.players = noPhoto(3)
  })
  it('lists open votes, unfinished sessions and players without photos', async () => {
    renderHome()
    expect(await screen.findByRole('link', { name: /MVP vote .*2 votes/ })).toHaveAttribute('href', '/admin/eagles/sessions/s9')
    expect(screen.getByRole('link', { name: /is still open\. Finish it/ })).toHaveAttribute('href', '/admin/eagles/sessions/old')
    expect(screen.getByRole('link', { name: /3 players have no photo/ })).toHaveAttribute('href', '/admin/eagles/players')
  })
  it('hides vote and photo reminders when those features are off', async () => {
    renderHome(['cards'])
    expect(await screen.findByRole('link', { name: /Finish it/ })).toBeInTheDocument()
    expect(screen.queryByText(/MVP vote/)).not.toBeInTheDocument()
    expect(screen.queryByText(/no photo/)).not.toBeInTheDocument()
  })
  it('says all done when nothing is waiting', async () => {
    h.rows = { sessions: [session('s9', '2026-09-20', 'completed')] }
    renderHome()
    expect(await screen.findByText('All done ✓')).toBeInTheDocument()
  })
})

describe('coach board block', () => {
  it('opens the last edited board', async () => {
    h.rows.lineups = [{ id: 'b1', name: 'Saturday 4-4-2', updated_at: '2026-10-05T12:00:00Z', league_id: 'L1' }]
    renderHome()
    expect(await screen.findByRole('link', { name: /Saturday 4-4-2/ })).toHaveAttribute('href', '/admin/eagles/lineups/b1')
    expect(screen.getByRole('link', { name: '+ New board' })).toHaveAttribute('href', '/admin/eagles/lineups/new')
  })
  it('offers the first board when there is none', async () => {
    renderHome()
    expect(await screen.findByRole('link', { name: 'Create your first board' })).toHaveAttribute('href', '/admin/eagles/lineups/new')
  })
  it('is hidden when the coach board is off', async () => {
    renderHome(['cards'])
    await screen.findByText('To do')
    expect(screen.queryByText('Coach Board')).not.toBeInTheDocument()
    expect(screen.queryByText('Create your first board')).not.toBeInTheDocument()
  })
})

describe('the Today card', () => {
  const day = localToday()
  const item = (over: Record<string, unknown>) => ({
    league_id: 'L1', kind: 'task', title: 'Item', item_date: day, start_time: null, end_time: null, note: null,
    repeat_days: [], repeat_until: null, skipped_dates: [], done_dates: [], ...over,
  })
  const seed = () => {
    h.rows.schedule_items = [
      item({ id: 'gym', kind: 'training', title: 'Gym', start_time: '08:00:00' }),
      item({ id: 'done', title: 'Done already', done_dates: [day] }),
      item({ id: 'old', title: 'Yesterday', item_date: '2020-01-01' }),
    ]
    h.rows.trainings = [{ id: 'p1', league_id: 'L1', training_date: day, title: 'Passing day' }]
  }
  const card = () => screen.findByRole('region', { name: 'Today' })

  it("lists today's items above To do, each a link, with their number", async () => {
    seed()
    renderHome()
    const region = await card()
    expect(within(region).getByRole('link', { name: 'Today' })).toHaveAttribute('href', '/admin/eagles/schedule')
    expect(within(region).getByText('2 items')).toBeInTheDocument()
    const links = within(within(region).getByRole('list')).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['08:00Gym', 'Training planPassing day'])
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/admin/eagles/schedule', '/admin/eagles/trainings/p1'])
    const todo = screen.getByRole('heading', { name: 'To do' })
    expect(region.compareDocumentPosition(todo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('says "1 item" for one', async () => {
    h.rows.schedule_items = [item({ id: 'gym', title: 'Gym' })]
    renderHome()
    expect(within(await card()).getByText('1 item')).toBeInTheDocument()
  })

  it('is left out on a day with nothing', async () => {
    h.rows.schedule_items = [item({ id: 'old', item_date: '2020-01-01' })]
    renderHome()
    await screen.findByRole('heading', { name: 'To do' })
    expect(screen.queryByRole('region', { name: 'Today' })).not.toBeInTheDocument()
  })

  it('is left out, and nothing is asked, without the schedule feature', async () => {
    seed()
    renderHome(FEATURES.filter((f) => f !== 'schedule'))
    // A read of the schedule would never be answered, and Home would never finish loading
    db.holds.schedule_items = new Promise(() => {})
    await screen.findByRole('heading', { name: 'To do' })
    expect(screen.queryByRole('region', { name: 'Today' })).not.toBeInTheDocument()
  })

  it('shows training plans only with the training feature', async () => {
    seed()
    renderHome(FEATURES.filter((f) => f !== 'training'))
    const region = await card()
    expect(within(region).getByText('1 item')).toBeInTheDocument()
    expect(region).not.toHaveTextContent('Passing day')
  })

  it('is left out when the schedule cannot be read, and the rest of Home still shows', async () => {
    seed()
    renderHome()
    db.errors.schedule_items = { message: 'down' }
    expect(await screen.findByRole('heading', { name: 'To do' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Today' })).not.toBeInTheDocument()
  })

  it('speaks Arabic', async () => {
    h.rows.schedule_items = [item({ id: 'gym', title: 'Gym' })]
    await inArabic(async () => {
      renderHome()
      const region = await screen.findByRole('region', { name: 'اليوم' })
      expect(within(region).getByText('عنصر واحد')).toBeInTheDocument()
    })
  })
})
