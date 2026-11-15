// Turns what the referee said (already text, from the phone's speech recognition) into one match
// action, with Claude. The league's owner only; nothing is saved here: the app shows the action
// for the referee to confirm and records it the usual way. Needs the ANTHROPIC_API_KEY secret.
import { createClient } from 'npm:@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk@1'
import { corsHeaders, json, readJson } from '../_shared/superadmin.ts'
import { internalError } from '../_shared/errors.ts'
import { readVoiceAnswer, validateVoiceRequest, voicePrompt, voiceSchema, VOICE_SYSTEM } from '../_shared/voiceCommand.ts'

const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 400)

  const parsed = validateVoiceRequest(await readJson(req))
  if (!parsed.ok) return json({ error: parsed.error }, 400)
  const body = parsed.value

  const caller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: owns, error: authError } = await caller.rpc('owns_league', { p_league_id: body.league_id })
  if (authError || owns !== true) return json({ error: 'forbidden' }, 403)

  const response = await client.messages.create({
    model: 'claude-haiku-5-5',
    max_tokens: 1024,
    // A short, simple extraction: low effort keeps the referee's wait to about a second
    output_config: { effort: 'low', format: { type: 'json_schema', schema: voiceSchema(body.players) } },
    system: VOICE_SYSTEM,
    messages: [{ role: 'user', content: voicePrompt(body) }],
  })
  if (response.stop_reason !== 'end_turn') return json({ command: readVoiceAnswer(null, body.players) })

  const text = response.content.find((b) => b.type === 'text')
  let answer: unknown = null
  try {
    answer = text && text.type === 'text' ? JSON.parse(text.text) : null
  } catch {
    answer = null
  }
  return json({ command: readVoiceAnswer(answer, body.players) })
}

Deno.serve(async (req) => {
  try {
    return await handle(req)
  } catch (e) {
    return json(internalError('voice-command', e), 500)
  }
})
