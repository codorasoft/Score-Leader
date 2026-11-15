// The clearest commands, understood on the phone itself: no wait for Claude, and they work without
// a connection. Anything less than certain returns null and goes to Claude as before. Either way
// the referee still confirms before anything is saved.
import type { VoiceCommand, VoicePlayer } from './voiceCommand.ts'
import { namePart, words } from './voiceNames.ts'

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

// "هدف من ليث", "هدف لليث", "goal for Laith": the word before the name changes nothing
const LEADING = phrases(`من
ل
ع
for
by`)

// Anything that hints at a correction, a second player or a different action leaves it to Claude
const NOT_SIMPLE = phrases(`مش
مو
لا
قصدي
يعني
بل
لحظة
غلط
no
not
mean
sorry`)

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

export function understandLocally(text: string, players: VoicePlayer[]): VoiceCommand | null {
  const said = words(text)
  if (said.length === 0 || said.some((w) => NOT_SIMPLE.has(w))) return null
  const whole = said.join(' ')
  if (PAUSE.has(whole)) return { action: 'pause', ...blank }
  if (RESUME.has(whole)) return { action: 'resume', ...blank }
  if (UNDO.has(whole)) return { action: 'undo', ...blank }

  if (!GOAL.has(said[0])) return null
  let rest = said.slice(1)
  if (rest.length > 1 && LEADING.has(rest[0])) rest = rest.slice(1)
  let playerId = onlyPlayer(rest, players)
  // A preposition joined to the name: لليث (ل + ليث), للعجل (ل + العجل), عليث
  for (const prefix of ['ل', 'لل', 'ع']) {
    if (playerId || rest.length === 0 || !rest[0].startsWith(prefix) || rest[0].length < prefix.length + 2) continue
    playerId = onlyPlayer([rest[0].slice(prefix.length), ...rest.slice(1)], players)
  }
  return playerId ? { action: 'goal', ...blank, playerId } : null
}
