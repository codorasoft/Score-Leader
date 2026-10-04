import { router } from './router'

it('defines login and admin routes', () => {
  const paths = router.routes.flatMap((r) => [
    r.path,
    ...((r.children ?? []).map((c) => c.path)),
  ])
  expect(paths).toContain('/login')
  expect(paths).toContain('/admin')
})
