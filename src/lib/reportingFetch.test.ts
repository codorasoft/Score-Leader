import { vi } from 'vitest'
import { createReportingFetch } from './reportingFetch'

const DATA_URL = 'https://x.supabase.co/rest/v1/matches?id=eq.1'
const AUTH_URL = 'https://x.supabase.co/auth/v1/token'

it('reports requestFailed with the server message when a data request returns an error status', async () => {
  const report = vi.fn()
  const base = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'permission denied' }), { status: 403 }))
  const res = await createReportingFetch(base, report)(DATA_URL, { method: 'DELETE' })
  expect(res.status).toBe(403)
  expect(report).toHaveBeenCalledWith('requestFailed', 'permission denied')
})

it('reports network and rethrows when a data request cannot reach the server', async () => {
  const report = vi.fn()
  const base = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
  await expect(createReportingFetch(base, report)(DATA_URL)).rejects.toThrow('Failed to fetch')
  expect(report).toHaveBeenCalledWith('network', undefined)
})

it('does not report successful data requests', async () => {
  const report = vi.fn()
  const base = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }))
  await createReportingFetch(base, report)(DATA_URL)
  expect(report).not.toHaveBeenCalled()
})

it('ignores auth requests so the login page keeps its own error message', async () => {
  const report = vi.fn()
  const base = vi.fn().mockResolvedValue(new Response('{}', { status: 400 }))
  await createReportingFetch(base, report)(AUTH_URL, { method: 'POST' })
  expect(report).not.toHaveBeenCalled()
})
