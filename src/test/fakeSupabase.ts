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
  // Requests to a table listed here wait for this promise, to test what happens while one is in flight
  holds: {} as Record<string, Promise<unknown>>,
  // The pitch outbox sends nothing while signed out
  signedIn: true,
  nextId: 1,
}

export function resetDb(tables: Record<string, Row[]> = {}) {
  db.tables = structuredClone(tables)
  db.writes = []
  db.reads = 0
  db.errors = {}
  db.holds = {}
  db.signedIn = true
  db.nextId = 1
  forgetCachedLeagues()
}

export const rows = (table: string) => (db.tables[table] ??= [])

// Linked tables in a select, like 'sessions' in '*, sessions(count)' or 'teams(*, team_players(*))'
interface Embed { table: string; cols: Column[] }
type Column = string | Embed

function parseColumns(text: string): Column[] {
  const cols: Column[] = []
  let depth = 0
  let start = 0
  const add = (part: string) => {
    part = part.trim()
    const open = part.indexOf('(')
    if (open < 0) { if (part) cols.push(part); return }
    cols.push({ table: part.slice(0, open).trim(), cols: parseColumns(part.slice(open + 1, -1)) })
  }
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')') depth--
    else if (text[i] === ',' && depth === 0) { add(text.slice(start, i)); start = i + 1 }
  }
  add(text.slice(start))
  return cols
}

const embeddedTables = (cols: Column[]): string[] =>
  cols.flatMap((c) => (typeof c === 'string' ? [] : [c.table, ...embeddedTables(c.cols)]))

// A link is found by column name: matches.session_id points at sessions, so a session lists its
// matches, and match_events.player_id points at players, so an event carries its one player.
// The league_directory view is reached through league_id, like the real database does.
const TO_ONE: Record<string, string> = { league_directory: 'league_id' }
const idColumns = (table: string) => [TO_ONE[table], `${table.slice(0, -1)}_id`, `${table.slice(0, -2)}_id`].filter(Boolean)

function shape(table: string, row: Row, cols: Column[]): Row {
  const out: Row = cols.includes('*') ? { ...row } : {}
  for (const c of cols) {
    if (typeof c === 'string') { if (c !== '*') out[c] = row[c]; continue }
    const toOne = idColumns(c.table).find((k) => k in row)
    if (toOne) {
      const target = rows(c.table).find((r) => r.id === row[toOne])
      out[c.table] = target ? shape(c.table, target, c.cols) : null
      continue
    }
    const back = idColumns(table).find((k) => rows(c.table).some((r) => k in r)) ?? ''
    const children = rows(c.table).filter((r) => r[back] === row.id)
    out[c.table] = c.cols.length === 1 && c.cols[0] === 'count'
      ? [{ count: children.length }]
      : children.map((r) => shape(c.table, r, c.cols))
  }
  return out
}

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
  let columns: Column[] = ['*']

  const where = (desc: string, f: Filter) => { filters.push(f); described.push(desc); return b }

  const run = (): { data: unknown; error: ApiError | null; count: number | null; status: number } => {
    // Like the real API, a failing linked table fails the whole request
    const error = [table, ...embeddedTables(columns)].map((name) => db.errors[name]).find(Boolean)
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
    if (embeddedTables(columns).length) out = out.map((r) => shape(table, r, columns))
    return { data: head ? null : out, error: null, count: count ? hit.length : null, status: 200 }
  }

  const b = {
    select: (cols?: string, opts?: { count?: string; head?: boolean }) => {
      if (op === 'select') { count = opts?.count; head = !!opts?.head; columns = parseColumns(cols ?? '*') } else returning = true
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
      await db.holds[table]
      const res = run()
      const list = res.data as Row[] | null
      if (res.error) return res
      if (!list || list.length !== 1) return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' }, count: null, status: 406 }
      return { ...res, data: list[0] }
    },
    maybeSingle: async () => {
      await db.holds[table]
      const res = run()
      const list = res.data as Row[] | null
      return res.error ? res : { ...res, data: list?.[0] ?? null }
    },
    then: <T>(ok: (v: ReturnType<typeof run>) => T, fail?: (e: unknown) => T) => Promise.resolve(db.holds[table]).then(run).then(ok, fail),
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
    getSession: async () => ({ data: { session: db.signedIn ? { user: { id: 'u1' } } : null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  },
}

export const supabaseModule = { supabase }
