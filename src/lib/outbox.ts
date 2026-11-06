// Changes made at the pitch (goals, cards, swaps, undo, clock) go through this outbox: they are
// sent straight away when possible, otherwise kept on the phone and sent in order later.

type Row = Record<string, unknown>

export type OutboxOp = (
  | { id: string; kind: 'insert'; table: string; row: Row }
  | { id: string; kind: 'update'; table: string; values: Row; match: Row }
  | { id: string; kind: 'delete'; table: string; match: Row }
) & { dependsOn?: string }

interface Result { error: { message?: string; code?: string } | null; status: number }

interface Client {
  from: (table: string) => {
    insert: (row: Row) => PromiseLike<Result>
    update: (values: Row) => { match: (m: Row) => PromiseLike<Result> }
    delete: () => { match: (m: Row) => PromiseLike<Result> }
  }
}

interface Storage { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void }

const KEY = 'scoreleader.outbox'
const REJECTED_KEY = 'scoreleader.outbox.rejected'
const DUPLICATE_KEY = '23505'
const UNAUTHORIZED = 401
// A timeout, rate limit or server outage never means the saved change is invalid.
const isTemporary = (status: number) => status === 408 || status === 429 || status >= 500

export function createOutbox({ client, storage, isOnline, isSignedIn = async () => true, persistent = true }: {
  client: Client
  storage: Storage
  isOnline: () => boolean
  isSignedIn?: () => Promise<boolean>
  persistent?: boolean
}) {
  let durable = persistent
  const read = (): OutboxOp[] => {
    const raw = storage.getItem(KEY)
    if (!raw) return []
    try {
      const saved = JSON.parse(raw)
      return Array.isArray(saved) ? saved.filter((op) => op && typeof op.id === 'string') : []
    } catch { return [] }
  }
  let queue: OutboxOp[] = []
  try { queue = read() } catch { durable = false }
  // Saved changes the server refused while they were being sent, until the admin has seen the warning
  let rejected = 0
  try { rejected = Number(storage.getItem(REJECTED_KEY)) || 0 } catch { /* storage blocked */ }
  let flushing = false
  let draining: Promise<boolean> | null = null
  type Delivery = { op: OutboxOp; accepted: boolean }
  const listeners = new Set<(delivery?: Delivery) => void>()
  const waiting = new Set<{ ids: Set<string>; failed: boolean }>()
  const notify = (delivery?: Delivery) => listeners.forEach((listener) => listener(delivery))

  // Store only this tab's additions and removals against the latest saved queue. An
  // acknowledgement in another open tab must not erase a goal still waiting here.
  const changes = new Map<string, OutboxOp | null>()
  const save = () => {
    if (!changes.size) return
    try {
      const saved = new Map(read().map((op) => [op.id, op]))
      for (const [id, op] of changes) {
        if (op) saved.set(id, op)
        else saved.delete(id)
      }
      storage.setItem(KEY, JSON.stringify([...saved.values()]))
      changes.clear()
      durable = persistent
    } catch { durable = false }
  }

  const setRejected = (n: number) => {
    rejected = n
    try { storage.setItem(REJECTED_KEY, String(n)) } catch { /* storage full or blocked */ }
    notify()
  }

  // 'wait' is a change that can still succeed later: no signal, the login has expired, or the
  // server is failing for now
  const execute = async (op: OutboxOp): Promise<'ok' | 'wait' | 'failed'> => {
    // Sent as a visitor, an insert is refused and an update or delete changes no rows without an
    // error: either way the change would be lost. It waits for the next sign-in instead.
    try {
      if (!(await isSignedIn())) return 'wait'
    } catch {
      return 'wait'
    }
    let res: Result
    try {
      const table = client.from(op.table)
      res = await (op.kind === 'insert' ? table.insert(op.row)
        : op.kind === 'update' ? table.update(op.values).match(op.match)
        : table.delete().match(op.match))
    } catch {
      return 'wait'
    }
    if (!res.error || (op.kind === 'insert' && res.error.code === DUPLICATE_KEY)) {
      return 'ok'
    }
    if (res.status === 0 || res.status === UNAUTHORIZED || !isOnline()) return 'wait'
    if (isTemporary(res.status)) return 'wait'
    return 'failed'
  }

  // Normal sends and retries share one worker. Every caller waits for in-flight requests too.
  // False also means a change was refused during this drain: do not finish from its old score.
  const flush = (): Promise<boolean> => {
    if (draining) return draining
    if (queue.length === 0) { save(); return Promise.resolve(true) }
    flushing = true
    save() // storage may have become available since the edit was made
    const drain = async () => {
      let refused = false
      while (queue.length > 0 && isOnline()) {
        const op = queue[0]
        const outcome = await execute(op)
        if (outcome === 'wait') break
        if (outcome === 'failed') {
          refused = true
          // A refused goal must not be followed by its assist or score increase, even after
          // reopening the app. Unrelated actions can still be sent.
          const ids = new Set([op.id])
          for (const item of queue) {
            if (item.dependsOn && ids.has(item.dependsOn)) ids.add(item.id)
          }
          queue = queue.filter((item) => !ids.has(item.id))
          for (const id of ids) changes.set(id, null)
          for (const batch of waiting) {
            if (batch.ids.has(op.id)) batch.failed = true
          }
          setRejected(rejected + ids.size)
        } else {
          queue.shift()
          changes.set(op.id, null)
        }
        save()
        notify({ op, accepted: outcome === 'ok' })
      }
      return !refused
    }
    draining = Promise.resolve().then(async () => {
      try {
        const accepted = await drain()
        return queue.length === 0 && accepted
      } finally {
        flushing = false
        draining = null
        notify()
      }
    })
    notify()
    return draining
  }

  const runBatchOrQueue = (ops: OutboxOp[]): Promise<'sent' | 'queued' | 'failed'> => {
    if (ops.length === 0) return Promise.resolve('sent')
    const sendNow = isOnline() && (queue.length === 0 || draining !== null)
    // Save the whole action synchronously, before a request or another UI action can start.
    for (const [index, op] of ops.entries()) {
      const item = index > 0 && !op.dependsOn ? { ...op, dependsOn: ops[index - 1].id } : op
      queue.push(item)
      changes.set(item.id, item)
    }
    save()
    if (!sendNow) { notify(); return Promise.resolve('queued') }
    const batch = { ids: new Set(ops.map((op) => op.id)), failed: false }
    waiting.add(batch)
    if (draining) notify() // callers joining an active drain have just extended its queue
    const sent = flush()
    return sent.then(() => batch.failed ? 'failed' : queue.some((op) => batch.ids.has(op.id)) ? 'queued' : 'sent')
      .finally(() => { waiting.delete(batch) })
  }

  const runOrQueue = (op: OutboxOp) => runBatchOrQueue([op])

  return {
    runOrQueue, runBatchOrQueue,
    flush,
    pending: () => [...queue],
    rejected: () => rejected,
    dismissRejected: () => setRejected(0),
    isFlushing: () => flushing,
    isDurable: () => durable,
    subscribe: (l: (delivery?: Delivery) => void) => { listeners.add(l); return () => { listeners.delete(l) } },
  }
}

export type Outbox = ReturnType<typeof createOutbox>
