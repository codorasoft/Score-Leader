import { vi } from 'vitest'

const eqs: { table: string; args: unknown[] }[] = []
const h = vi.hoisted(() => ({ fail: false }))
vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = (...args: unknown[]) => { eqs.push({ table, args }); return q }
      q.range = () => Promise.resolve(h.fail ? { data: null, error: { message: 'offline' } } : { data: [], error: null })
      return q
    },
  },
}))

import { loadLeague } from './league'
import { forgetCachedLeagues } from './leagueCache'

beforeEach(() => { eqs.length = 0; h.fail = false; forgetCachedLeagues() })

it('scopes every table to the league', async () => {
  await loadLeague('L1')
  const tables = ['players', 'sessions', 'matches', 'match_events', 'team_players', 'teams', 'session_awards']
  for (const t of tables) {
    expect(eqs).toContainEqual({ table: t, args: ['league_id', 'L1'] })
  }
})

it('downloads a league once while moving between pages', async () => {
  await loadLeague('L1')
  const requests = eqs.length
  await loadLeague('L1')
  expect(eqs.length).toBe(requests)
})

it('downloads again after a failed attempt instead of keeping the gaps', async () => {
  h.fail = true
  await loadLeague('L1')
  const requests = eqs.length
  h.fail = false
  await loadLeague('L1')
  expect(eqs.length).toBeGreaterThan(requests)
})
