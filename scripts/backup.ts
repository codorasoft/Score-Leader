// Read-only backup of every public table, auth users (id/email/created_at) and player photos and league logos.
// Usage: SUPABASE_SERVICE_ROLE_KEY=... node scripts/backup.ts
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const PAGE = 1000
const BUCKETS = ['player-photos', 'league-logos']
const OUT_ROOT = 'E:/Score-Leader-backups'

// table -> order columns (stable paging)
const TABLES: Record<string, string[]> = {
  players: ['id'],
  sessions: ['id'],
  session_players: ['session_id', 'player_id'],
  teams: ['id'],
  team_players: ['team_id', 'player_id'],
  matches: ['id'],
  match_events: ['id'],
  award_votes: ['id'],
  award_vote_nominations: ['award_vote_id', 'player_id'],
  award_vote_entries: ['id'],
  session_awards: ['id'],
  lineups: ['id'],
  lineup_players: ['lineup_id', 'player_id'],
  // arrive with the multi-tenant migration; skipped while absent
  admin_profiles: ['user_id'],
  leagues: ['id'],
}

const OPTIONAL = new Set(['admin_profiles', 'leagues'])

function readEnvUrl(): string | undefined {
  try {
    const m = readFileSync('.env', 'utf8').match(/^\s*VITE_SUPABASE_URL\s*=\s*(.+?)\s*$/m)
    return m?.[1].replace(/^["']|["']$/g, '')
  } catch {
    return undefined
  }
}

const url = readEnvUrl()
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL (.env) or SUPABASE_SERVICE_ROLE_KEY (env)')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

const d = new Date()
const p = (n: number) => String(n).padStart(2, '0')
const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}-${p(d.getMinutes())}`
const outDir = join(OUT_ROOT, stamp)
mkdirSync(outDir, { recursive: true })

function save(rel: string, data: string | Uint8Array) {
  const file = join(outDir, rel)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, data)
}

const isMissing = (e: { code?: string }) => e.code === '42P01' || e.code === 'PGRST205'

async function dumpTable(table: string, order: string[]): Promise<number | null> {
  const head = await supabase.from(table).select('*', { count: 'exact', head: true })
  if (head.error) {
    if (OPTIONAL.has(table) && (isMissing(head.error) || /schema cache|does not exist/.test(head.error.message))) return null
    throw new Error(`${table}: ${head.error.message}`)
  }
  if (head.count === null) {
    // HEAD responses carry no error body; a missing table shows up as a null count
    if (OPTIONAL.has(table)) return null
    throw new Error(`${table}: no row count returned`)
  }
  const rows: unknown[] = []
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select('*')
    for (const c of order) q = q.order(c)
    const { data, error } = await q.range(from, from + PAGE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...data)
    if (data.length < PAGE) break
  }
  if (rows.length !== head.count) throw new Error(`${table}: fetched ${rows.length} rows, expected ${head.count}`)
  save(`${table}.json`, JSON.stringify(rows, null, 2))
  return rows.length
}

async function listFiles(bucket: string, prefix: string): Promise<string[]> {
  const files: string[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error) throw new Error(`list ${prefix}: ${error.message}`)
    for (const e of data) {
      const path = prefix ? `${prefix}/${e.name}` : e.name
      if (e.id === null) files.push(...(await listFiles(bucket, path)))
      else files.push(path)
    }
    if (data.length < PAGE) break
  }
  return files
}

const manifest: Record<string, unknown> = {}
const counts: Record<string, number> = {}
const skipped: string[] = []
for (const [table, order] of Object.entries(TABLES)) {
  const n = await dumpTable(table, order)
  if (n === null) {
    skipped.push(table)
    console.log(`skip ${table} (does not exist)`)
    continue
  }
  counts[table] = n
}

const users: { id: string; email?: string; created_at: string }[] = []
for (let page = 1; ; page++) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PAGE })
  if (error) throw new Error(`auth users: ${error.message}`)
  users.push(...data.users.map((u) => ({ id: u.id, email: u.email, created_at: u.created_at })))
  if (data.users.length < PAGE) break
}
save('auth-users.json', JSON.stringify(users, null, 2))

const files: Record<string, number> = {}
let totalBytes = 0
for (const bucket of BUCKETS) {
  let paths: string[]
  try {
    paths = await listFiles(bucket, '')
  } catch (e) {
    // league-logos arrives with the multi-tenant migration; skipped while the bucket is absent
    if (bucket === 'league-logos' && /not found|does not exist/i.test(String(e))) {
      console.log(`skip bucket ${bucket} (does not exist)`)
      continue
    }
    throw e
  }
  for (const path of paths) {
    const { data, error } = await supabase.storage.from(bucket).download(path)
    if (error) throw new Error(`download ${bucket}/${path}: ${error.message}`)
    const buf = new Uint8Array(await data.arrayBuffer())
    totalBytes += buf.length
    save(join('storage', bucket, path), buf)
  }
  files[bucket] = paths.length
}

Object.assign(manifest, counts, { skippedTables: skipped, authUsers: users.length, photos: files['player-photos'] ?? 0, logos: files['league-logos'] ?? 0, totalBytes })
save('manifest.json', JSON.stringify(manifest, null, 2))
console.log(`Backup written to ${outDir}`)
console.log(JSON.stringify(manifest, null, 2))
