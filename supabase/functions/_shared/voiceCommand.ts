// A referee's spoken command, turned into one match action. Shared by the voice-command function
// (which asks Claude) and the app (which shows the action to confirm before saving it).
import { namePart, voiceNameHints, words } from './voiceNames.ts'

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
  // The same for the second player (goal: the assister, swap: the player swapped with)
  otherCandidates: string[]
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_TEXT = 300
const MAX_PLAYERS = 80
// Enough for a whole team, when the referee names a colour instead of a player
const MAX_CANDIDATES = 12

// Words that say "the assister comes next": «هدف … أسيست دجل», «بتمريرة خالد». Verbs such as مرّر are
// left out, since «خالد مرّر للعجل وسجّل» names the assister first.
const ASSIST_MARKERS = new Set(words('اسيست اسست اسيس assist assists تمريره بتمريره صناعه بصناعه'))

// Any word that says an assist was given, wherever the assister is named. Used only to hold back a
// goal that would otherwise be saved without its assist, so it errs towards asking.
const ASSIST_WORDS = new Set([...ASSIST_MARKERS, ...words('مرر مررها مررله باص باصها pass passed صنع صنعه صنعها')])

// A word from the list, also when "and" or "then" is joined to it: «وأسيست», «وباص», «فمرّرها»,
// «والأسيست». The letter is dropped only to compare with the list, so names such as وليد or فارس
// are never cut.
function isOneOf(list: Set<string>, word: string): boolean {
  const bare = word.replace(/^[وف](?=\p{L}{2,}$)/u, '')
  return [word, namePart(word), bare, namePart(bare)].some((w) => list.has(w))
}

// The referee spoke of an assist: «هدف ليث أسيست دجل», «هدف ليث وباص دجل», «خالد مرّر للعجل وسجّل»
export function mentionsAssist(text: string): boolean {
  return words(text).some((w) => isOneOf(ASSIST_WORDS, w))
}

// A heard sentence cut at its assist word: the scorer's part, and the assister's
function splitAtAssist(text: string): [string, string] {
  const said = words(text)
  const at = said.findIndex((w) => isOneOf(ASSIST_MARKERS, w))
  return at < 0 ? [said.join(' '), ''] : [said.slice(0, at).join(' '), said.slice(at + 1).join(' ')]
}

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
    required: ['action', 'player', 'other_player', 'suspension_minutes', 'candidates', 'other_candidates'],
    properties: {
      action: { type: 'string', enum: [...VOICE_ACTIONS] },
      player: nullableKey(keys),
      other_player: nullableKey(keys),
      suspension_minutes: { anyOf: [{ type: 'integer', enum: [2, 3] }, { type: 'null' }] },
      candidates: { type: 'array', items: keys.length > 0 ? { type: 'string', enum: keys } : { type: 'string' } },
      other_candidates: { type: 'array', items: keys.length > 0 ? { type: 'string', enum: keys } : { type: 'string' } },
    },
  }
}

export const VOICE_SYSTEM = `You turn a football referee's short spoken command into one match action.
The text comes from phone speech recognition on a noisy pitch, usually in Levantine (Jordanian/Palestinian/Syrian) Arabic, sometimes English or mixed. Expect misheard words, missing punctuation, any word order, and Arabic digits (٢ ٣).

Names: match each spoken name to the roster by sound. Allow Arabic/Latin spellings (Ahmad = أحمد = احمد), ة/ه, ى/ي, أ/إ/ا, nicknames and short forms (حمودة = محمد, أبو علي), and dropped or doubled letters. Strip attached prepositions first: لليث / لـليث / عليث / ع ليث / مِن ليث / من ليث / إله ليث all mean the name ليث.
Match ANY part of a full name, not just the first word: "العجل" can mean "محمد العجل", and "يوسف" can mean "أحمد يوسف الحسن". A family name may be spoken without ال. Keep multiword names together; two words of one roster name are not two different players.
Name-part hints may be supplied for recognition mistakes, e.g. "دجل سجل جول" may refer to "محمد العجل". These are suggestions, not facts or action words. If only an approximate hint supports the main player, leave player null and put the possible players in candidates for the referee to choose. Preserve ambiguity when several players share the spoken part. Use the sentence to distinguish scorer from assister; never turn a clear assister into an unknown scorer.

A team colour said with a name picks that team's player: "محمد الأزرق", "محمد تبع الأخضر", "Mohammad blue". An exact full-name or whole-word match beats a partial or sound-alike one: with "محمد العجل" and "محمد سالم", "العجل" means محمد العجل. When two players fit equally well, never choose: list them.

Corrections: the referee may correct himself mid-sentence. Only the FINAL version counts. Correction words: مش، مو، لا، لأ، قصدي، يعني، بل، لحظة، غلط (inside a sentence), no, not, I mean, sorry. Apply them to the action and to names:
"مش هدف، قطع كرة للعجل" → interception, player العجل
"هدف محمد… قصدي خالد" → goal, player خالد
"صفرا… لا حمرا لسامي" → red_card, player سامي
"هدف ليث، لا لا، هدف خالد من ليث" → goal, player خالد, other ليث
A lone "غلط" or "الغي" with no new action is undo.

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

Each player is matched on their own. When one role is clear and the other is not, fill the clear one and list the possible players for the unclear one: candidates for player, other_candidates for other_player. Never move a player from one role to the other to fill a gap.

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
"بدّل ليث مع محمد" (two محمد on other teams) → swap, player ليث, other null, other_candidates both محمد
"هدف ليث من محمد" (two محمد) → goal, player ليث, other null, other_candidates both محمد
"وقّف" → pause; "كمّل" → resume; "الغي آخر واحد" → undo

Rules:
- Only use roster keys. Goals, own goals, cards and interceptions are for players marked playing; only swap may use players marked waiting.
- If a name fits one player clearly, put that key in player and leave candidates empty.
- If it could be several players (similar names, or a team colour instead of a name: "هدف للأزرق"), set player to null and list the possible players in candidates.
- If no name was said or it fits nobody, set player to null and candidates empty.
- A swap is between two different teams: never pair two players of the same team.
- other_candidates is only for goal and swap, and only when other_player is null; otherwise it is empty.
- Fields that do not apply to the action are null (lists empty).`

export function voicePrompt(req: VoiceRequest): string {
  const roster = req.players
    .map((p, i) => `${playerKey(i)}: ${p.name} (${p.team}${p.playing ? '' : ', waiting'})`)
    .join('\n')
  const others = req.alternatives.length > 0
    ? `\n\nThe recognizer's other guesses at the same words (may spell a name better):\n${req.alternatives.map((a) => `"${a}"`).join('\n')}`
    : ''
  const keys = new Map(req.players.map((p, i) => [p.id, playerKey(i)]))
  const hints = voiceNameHints([req.text, ...req.alternatives], req.players)
    .map((h) => `"${h.heard}" -> ${h.playerIds.map((id) => keys.get(id)).join(', ')} (${h.approximate ? 'similar spelling only; ask the referee' : 'matching name part'})`)
  const names = hints.length ? `\n\nPossible name parts (do not change player roles):\n${hints.join('\n')}` : ''
  return `Roster:\n${roster || '(none)'}\n\nReferee said (${req.lang === 'ar' ? 'Arabic' : 'English'} recognition):\n"${req.text}"${others}${names}`
}

// Claude's answer back to ids, dropping anything that breaks the rules above.
export function readVoiceAnswer(raw: unknown, players: VoicePlayer[], heard?: Pick<VoiceRequest, 'text' | 'alternatives'>): VoiceCommand {
  const unknown: VoiceCommand = { action: 'unknown', playerId: null, otherId: null, suspensionMinutes: null, candidates: [], otherCandidates: [] }
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
  // A swap is between two teams: a same-team pair keeps its first player and asks for the second
  const teamOfId = (id: string | null) => players.find((p) => p.id === id)?.team
  if (swap && playerId && otherId && teamOfId(playerId) === teamOfId(otherId)) otherId = null
  let otherCandidates = (action === 'goal' || swap) && !otherId ? [...new Set(
    (Array.isArray(r.other_candidates) ? r.other_candidates : []).map(pick).filter((id): id is string => !!id),
  )].filter((id) => id !== playerId && !(swap && playerId && teamOfId(id) === teamOfId(playerId))).slice(0, MAX_CANDIDATES) : []
  // A player offered only as the assister is never offered as the scorer: the referee would see the
  // assister in the scorer's place
  let candidates = playerId ? [] : [...new Set(
    (Array.isArray(r.candidates) ? r.candidates : []).map(pick).filter((id): id is string => !!id),
  )].filter((id) => id !== otherId && !otherCandidates.includes(id)).slice(0, MAX_CANDIDATES)
  // Roster suggestions for a name Claude missed. In a goal, a name after the assist word suggests the
  // assister, and one before it the scorer. A heard word that also fits a player already in the other
  // role is dropped whole: with خالد الحسن as the assister, «الحسن» must not offer عمر الحسن as the
  // scorer (nor the scorer's relative as the assister).
  if (heard && !swap) {
    const parts = [heard.text, ...heard.alternatives]
      .map((t): [string, string] => (action === 'goal' ? splitAtAssist(t) : [t, '']))
    const roleHints = (said: string[], not: (string | null)[]) => {
      const ids = [...new Set(voiceNameHints(said.filter(Boolean), players)
        .filter((h) => !h.playerIds.some((id) => not.includes(id)))
        .flatMap((h) => h.playerIds))]
        .filter((id) => players.some((p) => p.id === id && p.playing))
      // An overly broad hint is no better than the usual full player picker.
      return ids.length <= MAX_CANDIDATES ? ids : []
    }
    // «هدف ليث أسيست دجل» with the assister missed: offer him, even when the scorer is known
    if (action === 'goal' && !otherId && !otherCandidates.length) {
      otherCandidates = roleHints(parts.map(([, assistPart]) => assistPart), [playerId])
    }
    if (!playerId && !candidates.length) {
      candidates = roleHints(parts.map(([scorerPart]) => scorerPart), [otherId, ...otherCandidates])
    }
  }
  const mins = r.suspension_minutes
  const suspensionMinutes = action === 'red_card' && (mins === 2 || mins === 3) ? mins : null
  return { action, playerId, otherId, suspensionMinutes, candidates, otherCandidates }
}
