// Copies the live project (the CLI's linked project) into a new, empty project: logins with the
// same ids and password hashes, every public table with the same ids, then checks that each
// table's contents match exactly. Photos are copied separately (--storage).
//
// Usage (reads TARGET_* from .env.zurich.local, never prints secrets):
//   node scripts/copy-project.ts --auth      copy auth.users and auth.identities
//   node scripts/copy-project.ts --data      replace every public table in the target with the source rows
//   node scripts/copy-project.ts --storage   copy storage files (needs ZURICH_SECRET_KEY)
//   node scripts/copy-project.ts --verify    compare every table, source vs target (exit 1 on any difference)
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type Row = Record<string, unknown>

const env = Object.fromEntries(
  readFileSync('.env.zurich.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const sourceEnv = readFileSync('.env', 'utf8')
const SOURCE_URL = (sourceEnv.match(/^\s*VITE_SUPABASE_URL\s*=\s*(.+?)\s*$/m)?.[1] ?? '').replace(/^["']|["']$/g, '')
const TARGET_URL = env.ZURICH_URL
const TARGET_DB = env.ZURICH_DB_URL
if (!SOURCE_URL || !TARGET_URL || !TARGET_DB) throw new Error('Need VITE_SUPABASE_URL in .env and ZURICH_URL / ZURICH_DB_URL in .env.zurich.local')

// Parents before children
export const PUBLIC_TABLES = [
  'admin_profiles', 'leagues', 'players', 'sessions', 'session_players', 'teams', 'team_players',
  'matches', 'match_events', 'award_votes', 'award_vote_nominations', 'award_vote_entries',
  'session_awards', 'lineups', 'lineup_players',
]
const AUTH_TABLES = ['users', 'identities']

const work = mkdtempSync(join(tmpdir(), 'copy-project-'))
const secret = (s: string) => s.split(env.ZURICH_DB_PASSWORD ?? '\u0000').join('***')

function query(target: 'source' | 'target', sql: string): Row[] {
  const file = join(work, 'q.sql')
  writeFileSync(file, sql)
  const args = ['db', 'query', '-f', file, ...(target === 'source' ? ['--linked'] : ['--db-url', TARGET_DB])]
  let out: string
  try {
    out = execFileSync('supabase', args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string }
    throw new Error(secret(`${target} query failed: ${(err.stdout ?? '') + (err.stderr ?? '')}`.slice(0, 2000)))
  }
  // A DO block returns no result set, so there may be nothing to parse
  const start = out.indexOf('{')
  return start < 0 ? [] : (JSON.parse(out.slice(start)) as { rows?: Row[] }).rows ?? []
}

// Columns that can be written (not generated), as the target defines them
function writableColumns(schema: string, table: string): string[] {
  const rows = query('target', `select column_name from information_schema.columns
    where table_schema = '${schema}' and table_name = '${table}' and is_generated = 'NEVER' and generation_expression is null
    order by ordinal_position`)
  return rows.map((r) => r.column_name as string)
}

const dollar = (json: string) => {
  let tag = 'j'
  while (json.includes(`$${tag}$`)) tag += 'x'
  return `$${tag}$${json}$${tag}$`
}

function readRows(schema: string, table: string): Row[] {
  const rows = query('source', `select coalesce(json_agg(t), '[]'::json) as data from ${schema}.${table} t`)
  return (rows[0]?.data as Row[]) ?? []
}

// The direct connection runs one command per request: a DO block is one command and all-or-nothing
const atomically = (statements: string) => `do $do$ begin\n${statements}end $do$`

const insertSql = (schema: string, table: string, cols: string[], rows: Row[]) => {
  const list = cols.map((c) => `"${c}"`).join(', ')
  return `insert into ${schema}.${table} (${list}) select ${list} from jsonb_populate_recordset(null::${schema}.${table}, ${dollar(JSON.stringify(rows))}::jsonb);\n`
}

// Photo and logo addresses point at the project they live in
const rewriteUrls = (table: string, rows: Row[]) => rows.map((r) => {
  const key = table === 'players' ? 'photo_url' : table === 'leagues' ? 'logo_url' : null
  if (!key || typeof r[key] !== 'string') return r
  return { ...r, [key]: (r[key] as string).split(SOURCE_URL).join(TARGET_URL) }
})

function copyAuth() {
  let sql = ''
  for (const t of AUTH_TABLES) {
    const rows = readRows('auth', t)
    console.log(`auth.${t}: ${rows.length} rows`)
    sql += insertSql('auth', t, writableColumns('auth', t), rows)
  }
  query('target', atomically(sql))
}

function copyData() {
  // Replace everything (including the league the multi-league migration creates) in one transaction.
  // Triggers stay on (Supabase does not allow switching them off): parents go in before children,
  // and the live data already satisfies every trigger; --verify proves nothing was altered.
  let sql = `delete from ${[...PUBLIC_TABLES].reverse().map((t) => `public.${t}`).join(';\ndelete from ')};\n`
  for (const t of PUBLIC_TABLES) {
    const rows = rewriteUrls(t, readRows('public', t))
    console.log(`public.${t}: ${rows.length} rows`)
    if (rows.length) sql += insertSql('public', t, writableColumns('public', t), rows)
  }
  query('target', atomically(sql))
}

// Fingerprint of a table's full contents; photo/logo addresses compared with the source address
function fingerprint(target: 'source' | 'target', schema: string, table: string, cols: string[]) {
  const list = cols.map((c) => `t."${c}"`).join(', ')
  const text = target === 'target' ? `replace(row(${list})::text, '${TARGET_URL}', '${SOURCE_URL}')` : `row(${list})::text`
  const rows = query(target, `select count(*) as n, md5(coalesce(string_agg(${text}, '|' order by ${text}), '')) as h from ${schema}.${table} t`)
  return `${rows[0].n}:${rows[0].h}`
}

function verify(): boolean {
  let ok = true
  for (const [schema, tables] of [['public', PUBLIC_TABLES], ['auth', AUTH_TABLES]] as const) {
    for (const t of tables) {
      const cols = writableColumns(schema, t).filter((c) => !['updated_at', 'last_sign_in_at'].includes(c) || schema === 'public')
      const a = fingerprint('source', schema, t, cols)
      const b = fingerprint('target', schema, t, cols)
      const same = a === b
      ok &&= same
      console.log(`${same ? 'same' : 'DIFFERENT'}  ${schema}.${t}  rows ${a.split(':')[0]} / ${b.split(':')[0]}`)
    }
  }
  return ok
}

async function copyStorage() {
  const key = env.ZURICH_SECRET_KEY
  if (!key) throw new Error('Need ZURICH_SECRET_KEY in .env.zurich.local')
  const objects = query('source', "select bucket_id, name, metadata->>'mimetype' as type from storage.objects order by bucket_id, name")
  for (const o of objects) {
    const path = `${o.bucket_id}/${o.name}`
    const res = await fetch(`${SOURCE_URL}/storage/v1/object/public/${path}`)
    if (!res.ok) throw new Error(`download ${path}: ${res.status}`)
    const up = await fetch(`${TARGET_URL}/storage/v1/object/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': String(o.type ?? 'application/octet-stream'), 'x-upsert': 'true' },
      body: Buffer.from(await res.arrayBuffer()),
    })
    if (!up.ok) throw new Error(`upload ${path}: ${up.status} ${await up.text()}`)
    console.log(`copied ${path}`)
  }
}

try {
  const arg = process.argv[2]
  if (arg === '--auth') copyAuth()
  else if (arg === '--data') copyData()
  else if (arg === '--storage') await copyStorage()
  else if (arg === '--verify') { if (!verify()) process.exitCode = 1 }
  else throw new Error('Use --auth, --data, --storage or --verify')
} finally {
  rmSync(work, { recursive: true, force: true })
}
