import { vi } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// The real Supabase client, with the network replaced: what the SDK really does with a cancel is
// what is tested, not a stand-in for it
type Fetch = (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>
let network: Fetch
const requests: RequestInit[] = []
const fakeFetch: Fetch = (url, init) => { requests.push(init ?? {}); return network(url, init) }
const makeClient = (extra: Parameters<typeof createClient>[2] = {}) => createClient('https://project.test', 'anon-key', {
  auth: { persistSession: false, autoRefreshToken: false },
  ...extra,
  global: { fetch: fakeFetch },
})
let client: SupabaseClient = makeClient()
vi.mock('./supabase', () => ({
  supabase: { functions: { invoke: (...args: Parameters<SupabaseClient['functions']['invoke']>) => client.functions.invoke(...args) } },
}))

import { understandVoice } from './voiceApi'

const input = { leagueId: 'l1', text: 'هدف العجل', alternatives: [], lang: 'ar' as const, players: [] }
const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
// A server that answers only when the request is cancelled
const hangs: Fetch = (_url, init) => new Promise((_, reject) => {
  init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
})

beforeEach(() => {
  requests.length = 0
  client = makeClient()
})
afterEach(() => { vi.useRealTimers() })

it('passes on an answer that comes in time, with how long the model took', async () => {
  network = async () => answer({ command: { action: 'pause' }, model_ms: 640 })
  await expect(understandVoice(input)).resolves.toMatchObject({ ok: true, command: { action: 'pause', playerId: null }, modelMs: 640 })
})

it('closing the sheet cancels the request itself, not just the wait', async () => {
  network = hangs
  const closed = new AbortController()
  const res = understandVoice(input, { signal: closed.signal })
  await vi.waitFor(() => expect(requests).toHaveLength(1))
  closed.abort()
  await expect(res).resolves.toEqual({ ok: false, error: 'cancelled' })
  expect(requests[0].signal?.aborted).toBe(true)
})

it('gives up on a stalled connection after 15 s and cancels the request', async () => {
  vi.useFakeTimers()
  network = hangs
  const res = understandVoice(input)
  await vi.advanceTimersByTimeAsync(15_000)
  await expect(res).resolves.toEqual({ ok: false, error: 'timeout' })
  expect(requests[0].signal?.aborted).toBe(true)
})

it('gives up on time even while the sign-in token is still on its way', async () => {
  // The SDK waits for the token before it calls fetch, and that wait cannot be cancelled
  vi.useFakeTimers()
  client = makeClient({ accessToken: () => new Promise<string>(() => {}) })
  network = async () => answer({ command: { action: 'pause' } })
  const res = understandVoice(input)
  await vi.advanceTimersByTimeAsync(15_000)
  await expect(res).resolves.toEqual({ ok: false, error: 'timeout' })
  expect(requests).toHaveLength(0)
})

it('drops an answer that arrives after the sheet was closed', async () => {
  // A server that ignores the cancel and answers anyway
  let reply: (r: Response) => void = () => {}
  network = () => new Promise((resolve) => { reply = resolve })
  const closed = new AbortController()
  const res = understandVoice(input, { signal: closed.signal })
  await vi.waitFor(() => expect(requests).toHaveLength(1))
  closed.abort()
  reply(answer({ command: { action: 'goal' } }))
  await expect(res).resolves.toEqual({ ok: false, error: 'cancelled' })
})

it('does not start a request for a sheet that is already closed', async () => {
  network = async () => answer({ command: { action: 'pause' } })
  const closed = new AbortController()
  closed.abort()
  await expect(understandVoice(input, { signal: closed.signal })).resolves.toEqual({ ok: false, error: 'cancelled' })
  expect(requests).toHaveLength(0)
})

it('reads the function giving up on Claude as too long, not as a failure', async () => {
  network = async () => answer({ error: 'timeout' }, 504)
  await expect(understandVoice(input)).resolves.toEqual({ ok: false, error: 'timeout' })
})

it('tells no connection apart from a server that failed', async () => {
  network = async () => { throw new TypeError('Failed to fetch') }
  await expect(understandVoice(input)).resolves.toEqual({ ok: false, error: 'network' })
  network = async () => answer({ error: 'boom' }, 500)
  await expect(understandVoice(input)).resolves.toEqual({ ok: false, error: 'failed' })
})
