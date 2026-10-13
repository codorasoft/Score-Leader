import { vi } from 'vitest'
import { createReportingFetch, quietSignal } from './reportingFetch'

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

it('also reports failed photo uploads to storage', async () => {
  const report = vi.fn()
  const base = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Payload too large' }), { status: 413 }))
  await createReportingFetch(base, report)('https://x.supabase.co/storage/v1/object/player-photos/players/p1.jpg', { method: 'POST' })
  expect(report).toHaveBeenCalledWith('requestFailed', 'Payload too large')
})

describe('a quiet request, made in the background without the user asking', () => {
  it('reports nothing when it cannot reach the server, and still rethrows', async () => {
    const report = vi.fn()
    const base = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(createReportingFetch(base, report)(DATA_URL, { signal: quietSignal() })).rejects.toThrow('Failed to fetch')
    expect(report).not.toHaveBeenCalled()
  })

  it('reports nothing when the server refuses it', async () => {
    const report = vi.fn()
    const base = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'permission denied' }), { status: 403 }))
    const res = await createReportingFetch(base, report)(DATA_URL, { signal: quietSignal() })
    expect(res.status).toBe(403)
    expect(report).not.toHaveBeenCalled()
  })

  it('leaves every other request reported while it is still on its way', async () => {
    const report = vi.fn()
    let failQuiet = (_reason: unknown) => {}
    const base = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => (init?.signal
      ? new Promise<Response>((_resolve, reject) => { failQuiet = reject })
      : Promise.reject(new TypeError('Failed to fetch'))))
    const reporting = createReportingFetch(base, report)
    const quiet = reporting(DATA_URL, { signal: quietSignal() })
    await expect(reporting(DATA_URL, { method: 'PATCH' })).rejects.toThrow('Failed to fetch')
    expect(report).toHaveBeenCalledTimes(1)
    failQuiet(new TypeError('Failed to fetch'))
    await expect(quiet).rejects.toThrow('Failed to fetch')
    expect(report).toHaveBeenCalledTimes(1)
  })

  it('a request with an ordinary abort signal is reported like any other', async () => {
    const report = vi.fn()
    const base = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(createReportingFetch(base, report)(DATA_URL, { signal: new AbortController().signal })).rejects.toThrow()
    expect(report).toHaveBeenCalledWith('network', undefined)
  })
})
