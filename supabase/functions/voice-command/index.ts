// Turns what the referee said (already text, from the phone's speech recognition) into one match
// action, with Claude. The league's owner only; nothing is saved here: the app shows the action
// for the referee to confirm and records it the usual way. Needs the ANTHROPIC_API_KEY secret.
import { createClient } from 'npm:@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk@1'
import { corsHeaders, json, readJson } from '../_shared/superadmin.ts'
import { internalError } from '../_shared/errors.ts'
import { deadline } from '../_shared/deadline.ts'
import { readVoiceAnswer, validateVoiceRequest, voicePrompt, voiceSchema, VOICE_SYSTEM } from '../_shared/voiceCommand.ts'

const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })

// Claude's whole answer, retry included, within this: the app stops waiting at 15 s, so the work
// ends before that instead of running on for an answer nobody reads
const MODEL_MS = 10_000

// One line per request in the function's logs: timings and outcome only, never the words or names
function logTiming(fields: Record<string, string | number | null | undefined>) {
  console.log(JSON.stringify({ fn: 'voice-command', ...fields }))
}

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 400)

  const parsed = validateVoiceRequest(await readJson(req))
  if (!parsed.ok) return json({ error: parsed.error }, 400)
  const body = parsed.value

  const started = Date.now()
  const caller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: owns, error: authError } = await caller.rpc('owns_league', { p_league_id: body.league_id })
  if (authError || owns !== true) return json({ error: 'forbidden' }, 403)
  const authMs = Date.now() - started

  // Cancelled when the app closes the request (if the runtime passes that on as req.signal) or
  // when the time is up. The SDK then drops its connection to Claude.
  const work = deadline(req.signal, MODEL_MS)
  const modelStarted = Date.now()
  let response: Anthropic.Message
  try {
    response = await client.messages.create({
      model: 'claude-haiku-5-5',
      max_tokens: 1024,
      // A short, simple extraction: low effort keeps the referee's wait to about a second
      output_config: { effort: 'low', format: { type: 'json_schema', schema: voiceSchema(body.players) } },
      system: VOICE_SYSTEM,
      messages: [{ role: 'user', content: voicePrompt(body) }],
    }, { signal: work.signal, maxRetries: 1 })
  } catch (e) {
    const reason = work.reason()
    if (!reason) throw e
    logTiming({ outcome: reason, auth_ms: authMs, model_ms: Date.now() - modelStarted })
    return json({ error: reason }, reason === 'timeout' ? 504 : 499)
  } finally {
    work.done()
  }
  const modelMs = Date.now() - modelStarted
  logTiming({
    outcome: response.stop_reason ?? 'none', auth_ms: authMs, model_ms: modelMs,
    input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens,
  })
  if (response.stop_reason !== 'end_turn') return json({ command: readVoiceAnswer(null, body.players), model_ms: modelMs })

  const text = response.content.find((b) => b.type === 'text')
  let answer: unknown = null
  try {
    answer = text && text.type === 'text' ? JSON.parse(text.text) : null
  } catch {
    answer = null
  }
  return json({ command: readVoiceAnswer(answer, body.players, body), model_ms: modelMs })
}

Deno.serve(async (req) => {
  try {
    return await handle(req)
  } catch (e) {
    return json(internalError('voice-command', e), 500)
  }
})
