import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json, readJson, requireSuperadmin } from '../_shared/superadmin.ts'
import { validateDeleteLeague } from '../_shared/validate.ts'

// Collect every file path under prefix, recursing into folders (entries with id === null).
async function listFiles(admin: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  const files: string[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset })
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    for (const entry of data) {
      const path = `${prefix}/${entry.name}`
      if (entry.id === null) files.push(...(await listFiles(admin, bucket, path)))
      else files.push(path)
    }
    if (data.length < 1000) break
    offset += data.length
  }
  return files
}

async function emptyPrefix(admin: SupabaseClient, bucket: string, prefix: string): Promise<void> {
  for (;;) {
    const paths = await listFiles(admin, bucket, prefix)
    if (paths.length === 0) return
    for (let i = 0; i < paths.length; i += 1000) {
      const { data, error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 1000))
      if (error) throw new Error(error.message)
      if (!data || data.length === 0) throw new Error('storage remove made no progress')
    }
  }
}

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 400)

  const auth = await requireSuperadmin(req)
  if (auth instanceof Response) return auth
  const { admin } = auth

  const parsed = validateDeleteLeague(await readJson(req))
  if (!parsed.ok) return json({ error: parsed.error }, 400)
  const { league_id, confirm_name } = parsed.value

  const { data: league, error: loadError } = await admin
    .from('leagues')
    .select('id, name')
    .eq('id', league_id)
    .maybeSingle()
  if (loadError) return json({ error: loadError.message }, 500)
  if (!league) return json({ error: 'league not found' }, 404)
  if (confirm_name !== league.name) return json({ error: 'name does not match' }, 400)

  try {
    for (const bucket of ['player-photos', 'league-logos']) {
      await emptyPrefix(admin, bucket, league.id)
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'storage cleanup failed' }, 500)
  }

  const { error } = await admin.from('leagues').delete().eq('id', league_id)
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true })
}

// Unexpected failures still answer JSON with CORS headers, so the browser sees the error.
Deno.serve(async (req) => {
  try {
    return await handle(req)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'internal error' }, 500)
  }
})
