import { supabase } from './supabase'
import { VOICE_ACTIONS, type VoiceCommand, type VoicePlayer } from '../../supabase/functions/_shared/voiceCommand.ts'

export type { VoiceCommand, VoicePlayer }

export type VoiceResult = { ok: true; command: VoiceCommand } | { ok: false; error: 'network' | 'failed' }

// Asks the voice-command function what the referee meant. Nothing is saved.
export async function understandVoice(input: {
  leagueId: string
  text: string
  alternatives: string[]
  lang: 'ar' | 'en'
  players: VoicePlayer[]
}): Promise<VoiceResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, error: 'network' }
  try {
    const { data, error } = await supabase.functions.invoke('voice-command', {
      body: { league_id: input.leagueId, text: input.text, alternatives: input.alternatives, lang: input.lang, players: input.players },
    })
    if (error) {
      const name = (error as { name?: string }).name
      return { ok: false, error: name === 'FunctionsFetchError' ? 'network' : 'failed' }
    }
    const raw = (data as { command?: VoiceCommand } | null)?.command
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'failed' }
    return { ok: true, command: sanitize(raw, input.players) }
  } catch {
    return { ok: false, error: 'network' }
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
