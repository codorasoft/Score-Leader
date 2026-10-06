import { corsHeaders, json, readJson, requireSuperadmin } from '../_shared/superadmin.ts'
import { internalError } from '../_shared/errors.ts'
import { validateCreateAdmin } from '../_shared/validate.ts'

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 400)

  const auth = await requireSuperadmin(req)
  if (auth instanceof Response) return auth
  const { admin } = auth

  const parsed = validateCreateAdmin(await readJson(req))
  if (!parsed.ok) return json({ error: parsed.error }, 400)
  const { email, password, display_name, max_leagues, features } = parsed.value

  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) return json({ error: error?.message ?? 'create user failed' }, 400)

  const { error: profileError } = await admin.from('admin_profiles').insert({
    user_id: data.user.id,
    role: 'admin',
    email,
    display_name,
    max_leagues,
    features,
  })
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id)
    return json(internalError('profile', profileError), 500)
  }
  return json({ ok: true, user_id: data.user.id })
}

// Unexpected failures still answer JSON with CORS headers, so the browser sees the error.
Deno.serve(async (req) => {
  try {
    return await handle(req)
  } catch (e) {
    return json(internalError('unhandled', e), 500)
  }
})
