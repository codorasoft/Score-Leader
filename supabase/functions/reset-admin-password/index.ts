import { corsHeaders, json, readJson, requireSuperadmin } from '../_shared/superadmin.ts'
import { internalError } from '../_shared/errors.ts'
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
  if (profileError) return json(internalError('profile', profileError), 500)
  if (!profile) return json({ error: 'admin not found' }, 400)
  if (profile.role === 'superadmin') return json({ error: 'cannot reset superadmin' }, 400)

  const { error } = await admin.auth.admin.updateUserById(user_id, { password })
  // Auth rejections (weak password and similar) are safe to pass on; anything else stays in the logs.
  if (error && (error.status ?? 500) < 500) return json({ error: error.message }, 400)
  if (error) return json(internalError('update password', error), 500)
  return json({ ok: true })
}

// Unexpected failures still answer JSON with CORS headers, so the browser sees the error.
Deno.serve(async (req) => {
  try {
    return await handle(req)
  } catch (e) {
    return json(internalError('unhandled', e), 500)
  }
})
