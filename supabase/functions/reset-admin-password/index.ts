import { corsHeaders, json, readJson, requireSuperadmin } from '../_shared/superadmin.ts'
import { validateResetPassword } from '../_shared/validate.ts'

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 400)

  const auth = await requireSuperadmin(req)
  if (auth instanceof Response) return auth
  const { admin } = auth

  const parsed = validateResetPassword(await readJson(req))
  if (!parsed.ok) return json({ error: parsed.error }, 400)
  const { user_id, password } = parsed.value

  const { data: profile, error: profileError } = await admin
    .from('admin_profiles')
    .select('role')
    .eq('user_id', user_id)
    .maybeSingle()
  if (profileError) return json({ error: profileError.message }, 500)
  if (!profile) return json({ error: 'admin not found' }, 400)
  if (profile.role === 'superadmin') return json({ error: 'cannot reset superadmin' }, 400)

  const { error } = await admin.auth.admin.updateUserById(user_id, { password })
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
