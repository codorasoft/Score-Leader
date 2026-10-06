// One-off: create the superadmin login and its admin_profiles row.
// Usage: SUPABASE_SERVICE_ROLE_KEY=... SUPERADMIN_PASSWORD=... node scripts/create-superadmin.ts
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const EMAIL = 'admin@codorasoft.com'

function envUrl(): string {
  const line = readFileSync('.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('VITE_SUPABASE_URL='))
  return line ? line.slice('VITE_SUPABASE_URL='.length).trim() : ''
}

const url = envUrl()
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const password = process.env.SUPERADMIN_PASSWORD ?? ''
if (!url || !serviceKey || password.length < 8) {
  console.error('Need VITE_SUPABASE_URL in .env, SUPABASE_SERVICE_ROLE_KEY and SUPERADMIN_PASSWORD (8+ chars)')
  process.exitCode = 1
} else {
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password, email_confirm: true })
  if (error || !data.user) {
    console.error('createUser failed:', error?.message)
    process.exitCode = 1
  } else {
    const { error: profileError } = await admin.from('admin_profiles').insert({
      user_id: data.user.id,
      role: 'superadmin',
      email: EMAIL,
      display_name: 'Superadmin',
      max_leagues: 0,
      features: [],
    })
    if (profileError) {
      await admin.auth.admin.deleteUser(data.user.id)
      console.error('profile insert failed, user removed:', profileError.message)
      process.exitCode = 1
    } else {
      console.log('superadmin created:', data.user.id)
    }
  }
}
