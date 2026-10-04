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
