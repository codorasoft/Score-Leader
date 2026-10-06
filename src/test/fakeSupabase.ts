// In-memory stand-in for the Supabase client, for page tests. Tables are plain row arrays;
// filters really filter, inserts/updates/deletes really change the rows, and every write is logged.
// Use it with:  vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)

import { forgetCachedLeagues } from '../lib/leagueCache'

type Row = Record<string, unknown>
type Filter = (row: Row) => boolean
type ApiError = { message: string; code?: string }

export interface Write { table: string; op: 'insert' | 'update' | 'delete' | 'upsert'; values?: unknown; filters: string[] }

export const db = {
  tables: {} as Record<string, Row[]>,
  writes: [] as Write[],
  reads: 0,
  // Every request to a table listed here fails with this error (reads and writes)
  errors: {} as Record<string, ApiError>,
  nextId: 1,
}

export function resetDb(tables: Record<string, Row[]> = {}) {
  db.tables = structuredClone(tables)
  db.writes = []
  db.reads = 0
  db.errors = {}
  db.nextId = 1
  forgetCachedLeagues()
}

export const rows = (table: string) => (db.tables[table] ??= [])

function query(table: string) {
  const filters: Filter[] = []
  const described: string[] = []
  let op: 'select' | Write['op'] = 'select'
  let payload: unknown
  let returning = false
  let count: string | undefined
  let head = false
  let orderBy: { col: string; asc: boolean }[] = []
  let from = 0
  let to = Infinity

  const where = (desc: string, f: Filter) => { filters.push(f); described.push(desc); return b }

  const run = (): { data: unknown; error: ApiError | null; count: number | null; status: number } => {
    const error = db.errors[table]
    if (error) return { data: null, error, count: null, status: 400 }
    const all = rows(table)
    const hit = all.filter((r) => filters.every((f) => f(r)))

    // Like the real client (see forgetOnWrite), any write clears the cached league histories
    if (op !== 'select') forgetCachedLeagues()
    if (op === 'insert' || op === 'upsert') {
      const list = (Array.isArray(payload) ? payload : [payload]) as Row[]
      const added = list.map((r) => ({ id: `${table}-${db.nextId++}`, ...r }))
      for (const r of added) {
        const existing = op === 'upsert' ? all.findIndex((x) => x.id === r.id) : -1
        if (existing >= 0) all[existing] = { ...all[existing], ...r }
        else all.push(r)
      }
      db.writes.push({ table, op, values: payload, filters: described })
      return { data: returning ? added : null, error: null, count: null, status: 201 }
    }
    if (op === 'update') {
      for (const r of hit) Object.assign(r, payload)
      db.writes.push({ table, op, values: payload, filters: described })
      return { data: returning ? hit : null, error: null, count: null, status: 200 }
    }
    if (op === 'delete') {
      db.tables[table] = all.filter((r) => !hit.includes(r))
      db.writes.push({ table, op, filters: described })
      return { data: returning ? hit : null, error: null, count: null, status: 200 }
    }

    db.reads++
    let out = [...hit]
    for (const { col, asc } of [...orderBy].reverse()) {
      out.sort((a, c) => (String(a[col]) < String(c[col]) ? -1 : String(a[col]) > String(c[col]) ? 1 : 0) * (asc ? 1 : -1))
    }
    out = out.slice(from, to + 1)
    return { data: head ? null : out, error: null, count: count ? hit.length : null, status: 200 }
  }

  const b = {
    select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
      if (op === 'select') { count = opts?.count; head = !!opts?.head } else returning = true
      return b
    },
    insert: (values: unknown) => { op = 'insert'; payload = values; return b },
    upsert: (values: unknown) => { op = 'upsert'; payload = values; return b },
    update: (values: unknown) => { op = 'update'; payload = values; return b },
    delete: () => { op = 'delete'; return b },
    eq: (col: string, v: unknown) => where(`${col}=${v}`, (r) => r[col] === v),
    neq: (col: string, v: unknown) => where(`${col}!=${v}`, (r) => r[col] !== v),
    is: (col: string, v: unknown) => where(`${col} is ${v}`, (r) => (r[col] ?? null) === v),
    in: (col: string, vs: unknown[]) => where(`${col} in ${vs}`, (r) => vs.includes(r[col])),
    gt: (col: string, v: never) => where(`${col}>${v}`, (r) => (r[col] as never) > v),
    gte: (col: string, v: never) => where(`${col}>=${v}`, (r) => (r[col] as never) >= v),
    lt: (col: string, v: never) => where(`${col}<${v}`, (r) => (r[col] as never) < v),
    lte: (col: string, v: never) => where(`${col}<=${v}`, (r) => (r[col] as never) <= v),
    match: (m: Row) => {
      for (const [k, v] of Object.entries(m)) where(`${k}=${v}`, (r) => r[k] === v)
      return b
    },
    order: (col: string, opts?: { ascending?: boolean }) => { orderBy.push({ col, asc: opts?.ascending !== false }); return b },
    range: (a: number, z: number) => { from = a; to = z; return b },
    limit: (n: number) => { to = from + n - 1; return b },
    single: async () => {
      const res = run()
      const list = res.data as Row[] | null
      if (res.error) return res
      if (!list || list.length !== 1) return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' }, count: null, status: 406 }
      return { ...res, data: list[0] }
    },
    maybeSingle: async () => {
      const res = run()
      const list = res.data as Row[] | null
      return res.error ? res : { ...res, data: list?.[0] ?? null }
    },
    then: <T>(ok: (v: ReturnType<typeof run>) => T, fail?: (e: unknown) => T) => Promise.resolve().then(run).then(ok, fail),
  }
  return b
}

const channel = () => {
  const c = { on: () => c, subscribe: () => c }
  return c
}

export const supabase = {
  from: query,
  channel,
  removeChannel: async () => 'ok',
  rpc: async () => ({ data: null, error: null }),
  functions: { invoke: async () => ({ data: null, error: null }) },
  storage: {
    from: () => ({
      upload: async () => ({ data: null, error: null }),
      remove: async () => ({ data: [], error: null }),
      getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/${path}` } }),
    }),
  },
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  },
}

export const supabaseModule = { supabase }
