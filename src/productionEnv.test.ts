// Production builds read the database address and public key from the committed .env.production.
// It is in git, so it must only ever hold public values.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const text = readFileSync(resolve(__dirname, '../.env.production'), 'utf8')
const vars = Object.fromEntries(text.split(/\r?\n/).filter((l) => /^\w+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

it('points production at the Zurich project', () => {
  expect(vars.VITE_SUPABASE_URL).toBe('https://eogjqaquveigkqhmimjs.supabase.co')
  expect(vars.VITE_SUPABASE_ANON_KEY).toMatch(/^sb_publishable_/)
})

it('holds nothing but the two public values', () => {
  expect(Object.keys(vars).sort()).toEqual(['VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL'])
  expect(text).not.toMatch(/sb_secret_|service_role|eyJhbGciOi|postgres(ql)?:\/\/|sbp_/)
})
