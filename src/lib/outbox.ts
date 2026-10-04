// Changes made at the pitch (goals, cards, swaps, undo, clock) go through this outbox: they are
// sent straight away when possible, otherwise kept on the phone and sent in order later.

type Row = Record<string, unknown>

export type OutboxOp =
  | { id: string; kind: 'insert'; table: string; row: Row }
  | { id: string; kind: 'update'; table: string; values: Row; match: Row }
  | { id: string; kind: 'delete'; table: string; match: Row }

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
const DUPLICATE_KEY = '23505'

export function createOutbox({ client, storage, isOnline }: { client: Client; storage: Storage; isOnline: () => boolean }) {
  const read = (): OutboxOp[] => {
    try { return JSON.parse(storage.getItem(KEY) ?? '[]') } catch { return [] }
  }
  let queue = read()
  let flushing = false
  const listeners = new Set<() => void>()

  const save = () => {
    try { storage.setItem(KEY, JSON.stringify(queue)) } catch { /* storage full or blocked */ }
    listeners.forEach((l) => l())
  }

  const execute = async (op: OutboxOp): Promise<'ok' | 'network' | 'failed'> => {
    let res: Result
    try {
      const table = client.from(op.table)
      res = await (op.kind === 'insert' ? table.insert(op.row)
        : op.kind === 'update' ? table.update(op.values).match(op.match)
        : table.delete().match(op.match))
    } catch {
      return 'network'
    }
    if (!res.error) return 'ok'
    if (op.kind === 'insert' && res.error.code === DUPLICATE_KEY) return 'ok'
    return res.status === 0 || !isOnline() ? 'network' : 'failed'
  }

  const runOrQueue = async (op: OutboxOp): Promise<'sent' | 'queued' | 'failed'> => {
    // Anything already waiting must go first, so later changes never overtake earlier ones
    if (!isOnline() || queue.length > 0) {
      queue.push(op)
      save()
      return 'queued'
    }
    const outcome = await execute(op)
    if (outcome === 'ok') return 'sent'
    if (outcome === 'failed') return 'failed'
    queue.push(op)
    save()
    return 'queued'
  }

  // Returns true when everything has been sent
  const flush = async (): Promise<boolean> => {
    if (flushing) return queue.length === 0
    flushing = true
    listeners.forEach((l) => l())
    try {
      while (queue.length > 0 && isOnline()) {
        const outcome = await execute(queue[0])
        if (outcome === 'network') break
        // A change the server rejects can never succeed; drop it so it can't block the rest
        queue.shift()
        save()
      }
    } finally {
      flushing = false
      listeners.forEach((l) => l())
    }
    return queue.length === 0
  }

  return {
    runOrQueue,
    flush,
    pending: () => [...queue],
    isFlushing: () => flushing,
    subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } },
  }
}

export type Outbox = ReturnType<typeof createOutbox>
