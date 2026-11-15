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
  // The recognizer's other guesses at the same words
  alternatives: string[]
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
// Enough for a whole team, when the referee names a colour instead of a player
const MAX_CANDIDATES = 12

export function validateVoiceRequest(body: unknown): Result<VoiceRequest> {
  const b = body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  if (!b) return { ok: false, error: 'invalid body' }
  if (typeof b.league_id !== 'string' || !UUID_RE.test(b.league_id)) return { ok: false, error: 'invalid league_id' }
  const text = typeof b.text === 'string' ? b.text.trim() : ''
  if (text.length < 1 || text.length > MAX_TEXT) return { ok: false, error: 'invalid text' }
  if (b.lang !== 'ar' && b.lang !== 'en') return { ok: false, error: 'invalid lang' }
  const alts = b.alternatives ?? []
  if (!Array.isArray(alts) || alts.length > 4 || !alts.every((a) => typeof a === 'string' && a.length <= MAX_TEXT)) {
    return { ok: false, error: 'invalid alternatives' }
  }
  const alternatives = alts.map((a: string) => a.trim()).filter((a: string) => a && a !== text)
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
  return { ok: true, value: { league_id: b.league_id, text, alternatives, lang: b.lang, players } }
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
The text comes from phone speech recognition on a noisy pitch, usually in Levantine (Jordanian/Palestinian/Syrian) Arabic, sometimes English or mixed. Expect misheard words, missing punctuation, any word order, and Arabic digits (٢ ٣).

Names: match each spoken name to the roster by sound. Allow Arabic/Latin spellings (Ahmad = أحمد = احمد), ة/ه, ى/ي, أ/إ/ا, nicknames and short forms (حمودة = محمد, أبو علي), and dropped or doubled letters. Strip attached prepositions first: لليث / لـليث / عليث / ع ليث / مِن ليث / من ليث / إله ليث all mean the name ليث.

Actions and how the referee says them:
- goal: هدف، جول، گول، سجل، جاب هدف، فات، دخلت، goal, scored.
- own_goal: هدف عكسي، عكسي، بمرماه، بحاله، بنفسه، ضد مرماه، own goal. player = who put it in their own net.
- yellow_card: صفرا، صفراء، أصفر، كرت أصفر، إنذار، yellow. A card with no colour ("كرت ليث") is yellow_card.
- red_card: حمرا، حمراء، أحمر، كرت أحمر، طرد، red. suspension_minutes: 2 for دقيقتين/٢/two, 3 for تلات/ثلاث/٣/three, else null.
- interception: قطع، قطعها، قطع كرة، دفاع، افتك، سرق الكرة، خلّص، استخلص، تدخل، صدّ، interception, tackle, block.
- swap: بدّل، تبديل، غيّر، مكان، فوّت/طلّع، swap, switch, sub. player and other_player are the two players.
- pause: وقّف، وقف، ستوب، إيقاف، استنى، pause, stop. resume: كمّل، كمل، ابدأ، شغّل، يلا، استأنف، resume, start, play.
- undo: تراجع، الغي، إلغاء، امسح، شيل آخر، غلط، undo, cancel.
- unknown: anything else, or when no action word can be found.

Who is who in a goal (the most common mistake):
- The FIRST player named is the scorer, even when a preposition is attached: "هدف من ليث" and "هدف لليث" both mean ليث scored.
- other_player (the assister) is set only when a SECOND player is named, or a player follows an assist word: أسيست، تمريرة، بتمريرة من، صناعة، صنعها، مرّر، باص، عطاه، assist, pass, from (after the scorer).
- When the assist word comes first ("تمريرة خالد هدف ليث", "خالد مرر لليث وسجل"), the assister is the one with the assist word and the scorer is the other.

Examples (by name here; your answer uses the roster keys):
"هدف ليث" → goal, player ليث, other null
"هدف من ليث" → goal, player ليث, other null
"جول لليث" → goal, player ليث, other null
"ليث سجل" → goal, player ليث, other null
"هدف ليث من خالد" → goal, player ليث, other خالد
"هدف من ليث بتمريرة من خالد" → goal, player ليث, other خالد
"هدف ليث أسيست خالد" → goal, player ليث, other خالد
"خالد مرر لليث وسجل" → goal, player ليث, other خالد
"goal Laith assist Khaled" → goal, player ليث, other خالد
"هدف عكسي من سامي" → own_goal, player سامي
"سامي سجل بمرماه" → own_goal, player سامي
"صفرا لمحمد" → yellow_card, player محمد
"محمد أخد إنذار" → yellow_card, player محمد
"كرت لسامي" → yellow_card, player سامي
"حمرا خالد دقيقتين" → red_card, player خالد, suspension_minutes 2
"طرد سامي ٣ دقايق" → red_card, player سامي, suspension_minutes 3
"قطع ليث" → interception, player ليث
"ليث قطع الكرة" → interception, player ليث
"دفاع من خالد" → interception, player خالد
"بدّل ليث مع خالد" → swap, player ليث, other خالد
"وقّف" → pause; "كمّل" → resume; "الغي آخر واحد" → undo

Rules:
- Only use roster keys. Goals, own goals, cards and interceptions are for players marked playing; only swap may use players marked waiting.
- If a name fits one player clearly, put that key in player and leave candidates empty.
- If it could be several players (similar names, or a team colour instead of a name: "هدف للأزرق"), set player to null and list the possible players in candidates.
- If no name was said or it fits nobody, set player to null and candidates empty.
- Fields that do not apply to the action are null.`

export function voicePrompt(req: VoiceRequest): string {
  const roster = req.players
    .map((p, i) => `${playerKey(i)}: ${p.name} (${p.team}${p.playing ? '' : ', waiting'})`)
    .join('\n')
  const others = req.alternatives.length > 0
    ? `\n\nThe recognizer's other guesses at the same words (may spell a name better):\n${req.alternatives.map((a) => `"${a}"`).join('\n')}`
    : ''
  return `Roster:\n${roster || '(none)'}\n\nReferee said (${req.lang === 'ar' ? 'Arabic' : 'English'} recognition):\n"${req.text}"${others}`
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
  let playerId = pick(r.player)
  let otherId = action === 'goal' || swap ? pick(r.other_player) : null
  if (otherId === playerId) otherId = null
  // Cards and interceptions have one player, so a name Claude put in the wrong field is still theirs.
  // A goal keeps its assist: "هدف … أسيست خالد" with the scorer misheard must not credit خالد with the
  // goal. The referee picks the scorer, with one tap if خالد did score after all.
  if (!playerId && action !== 'goal' && !swap) playerId = pick(r.other_player)
  const candidates = playerId ? [] : [...new Set(
    (Array.isArray(r.candidates) ? r.candidates : []).map(pick).filter((id): id is string => !!id),
  )].filter((id) => id !== otherId).slice(0, MAX_CANDIDATES)
  const mins = r.suspension_minutes
  const suspensionMinutes = action === 'red_card' && (mins === 2 || mins === 3) ? mins : null
  return { action, playerId, otherId, suspensionMinutes, candidates }
}
