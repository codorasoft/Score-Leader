// Moves legacy player photos into <league_id>/ folders and updates players.photo_url.
// Safe to re-run. Usage: SUPABASE_SERVICE_ROLE_KEY=... node scripts/move-photos.ts [--dry-run]
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { groupMovesByFrom, planPhotoMoves, strayObjects } from './photoMoves.ts'

const PAGE = 1000
const BUCKET = 'player-photos'
const dryRun = process.argv.includes('--dry-run')

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
const store = supabase.storage.from(BUCKET)
const publicPrefix = `${url.replace(/\/$/, '')}/storage/v1/object/public/${BUCKET}/`

class NeedsMigration extends Error {}

type Player = { id: string; league_id: string; photo_url: string | null }

async function fetchPlayers(): Promise<Player[]> {
  const rows: Player[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('players')
      .select('id, league_id, photo_url')
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) {
      if (error.code === '42703' || /league_id/.test(error.message)) {
        throw new NeedsMigration()
      }
      throw new Error(`players: ${error.message}`)
    }
    rows.push(...(data as Player[]))
    if (data.length < PAGE) break
  }
  return rows
}

async function listFiles(prefix: string): Promise<string[]> {
  const files: string[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await store.list(prefix, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error) throw new Error(`list ${prefix}: ${error.message}`)
    for (const e of data) {
      const path = prefix ? `${prefix}/${e.name}` : e.name
      if (e.id === null) files.push(...(await listFiles(path)))
      else files.push(path)
    }
    if (data.length < PAGE) break
  }
  return files
}

// stray detection only looks at objects outside league folders
async function listLegacy(): Promise<string[]> {
  const { data, error } = await store.list('', { limit: PAGE })
  if (error) throw new Error(`list: ${error.message}`)
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const out: string[] = []
  for (const e of data) {
    if (UUID.test(e.name)) continue
    if (e.id === null) out.push(...(await listFiles(e.name)))
    else out.push(e.name)
  }
  return out
}

const pathsOf = (players: Player[]) =>
  new Set(planPhotoMoves(players.map((p) => ({ ...p, league_id: 'x' })), publicPrefix).map((m) => m.from))

async function main() {
let players = await fetchPlayers()
const moves = planPhotoMoves(players, publicPrefix)
const failed: { playerId: string; step: string; error: string }[] = []
let moved = 0
let alreadyDone = 0

if (dryRun) {
  console.log(`Plan: ${moves.length} photo(s) to move`)
  for (const m of moves) console.log(`  ${m.playerId}: ${m.from} -> ${m.to}`)
  const stray = strayObjects(await listLegacy(), pathsOf(players))
  console.log(JSON.stringify({ dryRun: true, toMove: moves.length, stray }, null, 2))
  return
}

for (const g of groupMovesByFrom(moves)) {
  let allMoved = true
  for (const t of g.targets) {
    const copy = await store.copy(g.from, t.to)
    if (copy.error && !/already exists|duplicate/i.test(copy.error.message)) {
      failed.push({ playerId: t.playerId, step: 'copy', error: copy.error.message })
      allMoved = false
      continue
    }
    if (copy.error) alreadyDone++
    const newUrl = store.getPublicUrl(t.to).data.publicUrl
    const upd = await supabase.from('players').update({ photo_url: newUrl }).eq('id', t.playerId)
    if (upd.error) {
      failed.push({ playerId: t.playerId, step: 'update', error: upd.error.message })
      allMoved = false
      continue
    }
    moved++
  }
  // the old object goes only after every player that used it has moved
  if (!allMoved) continue
  const rm = await store.remove([g.from])
  if (rm.error) failed.push({ playerId: g.targets[0].playerId, step: 'remove', error: rm.error.message })
}

players = await fetchPlayers()
const broken: { playerId: string; url: string; status: number | string }[] = []
for (const p of players) {
  if (!p.photo_url) continue
  try {
    const res = await fetch(p.photo_url, { method: 'HEAD' })
    if (res.status !== 200) broken.push({ playerId: p.id, url: p.photo_url, status: res.status })
  } catch (e) {
    broken.push({ playerId: p.id, url: p.photo_url, status: (e as Error).message })
  }
}

const stray = strayObjects(await listLegacy(), pathsOf(players))
console.log(JSON.stringify({ moved, alreadyDone, failed, broken, stray }, null, 2))
if (failed.length || broken.length) process.exitCode = 1
}

try {
  await main()
} catch (e) {
  if (e instanceof NeedsMigration) console.error('run after Migration 1')
  else console.error((e as Error).message)
  process.exitCode = 1
}
