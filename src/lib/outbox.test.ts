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
    expect(await box.flush()).toBe(false)
    expect(box.rejected()).toBe(1)
    expect(listener).toHaveBeenCalled()

    // Still there after the page reloads (the phone was in a pocket when it happened)
    const reloaded = createOutbox({ client, storage, isOnline: () => true })
    expect(reloaded.rejected()).toBe(1)
    reloaded.dismissRejected()
    expect(reloaded.rejected()).toBe(0)
    expect(createOutbox({ client, storage, isOnline: () => true }).rejected()).toBe(0)
  })

  it('also reports an immediate refusal so optimistic clock and score changes can be corrected', async () => {
    const { client } = fakeClient([REFUSED])
    const box = createOutbox({ client, storage: memoryStorage(), isOnline: () => true })
    expect(await box.runOrQueue(goal('g1'))).toBe('failed')
    expect(box.rejected()).toBe(1)
  })
})

describe('a server that fails for now (an overloaded gateway, too many requests, a timeout)', () => {
  const temporary = (status: number) => ({ error: { message: 'temporarily unavailable' }, status })

  it.each([500, 502, 503, 504, 408, 429])('keeps a change answered %i and sends it on the next try', async (status) => {
    const { client, calls } = fakeClient([temporary(status)])
    const box = createOutbox({ client, storage: memoryStorage(), isOnline: () => true })
    expect(await box.runOrQueue(goal('g1'))).toBe('queued')
    expect(box.pending()).toHaveLength(1)
    expect(await box.flush()).toBe(true)
    expect(calls).toEqual(['insert match_events g1', 'insert match_events g1'])
    expect(box.rejected()).toBe(0)
  })

  it('a flush stops there and keeps everything behind it in order', async () => {
    const { client, calls } = fakeClient([NETWORK, temporary(503)])
    const box = createOutbox({ client, storage: memoryStorage(), isOnline: () => true })
    await box.runOrQueue(goal('g1'))
    await box.runOrQueue(goal('g2'))
    expect(await box.flush()).toBe(false)
    expect(box.pending().map((o) => o.id)).toEqual(['op-g1', 'op-g2'])
    expect(await box.flush()).toBe(true)
    expect(calls).toEqual(['insert match_events g1', 'insert match_events g1', 'insert match_events g1', 'insert match_events g2'])
  })

  it('keeps changes through a long server outage and sends them when service returns', async () => {
    const { client, calls } = fakeClient(Array.from({ length: 12 }, () => temporary(500)))
    const box = createOutbox({ client, storage: memoryStorage(), isOnline: () => true })
    expect(await box.runOrQueue(goal('g1'))).toBe('queued')
    await box.runOrQueue(goal('g2'))
    for (let i = 0; i < 11; i++) expect(await box.flush()).toBe(false)
    expect(box.pending().map((o) => o.id)).toEqual(['op-g1', 'op-g2'])
    expect(box.rejected()).toBe(0)
    expect(await box.flush()).toBe(true)
    expect(box.rejected()).toBe(0)
    expect(calls.filter((c) => c.endsWith('g1'))).toHaveLength(13)
    expect(calls.at(-1)).toBe('insert match_events g2')
  })
})

describe('durable sends and match completion', () => {
  function heldClient() {
    let release!: (result: Result) => void
    const first = new Promise<Result>((resolve) => { release = resolve })
    const insert = vi.fn().mockReturnValueOnce(first).mockResolvedValue({ error: null, status: 201 })
    const update = vi.fn().mockResolvedValue({ error: null, status: 200 })
    const client = {
      from: () => ({ insert, update: () => ({ match: update }), delete: () => ({ match: update }) }),
    }
    return { client, insert, update, release }
  }

  it('persists an online edit before its request starts and retains it until acknowledged', async () => {
    const storage = memoryStorage()
    const { client, release } = heldClient()
    const box = createOutbox({ client, storage, isOnline: () => true })
    const sending = box.runOrQueue(goal('g1'))
    expect(box.pending()).toEqual([goal('g1')])
    const reopened = createOutbox({ client, storage, isOnline: () => false })
    expect(reopened.pending()).toEqual([goal('g1')])
    release({ error: null, status: 201 })
    expect(await sending).toBe('sent')
    expect(createOutbox({ client, storage, isOnline: () => false }).pending()).toEqual([])
  })

  it('keeps another open tab’s unsent goal when this tab sends its own change', async () => {
    const storage = memoryStorage()
    const client = fakeClient([]).client
    const offline = () => createOutbox({ client, storage, isOnline: () => false })
    const first = offline()
    const second = createOutbox({ client, storage, isOnline: () => true })
    await first.runOrQueue(goal('still-waiting'))
    expect(await second.runOrQueue(goal('delivered'))).toBe('sent')
    expect(offline().pending()).toEqual([goal('still-waiting')])
  })

  it('concurrent flushes wait for the in-flight request without sending it twice', async () => {
    const { client, release, insert } = heldClient()
    const box = createOutbox({ client, storage: memoryStorage(), isOnline: () => true })
    const sending = box.runOrQueue(goal('g1'))
    let finished = false
    const firstFlush = box.flush().then((done) => { finished = true; return done })
    const secondFlush = box.flush()
    await vi.waitFor(() => expect(insert).toHaveBeenCalledTimes(1))
    expect(finished).toBe(false)
    expect(box.isFlushing()).toBe(true)
    release({ error: null, status: 201 })
    expect(await sending).toBe('sent')
    expect(await firstFlush).toBe(true)
    expect(await secondFlush).toBe(true)
    expect(insert).toHaveBeenCalledTimes(1)
  })

  const score: OutboxOp = { id: 'score1', kind: 'update', table: 'matches', values: { team1_score: 1 }, match: { id: 'm1' } }

  it('persists the whole goal action before sending and keeps flush waiting for its score', async () => {
    const storage = memoryStorage()
    const { client, release, insert, update } = heldClient()
    let finishScore!: (result: Result) => void
    update.mockReturnValueOnce(new Promise<Result>((resolve) => { finishScore = resolve }))
    const box = createOutbox({ client, storage, isOnline: () => true })
    const sending = box.runBatchOrQueue([goal('g1'), score])
    expect(createOutbox({ client, storage, isOnline: () => false }).pending().map((op) => op.id)).toEqual(['op-g1', 'score1'])
    let finished = false
    const flushing = box.flush().then((done) => { finished = true; return done })
    await vi.waitFor(() => expect(insert).toHaveBeenCalledTimes(1))
    release({ error: null, status: 201 })
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(finished).toBe(false)
    expect(box.pending().map((op) => op.id)).toEqual(['score1'])
    finishScore({ error: null, status: 200 })
    expect(await sending).toBe('sent')
    expect(await flushing).toBe(true)
  })

  it.each([false, true])('cancels dependent score edits when a goal is refused (reopened: %s)', async (reopened) => {
    const storage = memoryStorage()
    const { client, release, update } = heldClient()
    let box = createOutbox({ client, storage, isOnline: () => !reopened })
    const sending = box.runBatchOrQueue([goal('g1'), score])
    if (reopened) {
      expect(await sending).toBe('queued')
      box = createOutbox({ client, storage, isOnline: () => true })
    }
    const flushing = box.flush()
    release({ error: { message: 'permission denied' }, status: 403 })
    if (!reopened) expect(await sending).toBe('failed')
    expect(await flushing).toBe(false)
    expect(update).not.toHaveBeenCalled()
    expect(box.pending()).toEqual([])
    expect(box.rejected()).toBe(2)
  })
})

describe('a change made while an earlier one is still being sent', () => {
  // A client whose first request is answered only when the test says so
  function slowFirstClient() {
    const calls: string[] = []
    let answerFirst!: (r: Result) => void
    const first = new Promise<Result>((r) => { answerFirst = r })
    let n = 0
    const next = () => (n++ === 0 ? first : Promise.resolve({ error: null, status: 201 }))
    const client = {
      from: (table: string) => ({
        insert: (row: Record<string, unknown>) => { calls.push(`insert ${table} ${row.id}`); return next() },
        update: () => ({ match: () => next() }),
        delete: () => ({ match: (m: Record<string, unknown>) => { calls.push(`delete ${table} ${m.id}`); return next() } }),
      }),
    }
    return { client, calls, answerFirst }
  }
  const undo = (id: string): OutboxOp => ({ id: `op-undo-${id}`, kind: 'delete', table: 'match_events', match: { id } })

  it('waits for it, so an undo can never reach the server before the goal it undoes', async () => {
    const { client, calls, answerFirst } = slowFirstClient()
    const box = createOutbox({ client, storage: memoryStorage(), isOnline: () => true })
    const sendingGoal = box.runOrQueue(goal('g1'))
    const sendingUndo = box.runOrQueue(undo('g1'))
    await new Promise((r) => setTimeout(r, 0))
    expect(calls).toEqual(['insert match_events g1'])
    answerFirst({ error: null, status: 201 })
    expect(await sendingGoal).toBe('sent')
    expect(await sendingUndo).toBe('sent')
    expect(calls).toEqual(['insert match_events g1', 'delete match_events g1'])
  })

  it('queues behind it when it ends up waiting for signal', async () => {
    const { client, calls, answerFirst } = slowFirstClient()
    const box = createOutbox({ client, storage: memoryStorage(), isOnline: () => true })
    const sendingGoal = box.runOrQueue(goal('g1'))
    const sendingUndo = box.runOrQueue(undo('g1'))
    answerFirst(NETWORK)
    expect(await sendingGoal).toBe('queued')
    expect(await sendingUndo).toBe('queued')
    expect(box.pending().map((o) => o.id)).toEqual(['op-g1', 'op-undo-g1'])
    expect(calls).toEqual(['insert match_events g1'])
  })
})
