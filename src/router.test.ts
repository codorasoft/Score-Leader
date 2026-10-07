import { vi } from 'vitest'

vi.mock('./lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}))

import { router } from './router'

it('defines login and admin routes', () => {
  const paths = router.routes.flatMap((r) => [
    r.path,
    ...((r.children ?? []).map((c) => c.path)),
  ])
  expect(paths).toContain('/login')
  expect(paths).toContain('/admin')
})

// Route wrappers render straight away; only pages wait for their own file, inside a dark layout
it('loads the sign-in check and league layout with the app, not as separate files', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync((await import('node:path')).resolve(__dirname, 'router.tsx'), 'utf8')
  for (const wrapper of ['RequireRole', 'AdminLeagueRoute', 'AdminHome', 'SuperLayout', 'LoginPage']) {
    expect(src).not.toMatch(new RegExp(`const ${wrapper} = lazyPage`))
  }
  expect(src).toMatch(/const HomePage = lazyPage/)
})
