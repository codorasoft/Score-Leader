// Sends the morning notifications. Called every 15 minutes by the database job
// (public.kick_morning_push), and by a coach's "Send a test now". Everything it decides is in
// _shared/morningPush.ts and _shared/morningPushData.ts, which are tested; this file is the
// shell around them: the caller, the clients, and the push library.
//
// The gateway's own check is off for this function (supabase/config.toml), because the job
// does not carry a session; the caller is checked here.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'
import { corsHeaders, json, readJson } from '../_shared/superadmin.ts'
import { internalError } from '../_shared/errors.ts'
import { callerKind, runRound, runTest, SEND_LIMIT_MS, type PushMessage, type PushSub, type SendResult } from '../_shared/morningPush.ts'
import { coachIsAllowed, roundDeps } from '../_shared/morningPushData.ts'

// A phone that is off at the hour still gets the notification when it is back that day
const KEEP_SECONDS = 12 * 60 * 60

// One message to one device, encrypted for it and signed as this app
async function send(sub: PushSub, message: PushMessage): Promise<SendResult> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(message),
      {
        TTL: KEEP_SECONDS,
        // The round gives a send up at this limit too; this closes the connection itself
        timeout: SEND_LIMIT_MS,
        vapidDetails: {
          subject: Deno.env.get('VAPID_SUBJECT')!,
          publicKey: Deno.env.get('VAPID_PUBLIC_KEY')!,
          privateKey: Deno.env.get('VAPID_PRIVATE_KEY')!,
        },
      },
    )
    return 'sent'
  } catch (e) {
    const refusal = e as { statusCode?: number; body?: unknown } | null
    const status = refusal?.statusCode
    // The push service no longer knows the address: the browser gave it back, or renewed it
    if (status === 404 || status === 410) return 'gone'
    // What the push service said (a short reason such as a wrong key), to tell a set-up fault
    // from a passing one. The address is a secret of the device and stays out of the logs.
    const reason = typeof refusal?.body === 'string' ? refusal.body.slice(0, 200) : ''
    console.error('push failed:', status ?? (e instanceof Error ? e.message : e), reason)
    return 'failed'
  }
}

const TEST_STATUS: Record<SendResult | 'notFound', number> = { sent: 200, notFound: 404, gone: 410, failed: 502 }

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 400)

  const authorization = req.headers.get('Authorization')
  const caller = callerKind(authorization, Deno.env.get('MORNING_PUSH_SECRET'))
  if (caller === 'none') return json({ error: 'forbidden' }, 403)

  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const deps = roundDeps(admin, send)

  // The job: everyone who is due
  if (caller === 'job') return json(await runRound(deps, new Date()))

  // A coach, for a test: his own device, now
  const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization! } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData } = await asCaller.auth.getUser()
  const userId = userData?.user?.id
  if (!userId || !(await coachIsAllowed(admin, userId))) return json({ error: 'forbidden' }, 403)

  const body = await readJson(req) as { test?: unknown; endpoint?: unknown } | null
  if (body?.test !== true || typeof body.endpoint !== 'string') return json({ error: 'bad request' }, 400)

  const result = await runTest(deps, userId, body.endpoint, new Date())
  return json({ result }, TEST_STATUS[result])
}

// Unexpected failures still answer JSON with CORS headers, so the browser sees the error.
Deno.serve(async (req) => {
  try {
    return await handle(req)
  } catch (e) {
    return json(internalError('unhandled', e), 500)
  }
})
