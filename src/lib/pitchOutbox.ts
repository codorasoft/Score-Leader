import { supabase } from './supabase'
import { createOutbox } from './outbox'
import { withNetworkToastsMuted } from './toast'

type Row = Record<string, unknown>

const RETRY_MS = 15_000

const memoryStorage = () => {
  const data = new Map<string, string>()
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v) } }
}

const storage = (() => {
  try {
    localStorage.setItem('scoreleader.probe', '1')
    return localStorage
  } catch {
    return memoryStorage()
  }
})()

export const outbox = createOutbox({
  storage,
  isOnline: () => navigator.onLine !== false,
  client: {
    from: (table: string) => ({
      insert: (row: Row) => withNetworkToastsMuted(() => supabase.from(table).insert(row)),
      update: (values: Row) => ({ match: (m: Row) => withNetworkToastsMuted(() => supabase.from(table).update(values).match(m)) }),
      delete: () => ({ match: (m: Row) => withNetworkToastsMuted(() => supabase.from(table).delete().match(m)) }),
    }),
  },
})

// Send waiting changes as soon as the phone is back online, and keep retrying while any wait
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { outbox.flush() })
  setInterval(() => { if (outbox.pending().length > 0) outbox.flush() }, RETRY_MS)
  if (outbox.pending().length > 0) outbox.flush()
}

export const newId = () => crypto.randomUUID()
