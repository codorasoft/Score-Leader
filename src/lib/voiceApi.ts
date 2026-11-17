import { supabase } from './supabase'
import { VOICE_ACTIONS, type VoiceCommand, type VoicePlayer } from '../../supabase/functions/_shared/voiceCommand.ts'

export type { VoiceCommand, VoicePlayer }

// How long Claude has to answer before the referee is told to use the buttons
const UNDERSTAND_MS = 15_000

// 'timeout': no answer in time; 'cancelled': the sheet was closed or the referee tried again
export type VoiceFailure = 'network' | 'failed' | 'timeout' | 'cancelled'
export type VoiceResult =
  | { ok: true; command: VoiceCommand; modelMs: number | null }
  | { ok: false; error: VoiceFailure }

// Asks the voice-command function what the referee meant. Nothing is saved. `signal` cancels the
// request itself: the connection is closed, and an answer that still arrives is dropped.
export async function understandVoice(input: {
  leagueId: string
  text: string
  alternatives: string[]
  lang: 'ar' | 'en'
  players: VoicePlayer[]
}, { signal }: { signal?: AbortSignal } = {}): Promise<VoiceResult> {
  if (signal?.aborted) return { ok: false, error: 'cancelled' }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, error: 'network' }

  // One cancel for both ways out: the sheet closing, and the time running out
  const request = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; request.abort() }, UNDERSTAND_MS)
  const cancel = () => request.abort()
  signal?.addEventListener('abort', cancel)
  // The SDK waits for the sign-in token before it calls fetch, and that wait cannot be cancelled:
  // the referee stops waiting at once all the same, and fetch, once called, is cancelled too
  const stopped = new Promise<'stopped'>((resolve) => request.signal.addEventListener('abort', () => resolve('stopped')))
  try {
    const res = await Promise.race([
      supabase.functions.invoke('voice-command', {
        body: { league_id: input.leagueId, text: input.text, alternatives: input.alternatives, lang: input.lang, players: input.players },
        signal: request.signal,
      }),
      stopped,
    ])
    if (res === 'stopped' || request.signal.aborted) return { ok: false, error: timedOut ? 'timeout' : 'cancelled' }
    const { data, error } = res
    if (error) {
      const { name, context } = error as { name?: string; context?: { status?: number } }
      if (name === 'FunctionsFetchError') return { ok: false, error: 'network' }
      // The function gave up on Claude in time (504), before the app's own limit
      return { ok: false, error: name === 'FunctionsHttpError' && context?.status === 504 ? 'timeout' : 'failed' }
    }
    const body = data as { command?: VoiceCommand; model_ms?: unknown } | null
    const raw = body?.command
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'failed' }
    const modelMs = typeof body?.model_ms === 'number' ? body.model_ms : null
    return { ok: true, command: sanitize(raw, input.players), modelMs }
  } catch {
    return { ok: false, error: 'network' }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
  }
}

// The answer only names players that were sent; anything else is dropped
function sanitize(c: VoiceCommand, players: VoicePlayer[]): VoiceCommand {
  const ids = new Set(players.map((p) => p.id))
  const keep = (id: unknown) => (typeof id === 'string' && ids.has(id) ? id : null)
  return {
    action: (VOICE_ACTIONS as readonly unknown[]).includes(c.action) ? c.action : 'unknown',
    playerId: keep(c.playerId),
    otherId: keep(c.otherId),
    suspensionMinutes: c.suspensionMinutes === 2 || c.suspensionMinutes === 3 ? c.suspensionMinutes : null,
    candidates: Array.isArray(c.candidates) ? c.candidates.map(keep).filter((id): id is string => !!id) : [],
    otherCandidates: Array.isArray(c.otherCandidates) ? c.otherCandidates.map(keep).filter((id): id is string => !!id) : [],
  }
}
