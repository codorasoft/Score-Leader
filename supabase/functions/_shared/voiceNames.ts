// Roster hints for misheard names. These suggest players to check; they never select a scorer.
interface NamedPlayer { id: string; name: string }
export interface VoiceNameHint {
  heard: string
  playerIds: string[]
  approximate: boolean
}

export function words(text: string): string[] {
  return text.normalize('NFKC').toLowerCase()
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .match(/\p{L}+/gu) ?? []
}

export function namePart(word: string): string {
  // Keep short names intact; do not strip arbitrary first letters from names such as علي or عجل.
  return word.replace(/^(?:بال|وال|فال|كال|لل|ال)(?=[\u0621-\u064a]{3,}$)/u, '')
}

// A word as said, then without a preposition joined to it: لليث (ل + ليث), للعجل, عليث. Only these
// short ones, and never down to fewer than two letters.
export function withoutJoinedPreposition(word: string): string[] {
  return [word, ...['ل', 'لل', 'ع'].filter((p) => word.startsWith(p) && word.length >= p.length + 2).map((p) => word.slice(p.length))]
}

// In particular, سجل must not suggest العجل merely because they differ by one letter.
const COMMAND_WORDS = new Set(words(`
  هدف اهداف جول گول سجل يسجل سجلت سجلها جاب فات دخلت عكسي بمرماه بحاله بنفسه ضد مرماه
  صفرا صفراء اصفر كرت انذار اخد حمرا حمراء احمر طرد دقيقتين دقايق دقيقه تلات ثلاث
  قطع قطعها كره الكره دفاع افتك سرق خلص استخلص تدخل صد
  بدل تبديل غير مكان فوت طلع مع وقف ستوب ايقاف استني كمل ابدا شغل يلا استانف
  تراجع الغي الغاء امسح شيل اخر غلط
  اسيست اسست تمريره بتمريره صناعه صنعها مرر باص عطاه من ل ع هو اللي
  ازرق اخضر اصفر احمر ابيض اسود برتقالي بنفسجي فريق الفريق
  لا ولا او قصدي يعني بل لحظه مش no not or mean sorry
  goal goals scored score scoring own yellow red card assist assists pass passed from
  interception tackle block swap switch sub pause stop resume start play undo cancel
  two three minutes minute with for by the a an to and blue green white black orange purple
`).flatMap((word) => [word, namePart(word)]))

// An action, link or filler word, so not (part of) a player's name
export function isCommandWord(word: string): boolean {
  return COMMAND_WORDS.has(word) || COMMAND_WORDS.has(namePart(word))
}

function oneEditApart(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0, j = 0, edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++edits > 1) return false
    if (a.length >= b.length) i++
    if (b.length >= a.length) j++
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}

export function voiceNameHints(texts: readonly string[], players: readonly NamedPlayer[]): VoiceNameHint[] {
  const roster = players.map((p) => ({ id: p.id, parts: words(p.name).map(namePart) }))
  const hints: VoiceNameHint[] = []
  for (const heard of new Set(texts.flatMap(words))) {
    const part = namePart(heard)
    if (part.length < 2 || COMMAND_WORDS.has(heard) || COMMAND_WORDS.has(part)) continue
    const exact = roster.filter((p) => p.parts.includes(part))
    const close = exact.length ? exact : roster.filter((p) => p.parts.some((name) =>
      part.length >= 3 && name.length >= 3
      && /^[\u0621-\u064a]+$/u.test(part) && /^[\u0621-\u064a]+$/u.test(name)
      && oneEditApart(part, name)))
    if (close.length) hints.push({ heard, playerIds: close.map((p) => p.id), approximate: !exact.length })
  }
  return hints
}
