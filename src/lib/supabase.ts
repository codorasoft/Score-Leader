import { createClient } from '@supabase/supabase-js'
import { createReportingFetch } from './reportingFetch'
import { showToast } from './toast'

// Local .env uses VITE_*; the Vercel–Supabase integration injects NEXT_PUBLIC_* at build time.
const env = import.meta.env
const supabaseUrl = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey =
  env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

export const supabase = createClient(
  supabaseUrl as string,
  supabaseAnonKey as string,
  { global: { fetch: createReportingFetch((...args) => fetch(...args), showToast) } },
)
