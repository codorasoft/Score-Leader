// A referee's spoken command, turned into one match action. Shared by the voice-command function
// (which asks Claude) and the app (which shows the action to confirm before saving it).

export const VOICE_ACTIONS = [
  'goal', 'own_goal', 'yellow_card', 'red_card', 'interception', 'swap', 'pause', 'resume', 'undo', 'unknown',
] as const
export type VoiceAction = (typeof VOICE_ACTIONS)[number]

export interface VoicePlayer {
  id: string
  name: string
  // Team colour, as the referee would say it ("blue", "green"...)
  team: string
  // On the pitch in this match. Players of waiting teams can only be part of a swap.
  playing: boolean
}

export interface VoiceRequest {
  league_id: string
  text: string
  lang: 'ar' | 'en'
  players: VoicePlayer[]
}

export interface VoiceCommand {
  action: VoiceAction
  playerId: string | null
  // Goal: who assisted. Swap: the player swapped with.
  otherId: string | null
  suspensionMinutes: 2 | 3 | null
  // Players the name could be, when Claude could not tell which one was meant
  candidates: string[]
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_TEXT = 300
const MAX_PLAYERS = 80

export function validateVoiceRequest(body: unknown): Result<VoiceRequest> {
  const b = body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  if (!b) return { ok: false, error: 'invalid body' }
  if (typeof b.league_id !== 'string' || !UUID_RE.test(b.league_id)) return { ok: false, error: 'invalid league_id' }
  const text = typeof b.text === 'string' ? b.text.trim() : ''
  if (text.length < 1 || text.length > MAX_TEXT) return { ok: false, error: 'invalid text' }
  if (b.lang !== 'ar' && b.lang !== 'en') return { ok: false, error: 'invalid lang' }
  if (!Array.isArray(b.players) || b.players.length > MAX_PLAYERS) return { ok: false, error: 'invalid players' }
  const players: VoicePlayer[] = []
  const seen = new Set<string>()
  for (const p of b.players) {
    const r = p !== null && typeof p === 'object' ? (p as Record<string, unknown>) : null
    if (
      !r || typeof r.id !== 'string' || r.id.length < 1 || r.id.length > 64 || seen.has(r.id)
      || typeof r.name !== 'string' || r.name.trim().length < 1 || r.name.length > 80
      || typeof r.team !== 'string' || r.team.length > 20 || typeof r.playing !== 'boolean'
    ) return { ok: false, error: 'invalid players' }
    seen.add(r.id)
    players.push({ id: r.id, name: r.name.trim(), team: r.team, playing: r.playing })
  }
  return { ok: true, value: { league_id: b.league_id, text, lang: b.lang, players } }
}

// Claude sees short keys (p1, p2...) instead of ids: shorter, and the schema can list them, so an
// answer can only name a player who is in the match.
export const playerKey = (index: number) => `p${index + 1}`

const nullableKey = (keys: string[]) =>
  keys.length > 0 ? { anyOf: [{ type: 'string', enum: keys }, { type: 'null' }] } : { type: 'null' }

export function voiceSchema(players: VoicePlayer[]) {
  const keys = players.map((_, i) => playerKey(i))
  return {
    type: 'object',
    additionalProperties: false,
    required: ['action', 'player', 'other_player', 'suspension_minutes', 'candidates'],
    properties: {
      action: { type: 'string', enum: [...VOICE_ACTIONS] },
      player: nullableKey(keys),
      other_player: nullableKey(keys),
      suspension_minutes: { anyOf: [{ type: 'integer', enum: [2, 3] }, { type: 'null' }] },
      candidates: { type: 'array', items: keys.length > 0 ? { type: 'string', enum: keys } : { type: 'string' } },
    },
  }
}

export const VOICE_SYSTEM = `You turn a football referee's short spoken command into one match action.
The text comes from phone speech recognition on a noisy pitch, usually in Levantine Arabic, sometimes English or mixed. Names are often misheard or misspelled: match them to the roster by sound, allowing Arabic/Latin spellings (Ahmad = أحمد), nicknames and dropped letters.

Actions:
- goal: a player scored. "هدف/جول/سجل/goal/scored". The assister ("من/أسيست/تمريرة/صناعة/assist/from") goes in other_player, or null.
- own_goal: a player scored in their own net. "عكسي/بنفسه/بمرماه/own goal". The player who did it goes in player.
- yellow_card: "صفرا/أصفر/إنذار/yellow". red_card: "حمرا/أحمر/طرد/red"; suspension_minutes is 2 or 3 if said ("دقيقتين"=2, "تلت/ثلاث دقايق"=3), else null.
- interception: a player won the ball back. "قطع/قطعها/دفاع/افتك/interception/tackle".
- swap: two players change places. "بدّل/تبديل/swap/switch" with both players; second one in other_player. Only swap may use players marked waiting.
- pause: stop the clock ("وقف/وقّف/استوب/pause"). resume: restart it ("كمل/كمّل/ابدأ/شغل/resume/start").
- undo: cancel the last event ("تراجع/الغي/امسح/undo/cancel").
- unknown: anything else, or no action is clear.

Rules:
- Only use roster keys. Goals, own goals, cards and interceptions are for players marked playing.
- If a name fits one player clearly, put that key in player and leave candidates empty.
- If it could be several players, set player to null and list them (at most 4) in candidates.
- If the name was not said or fits nobody, set player to null and candidates empty.
- Fields that do not apply to the action are null.`

export function voicePrompt(req: VoiceRequest): string {
  const roster = req.players
    .map((p, i) => `${playerKey(i)}: ${p.name} (${p.team}${p.playing ? '' : ', waiting'})`)
    .join('\n')
  return `Roster:\n${roster || '(none)'}\n\nReferee said (${req.lang === 'ar' ? 'Arabic' : 'English'} recognition):\n"${req.text}"`
}

// Claude's answer back to ids, dropping anything that breaks the rules above.
export function readVoiceAnswer(raw: unknown, players: VoicePlayer[]): VoiceCommand {
  const unknown: VoiceCommand = { action: 'unknown', playerId: null, otherId: null, suspensionMinutes: null, candidates: [] }
  const r = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  if (!r || !(VOICE_ACTIONS as readonly unknown[]).includes(r.action)) return unknown
  const action = r.action as VoiceAction
  const byKey = new Map(players.map((p, i) => [playerKey(i), p]))
  const swap = action === 'swap'
  const pick = (v: unknown) => {
    const p = typeof v === 'string' ? byKey.get(v) : undefined
    return p && (p.playing || swap) ? p.id : null
  }

  if (action === 'pause' || action === 'resume' || action === 'undo' || action === 'unknown') {
    return { ...unknown, action }
  }
  const playerId = pick(r.player)
  let otherId = action === 'goal' || swap ? pick(r.other_player) : null
  if (otherId === playerId) otherId = null
  const candidates = playerId ? [] : [...new Set(
    (Array.isArray(r.candidates) ? r.candidates : []).map(pick).filter((id): id is string => !!id),
  )].slice(0, 4)
  const mins = r.suspension_minutes
  const suspensionMinutes = action === 'red_card' && (mins === 2 || mins === 3) ? mins : null
  return { action, playerId, otherId, suspensionMinutes, candidates }
}
