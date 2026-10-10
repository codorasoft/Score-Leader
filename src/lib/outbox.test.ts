import { vi } from 'vitest'
import { createOutbox, type OutboxOp } from './outbox'

type Result = { error: { message: string; code?: string } | null; status: number }

function fakeClient(results: Result[]) {
  const calls: string[] = []
  const next = () => Promise.resolve(results.shift() ?? { error: null, status: 201 })
  const client = {
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => { calls.push(`insert ${table} ${row.id}`); return next() },
      update: (values: Record<string, unknown>) => ({ match: (m: Record<string, unknown>) => { calls.push(`update ${table} ${JSON.stringify(values)} ${JSON.stringify(m)}`); return next() } }),
      delete: () => ({ match: (m: Record<string, unknown>) => { calls.push(`delete ${table} ${JSON.stringify(m)}`); return next() } }),
    }),
  }
  return { client, calls }
}

const memoryStorage = () => {
  const data = new Map<string, string>()
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v) } }
}

const goal = (id: string): OutboxOp => ({ id: `op-${id}`, kind: 'insert', table: 'match_events', row: { id } })
const NETWORK = { error: { message: 'TypeError: Failed to fetch' }, status: 0 }

it('sends straight away when online', async () => {
  const { client, calls } = fakeClient([])
  const box = createOutbox({ client, storage: memoryStorage(), isOnline: () => true })
  expect(await box.runOrQueue(goal('g1'))).toBe('sent')
  expect(calls).toEqual(['insert match_events g1'])
  expect(box.pending()).toHaveLength(0)
})

it('queues without trying when the phone reports no connection', async () => {
  const { client, calls } = fakeClient([])
  const box = createOutbox({ client, storage: memoryStorage(), isOnline: () => false })
  expect(await box.runOrQueue(goal('g1'))).toBe('queued')
  expect(calls).toEqual([])
  expect(box.pending()).toHaveLength(1)
})

it('queues when the request fails because of the network, and keeps later changes in order', async () => {
  const { client } = fakeClient([NETWORK])
  const box = createOutbox({ client, storage: memoryStorage(), isOnline: () => true })
  expect(await box.runOrQueue(goal('g1'))).toBe('queued')
  // Once something is waiting, new changes queue behind it so they are sent in order
  expect(await box.runOrQueue(goal('g2'))).toBe('queued')
  expect(box.pending().map((o) => o.id)).toEqual(['op-g1', 'op-g2'])
})

it('reports a real server error instead of queueing it', async () => {
  const { client } = fakeClient([{ error: { message: 'permission denied' }, status: 403 }])
  const box = createOutbox({ client, storage: memoryStorage(), isOnline: () => true })
  expect(await box.runOrQueue(goal('g1'))).toBe('failed')
  expect(box.pending()).toHaveLength(0)
})

it('flushes in order, stops at the first network failure, and resumes later', async () => {
  const storage = memoryStorage()
  let online = false
  const first = fakeClient([])
  const box = createOutbox({ client: first.client, storage, isOnline: () => online })
  await box.runOrQueue(goal('g1'))
  await box.runOrQueue({ id: 'op-u', kind: 'update', table: 'matches', values: { team1_score: 1 }, match: { id: 'm1' } })
  await box.runOrQueue(goal('g2'))

  online = true
  const results: Result[] = [{ error: null, status: 201 }, NETWORK]
  const { client, calls } = fakeClient(results)
  const reloaded = createOutbox({ client, storage, isOnline: () => online })
  expect(reloaded.pending()).toHaveLength(3) // survived a page reload
  expect(await reloaded.flush()).toBe(false)
  expect(calls).toEqual(['insert match_events g1', 'update matches {"team1_score":1} {"id":"m1"}'])
  expect(reloaded.pending().map((o) => o.id)).toEqual(['op-u', 'op-g2'])

  expect(await reloaded.flush()).toBe(true)
  expect(reloaded.pending()).toHaveLength(0)
})

it('treats a duplicate insert as already sent (the first attempt got through)', async () => {
  const { client } = fakeClient([{ error: { message: 'duplicate key', code: '23505' }, status: 409 }])
  const box = createOutbox({ client, storage: memoryStorage(), isOnline: () => true })
  expect(await box.runOrQueue(goal('g1'))).toBe('sent')
})

it('notifies listeners when the queue changes', async () => {
  const box = createOutbox({ client: fakeClient([]).client, storage: memoryStorage(), isOnline: () => false })
  const listener = vi.fn()
  box.subscribe(listener)
  await box.runOrQueue(goal('g1'))
  expect(listener).toHaveBeenCalled()
})

describe('an expired login', () => {
  const EXPIRED = { error: { message: 'JWT expired', code: 'PGRST301' }, status: 401 }

  it('keeps a change the server answers 401 to, and sends it once the login works again', async () => {
    const { client, calls } = fakeClient([EXPIRED, { error: null, status: 201 }])
    const box = createOutbox({ client, storage: memoryStorage(), isOnline: () => true })
    expect(await box.runOrQueue(goal('g1'))).toBe('queued')
    expect(box.pending().map((o) => o.id)).toEqual(['op-g1'])

    expect(await box.flush()).toBe(true)
    expect(calls).toEqual(['insert match_events g1', 'insert match_events g1'])
    expect(box.rejected()).toBe(0)
  })

  it('a flush stops at a 401 and keeps everything behind it in order', async () => {
    let online = false
    const { client } = fakeClient([{ error: null, status: 201 }, EXPIRED])
    const box = createOutbox({ client, storage: memoryStorage(), isOnline: () => online })
    await box.runOrQueue(goal('g1'))
    await box.runOrQueue(goal('g2'))
    await box.runOrQueue(goal('g3'))
    online = true
    expect(await box.flush()).toBe(false)
    expect(box.pending().map((o) => o.id)).toEqual(['op-g2', 'op-g3'])
  })

  // Sent as a visitor, an insert is refused but an update or delete "succeeds" on no rows at all
  it('sends nothing while signed out: the changes wait for the next sign-in', async () => {
    let signedIn = false
    const { client, calls } = fakeClient([])
    const box = createOutbox({ client, storage: memoryStorage(), isOnline: () => true, isSignedIn: async () => signedIn })
    const update: OutboxOp = { id: 'op-u', kind: 'update', table: 'matches', values: { team1_score: 1 }, match: { id: 'm1' } }
    expect(await box.runOrQueue(goal('g1'))).toBe('queued')
    expect(await box.runOrQueue(update)).toBe('queued')
    expect(await box.flush()).toBe(false)
    expect(calls).toEqual([])
    expect(box.pending().map((o) => o.id)).toEqual(['op-g1', 'op-u'])

    signedIn = true
    expect(await box.flush()).toBe(true)
    expect(calls).toHaveLength(2)
  })
})

describe('changes the server refuses while sending saved ones', () => {
  const REFUSED = { error: { message: 'violates foreign key constraint', code: '23503' }, status: 409 }

  it('are dropped so the rest can go, and counted until the admin has seen it', async () => {
    const storage = memoryStorage()
    let online = false
    const { client } = fakeClient([REFUSED, { error: null, status: 201 }])
    const box = createOutbox({ client, storage, isOnline: () => online })
    await box.runOrQueue(goal('g1'))
    await box.runOrQueue(goal('g2'))
    online = true
    const listener = vi.fn()
    box.subscribe(listener)
    expect(await box.flush()).toBe(true)
    expect(box.rejected()).toBe(1)
    expect(listener).toHaveBeenCalled()

    // Still there after the page reloads (the phone was in a pocket when it happened)
    const reloaded = createOutbox({ client, storage, isOnline: () => true })
    expect(reloaded.rejected()).toBe(1)
    reloaded.dismissRejected()
    expect(reloaded.rejected()).toBe(0)
    expect(createOutbox({ client, storage, isOnline: () => true }).rejected()).toBe(0)
  })

  it('a change refused straight away is not counted: its error is on screen as it happens', async () => {
    const { client } = fakeClient([REFUSED])
    const box = createOutbox({ client, storage: memoryStorage(), isOnline: () => true })
    expect(await box.runOrQueue(goal('g1'))).toBe('failed')
    expect(box.rejected()).toBe(0)
  })
})
