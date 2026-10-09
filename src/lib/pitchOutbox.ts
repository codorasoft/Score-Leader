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
  // No session also when an expired login could not be renewed; the changes wait until it can
  isSignedIn: async () => !!(await supabase.auth.getSession()).data.session,
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
  // Changes that waited for a login go as soon as there is one. Deferred: the auth client must
  // not be called from inside its own callback.
  supabase.auth.onAuthStateChange((event) => {
    if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && outbox.pending().length > 0) {
      setTimeout(() => { outbox.flush() }, 0)
    }
  })
  setInterval(() => { if (outbox.pending().length > 0) outbox.flush() }, RETRY_MS)
  if (outbox.pending().length > 0) outbox.flush()
}

export const newId = () => crypto.randomUUID()
