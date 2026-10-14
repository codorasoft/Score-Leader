// In-memory stand-in for the Supabase client, for page tests. Tables are plain row arrays;
// filters really filter, inserts/updates/deletes really change the rows, and every write is logged.
// Use it with:  vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)

import { forgetCachedLeagues } from '../lib/leagueCache'

// Like the real API (supabase/config.toml max_rows), one response holds at most this many rows
const MAX_ROWS = 1000

type Row = Record<string, unknown>
type Filter = (row: Row) => boolean
type ApiError = { message: string; code?: string }

export interface Write { table: string; op: 'insert' | 'update' | 'delete' | 'upsert'; values?: unknown; filters: string[] }

export const db = {
  tables: {} as Record<string, Row[]>,
  writes: [] as Write[],
  reads: 0,
  // The abort signal each read was made with (undefined for none), in the order they ran
  signals: [] as (AbortSignal | undefined)[],
  // Every request to a table listed here fails with this error (reads and writes)
  errors: {} as Record<string, ApiError>,
  // Requests to a table listed here wait for this promise, to test what happens while one is in flight
  holds: {} as Record<string, Promise<unknown>>,
  // The pitch outbox sends nothing while signed out
  signedIn: true,
  nextId: 1,
  // Every database function call, and the result to answer one with (default: no data, no error)
  rpcs: [] as { fn: string; args: unknown }[],
  rpcResults: {} as Record<string, { data: unknown; error: ApiError | null }>,
  // Every server function call, and the result to answer one with (default: no data, no error)
  invokes: [] as { name: string; body: unknown }[],
  functionResults: {} as Record<string, { data: unknown; error: ApiError | null }>,
}

// Columns the database fills in itself, by table: generated columns and column defaults.
const GENERATED: Record<string, (row: Row) => Row> = {
  // repeats is generated; the other four have column defaults
  schedule_items: (row) => ({
    skipped_dates: row.skipped_dates ?? [],
    done_dates: row.done_dates ?? [],
    repeat_every: row.repeat_every ?? 1,
    repeat_monthly: row.repeat_monthly ?? false,
    repeats: (Array.isArray(row.repeat_days) && row.repeat_days.length > 0) || row.repeat_monthly === true,
  }),
}
const generate = (table: string, row: Row) => (GENERATED[table] ? Object.assign(row, GENERATED[table](row)) : row)

export function resetDb(tables: Record<string, Row[]> = {}) {
  db.tables = structuredClone(tables)
  for (const [table, list] of Object.entries(db.tables)) list.forEach((row) => generate(table, row))
  db.writes = []
  db.reads = 0
  db.signals = []
  db.errors = {}
  db.holds = {}
  db.signedIn = true
  db.nextId = 1
  db.rpcs = []
  db.rpcResults = {}
  db.invokes = []
  db.functionResults = {}
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

// Numbers sort as numbers (10 after 9); everything else as text
function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
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
  let signal: AbortSignal | undefined

  const where = (desc: string, f: Filter) => { filters.push(f); described.push(desc); return b }

  const run = (): { data: unknown; error: ApiError | null; count: number | null; status: number } => {
    if (op === 'select') db.signals.push(signal)
    // Like the real API, a failing linked table fails the whole request
    const error = [table, ...embeddedTables(columns)].map((name) => db.errors[name]).find(Boolean)
    if (error) return { data: null, error, count: null, status: 400 }
    const all = rows(table)
    const hit = all.filter((r) => filters.every((f) => f(r)))

    // Like the real client (see forgetOnWrite), any write clears the cached league histories
    if (op !== 'select') forgetCachedLeagues()
    if (op === 'insert' || op === 'upsert') {
      const list = (Array.isArray(payload) ? payload : [payload]) as Row[]
      const added = list.map((r) => generate(table, { id: `${table}-${db.nextId++}`, ...r }))
      for (const r of added) {
        const existing = op === 'upsert' ? all.findIndex((x) => x.id === r.id) : -1
        if (existing >= 0) all[existing] = { ...all[existing], ...r }
        else all.push(r)
      }
      db.writes.push({ table, op, values: payload, filters: described })
      return { data: returning ? added : null, error: null, count: null, status: 201 }
    }
    if (op === 'update') {
      for (const r of hit) generate(table, Object.assign(r, payload))
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
      out.sort((a, c) => compare(a[col], c[col]) * (asc ? 1 : -1))
    }
    out = out.slice(from, Math.min(to, from + MAX_ROWS - 1) + 1)
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
    abortSignal: (s: AbortSignal) => { signal = s; return b },
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

// Database functions that do a whole step in one call, done on the tables here as the real ones do
// (supabase/migrations/20261014000001_atomic_match_steps.sql). A result in db.rpcResults wins.
type Args = Record<string, unknown>
const DB_FUNCTIONS: Record<string, (a: Args) => unknown> = {
  confirm_teams: (a) => {
    const session = rows('sessions').find((s) => s.id === a.p_session_id)
    if (!session) throw { message: 'session not found' }
    if (rows('teams').some((t) => t.session_id === session.id)) {
      return rows('matches').find((m) => m.session_id === session.id && m.match_number === 1)?.id ?? null
    }
    for (const t of a.p_teams as { id: string; color: string; player_ids: string[] }[]) {
      rows('teams').push({ id: t.id, session_id: session.id, color: t.color })
      for (const p of t.player_ids) rows('team_players').push({ id: `team_players-${db.nextId++}`, team_id: t.id, player_id: p })
    }
    Object.assign(session, { status: 'active', draft_teams: null })
    const queue = a.p_queue as string[]
    const id = `matches-${db.nextId++}`
    rows('matches').push({
      id, session_id: session.id, match_number: 1, period: 1, team1_id: a.p_team1, team2_id: a.p_team2,
      queue, waiting_team_id: queue[0] ?? null, status: 'pending',
    })
    return id
  },
  finish_match: (a) => {
    const match = rows('matches').find((m) => m.id === a.p_match_id)
    if (!match) throw { message: 'match not found' }
    if (match.status !== 'completed') {
      Object.assign(match, {
        is_draw: a.p_is_draw, winner_team_id: a.p_winner_team_id, draw_resolved_by: a.p_draw_resolved_by,
        penalties_team1: a.p_penalties_team1, penalties_team2: a.p_penalties_team2,
        status: 'completed', timer_status: 'stopped', timer_started_at: null,
        timer_elapsed_seconds: a.p_elapsed_seconds, period_seconds: a.p_period_seconds,
      })
    }
    const number = (match.match_number as number) + 1
    const next = rows('matches').find((m) => m.session_id === match.session_id && m.match_number === number)
    if (next) return next.id
    const queue = a.p_next_queue as string[]
    const id = `matches-${db.nextId++}`
    rows('matches').push({
      id, session_id: match.session_id, match_number: number, period: 1, team1_id: a.p_next_team1, team2_id: a.p_next_team2,
      queue, waiting_team_id: queue[0] ?? null, status: 'pending',
    })
    return id
  },
}

const channel = () => {
  const c = { on: () => c, subscribe: () => c }
  return c
}

export const supabase = {
  from: query,
  channel,
  removeChannel: async () => 'ok',
  // Waits for db.holds['rpc:<name>'], so a test can keep a call in flight
  rpc: async (fn: string, args?: unknown) => {
    db.rpcs.push({ fn, args })
    await db.holds[`rpc:${fn}`]
    if (db.rpcResults[fn]) return db.rpcResults[fn]
    const run = DB_FUNCTIONS[fn]
    if (!run) return { data: null, error: null }
    try {
      return { data: run((args ?? {}) as Args), error: null }
    } catch (e) {
      return { data: null, error: e as ApiError }
    }
  },
  functions: {
    invoke: async (name: string, options?: { body?: unknown }) => {
      db.invokes.push({ name, body: options?.body })
      return db.functionResults[name] ?? { data: null, error: null }
    },
  },
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
