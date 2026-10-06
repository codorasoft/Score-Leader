import { liveState, todoItems, staleSessions, matchElapsed } from './homeStatus'
import type { Match, Session } from '../lib/types'

const session = (id: string, date: string, status: Session['status'], created = '2026-10-01T10:00:00Z'): Session =>
  ({ id, date, status, share_token: 't' + id, created_at: created, league_id: 'L1' })
const match = (id: string, n: number, status: Match['status']): Match => ({
  id, session_id: 's1', match_number: n, team1_id: 'a', team2_id: 'b', waiting_team_id: 'c', status,
  team1_score: 1, team2_score: 0, winner_team_id: null, is_draw: false, draw_resolved_by: null,
  timer_started_at: null, timer_elapsed_seconds: 0, timer_status: 'stopped', created_at: '', league_id: 'L1',
})

describe('liveState', () => {
  it('shows the running match of the open session', () => {
    const s = liveState([session('s1', '2026-10-06', 'active')], [match('m1', 1, 'completed'), match('m2', 2, 'active'), match('m3', 3, 'pending')])
    expect(s).toMatchObject({ kind: 'match', session: { id: 's1' }, match: { id: 'm2' } })
  })
  it('falls back to the next pending match when none is running', () => {
    const s = liveState([session('s1', '2026-10-06', 'active')], [match('m1', 1, 'completed'), match('m2', 2, 'pending')])
    expect(s).toMatchObject({ kind: 'match', match: { id: 'm2' } })
  })
  it('an active session with every match played is open, not live', () => {
    expect(liveState([session('s1', '2026-10-06', 'active')], [match('m1', 1, 'completed')])).toMatchObject({ kind: 'open', session: { id: 's1' } })
  })
  it('a draft session with no players yet goes to attendance first', () => {
    expect(liveState([session('s1', '2026-10-06', 'draft')], [])).toMatchObject({ kind: 'setup', session: { id: 's1' }, hasPlayers: false })
  })
  it('a draft session with players goes on to the team builder', () => {
    expect(liveState([session('s1', '2026-10-06', 'draft')], [], ['s1'])).toMatchObject({ kind: 'setup', hasPlayers: true })
  })
  it('the newest open session wins', () => {
    const s = liveState([session('old', '2026-10-01', 'active'), session('new', '2026-10-06', 'draft')], [])
    expect(s).toMatchObject({ kind: 'setup', session: { id: 'new' } })
  })
  it('nothing open: idle with the last played date', () => {
    const s = liveState([session('a', '2026-09-20', 'completed'), session('b', '2026-10-03', 'completed')], [])
    expect(s).toEqual({ kind: 'idle', lastPlayed: '2026-10-03' })
  })
  it('a brand new league: idle with no last played date', () => {
    expect(liveState([], [])).toEqual({ kind: 'idle', lastPlayed: null })
  })
})

it('staleSessions lists unfinished sessions from earlier days only', () => {
  const rows = [session('today', '2026-10-06', 'active'), session('old', '2026-10-03', 'active'), session('draft', '2026-10-01', 'draft'), session('done', '2026-10-02', 'completed')]
  expect(staleSessions(rows, '2026-10-06').map((s) => s.id)).toEqual(['old', 'draft'])
})

describe('todoItems', () => {
  const votes = [{ id: 'v1', sessionId: 's1', sessionDate: '2026-10-03', awardType: 'mvp' as const, votes: 7 }]
  const stale = [session('old', '2026-10-03', 'active')]
  it('lists open votes, stale sessions and players without a photo', () => {
    const items = todoItems({ votes, stale, missingPhotos: 5, voting: true, photos: true })
    expect(items.map((i) => i.kind)).toEqual(['vote', 'stale', 'photos'])
  })
  it('hides votes and photo reminders when those features are off', () => {
    const items = todoItems({ votes, stale, missingPhotos: 5, voting: false, photos: false })
    expect(items.map((i) => i.kind)).toEqual(['stale'])
  })
  it('is empty when there is nothing to do', () => {
    expect(todoItems({ votes: [], stale: [], missingPhotos: 0, voting: true, photos: true })).toEqual([])
  })
})

describe('matchElapsed', () => {
  it('adds running time to the saved seconds', () => {
    const m = { ...match('m', 1, 'active'), timer_status: 'running' as const, timer_started_at: '2026-10-06T10:00:00Z', timer_elapsed_seconds: 60 }
    expect(matchElapsed(m, Date.parse('2026-10-06T10:01:30Z'))).toBe(150)
  })
  it('a paused clock shows the saved seconds', () => {
    const m = { ...match('m', 1, 'active'), timer_status: 'paused' as const, timer_elapsed_seconds: 200 }
    expect(matchElapsed(m, Date.now())).toBe(200)
  })
})
