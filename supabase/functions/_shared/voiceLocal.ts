// The clearest commands, understood on the phone itself: no request to Claude and no wait for it.
// This reads the words only: hearing them is the browser's speech recognition, which usually needs a
// connection of its own (see speech.ts). Anything less than certain returns null and goes to Claude
// as before. Either way the app still decides whether it may be saved without Confirm.
import { hasCorrection, isAssistLink, isOneOf, type VoiceCommand, type VoicePlayer } from './voiceCommand.ts'
import { namePart, withoutJoinedPreposition, words } from './voiceNames.ts'

const phrases = (list: string) => new Set(list.split('\n').map((l) => words(l).join(' ')).filter(Boolean))

const PAUSE = phrases(`وقف
وقّف
ستوب
إيقاف
استنى
وقف الساعة
وقف اللعب
وقف الوقت
pause
stop`)

const RESUME = phrases(`كمل
كمّل
ابدأ
شغل
شغّل
استأنف
كمل اللعب
شغل الساعة
resume
start
play`)

const UNDO = phrases(`تراجع
الغي
إلغاء
امسح
undo`)

const GOAL = phrases(`هدف
جول
goal`)

// "العجل سجل جول": the scorer named first
const SCORED = phrases(`سجل
سجل هدف
سجل جول
جاب هدف
جاب جول
scored`)

// "قطع ليث", "قطع كرة للعجل"
const INTERCEPT_BEFORE = phrases(`قطع
قطع كره
قطع الكره
دفاع
interception
tackle`)

// "ليث قطع الكرة"
const INTERCEPT_AFTER = phrases(`قطع
قطعها
قطع كره
قطع الكره`)

// "صفرا ليث". A red card needs its minutes, and a colour on its own («أصفر») can be a team, so
// both go to Claude.
const YELLOW = phrases(`صفرا
صفراء
كرت اصفر
بطاقه صفرا
انذار
yellow card`)

// An own goal is never read as a goal
const OWN_GOAL = phrases(`عكسي
بمرماه
بحاله
بنفسه
ضد
own`)

// "هدف من ليث", "هدف لليث", "goal for Laith": the word before the name changes nothing
const LEADING = phrases(`من
ل
ع
for
by
to`)

const blank = { playerId: null, otherId: null, suspensionMinutes: null, candidates: [], otherCandidates: [] }

// One playing player whose full name, or one whole word of it, is exactly what was said
function onlyPlayer(spoken: string[], players: VoicePlayer[]): string | null {
  if (spoken.length === 0 || spoken.length > 3) return null
  const said = spoken.map(namePart).join(' ')
  const playing = players.filter((p) => p.playing).map((p) => ({ id: p.id, parts: words(p.name).map(namePart) }))
  const full = playing.filter((p) => p.parts.join(' ') === said)
  if (full.length === 1) return full[0].id
  if (full.length > 1 || spoken.length > 1) return null
  const part = playing.filter((p) => p.parts.includes(said))
  return part.length === 1 ? part[0].id : null
}

// The one player these words name, with or without a preposition before the name
function nameIn(spoken: string[], players: VoicePlayer[]): string | null {
  const rest = spoken.length > 1 && LEADING.has(spoken[0]) ? spoken.slice(1) : spoken
  if (rest.length === 0) return null
  // As said, or with a preposition joined to the name: لليث (ل + ليث), للعجل (ل + العجل), عليث
  for (const first of withoutJoinedPreposition(rest[0])) {
    const playerId = onlyPlayer([first, ...rest.slice(1)], players)
    if (playerId) return playerId
  }
  return null
}

// An action phrase of one or two words at the start (or the end), and one player in the rest
function phraseThenName(said: string[], list: Set<string>, players: VoicePlayer[], atEnd = false): string | null {
  for (const n of [2, 1]) {
    if (said.length <= n) continue
    const phrase = atEnd ? said.slice(-n) : said.slice(0, n)
    if (!list.has(phrase.join(' '))) continue
    const id = nameIn(atEnd ? said.slice(0, -n) : said.slice(n), players)
    if (id) return id
  }
  return null
}

function goal(said: string[], players: VoicePlayer[]): VoiceCommand | null {
  if (said.some((w) => isOneOf(OWN_GOAL, w))) return null
  const scorer = phraseThenName(said, SCORED, players, true)
  if (scorer) return { action: 'goal', ...blank, playerId: scorer }
  if (!GOAL.has(said[0])) return null
  const rest = said.slice(1)
  // "هدف ليث من زيد", "هدف ليث أسيست زيد": the first link after the scorer's name starts the
  // assister's. «من» straight after the goal word is the scorer's own. Passing verbs (باص، مرّر) are
  // left to Claude: the order around them varies.
  const at = rest.findIndex((w, i) => i > 0 && isAssistLink(w))
  if (at < 0) {
    const playerId = nameIn(rest, players)
    return playerId ? { action: 'goal', ...blank, playerId } : null
  }
  const playerId = nameIn(rest.slice(0, at), players)
  const otherId = nameIn(rest.slice(at + 1), players)
  // Both named outright, two players, one team: anything else is for Claude and the referee
  const teamOf = (id: string) => players.find((p) => p.id === id)?.team
  if (!playerId || !otherId || playerId === otherId || teamOf(playerId) !== teamOf(otherId)) return null
  return { action: 'goal', ...blank, playerId, otherId }
}

function understandOne(text: string, players: VoicePlayer[]): VoiceCommand | null {
  // A number («حمرا ليث ٢») is not a word here: Claude reads it
  if (/\p{N}/u.test(text) || hasCorrection(text)) return null
  const said = words(text)
  if (said.length === 0) return null
  const whole = said.join(' ')
  if (PAUSE.has(whole)) return { action: 'pause', ...blank }
  if (RESUME.has(whole)) return { action: 'resume', ...blank }
  if (UNDO.has(whole)) return { action: 'undo', ...blank }

  const goalCommand = goal(said, players)
  if (goalCommand) return goalCommand
  const intercepted = phraseThenName(said, INTERCEPT_BEFORE, players) ?? phraseThenName(said, INTERCEPT_AFTER, players, true)
  if (intercepted) return { action: 'interception', ...blank, playerId: intercepted }
  const booked = phraseThenName(said, YELLOW, players)
  if (booked) return { action: 'yellow_card', ...blank, playerId: booked }
  return null
}

const same = (a: VoiceCommand | null, b: VoiceCommand) =>
  !!a && a.action === b.action && a.playerId === b.playerId && a.otherId === b.otherId

// What was said, when it is certain: every guess the recognizer made must say the same thing
export function understandLocally(text: string, players: VoicePlayer[], alternatives: readonly string[] = []): VoiceCommand | null {
  const command = understandOne(text, players)
  if (!command) return null
  return alternatives.every((a) => same(understandOne(a, players), command)) ? command : null
}
