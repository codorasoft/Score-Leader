import { vi } from 'vitest'

const eqs: { table: string; args: unknown[] }[] = []
vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = (...args: unknown[]) => { eqs.push({ table, args }); return q }
      q.range = () => Promise.resolve({ data: [], error: null })
      return q
    },
  },
}))

import { loadLeague } from './league'

it('scopes every table to the league', async () => {
  await loadLeague('L1')
  const tables = ['players', 'sessions', 'matches', 'match_events', 'team_players', 'teams', 'session_awards']
  for (const t of tables) {
    expect(eqs).toContainEqual({ table: t, args: ['league_id', 'L1'] })
  }
})
