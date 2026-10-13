// Production builds read the database address, its public key and the public half of the push
// key from the committed .env.production. It is in git, so it must only ever hold public values.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const text = readFileSync(resolve(__dirname, '../.env.production'), 'utf8')
const vars = Object.fromEntries(text.split(/\r?\n/).filter((l) => /^\w+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

it('points production at the Zurich project', () => {
  expect(vars.VITE_SUPABASE_URL).toBe('https://eogjqaquveigkqhmimjs.supabase.co')
  expect(vars.VITE_SUPABASE_ANON_KEY).toMatch(/^sb_publishable_/)
})

// The public half of the key that signs the morning notifications: a 65-byte point, which in
// base64url is 87 characters starting with B. The private half is 43 characters and never here.
it('carries the public push key', () => {
  expect(vars.VITE_VAPID_PUBLIC_KEY).toMatch(/^B[A-Za-z0-9_-]{86}$/)
})

it('holds nothing but the three public values', () => {
  expect(Object.keys(vars).sort()).toEqual(['VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL', 'VITE_VAPID_PUBLIC_KEY'])
  expect(text).not.toMatch(/sb_secret_|service_role|eyJhbGciOi|postgres(ql)?:\/\/|sbp_/)
  expect(text).not.toMatch(/PRIVATE|SECRET/i)
})
