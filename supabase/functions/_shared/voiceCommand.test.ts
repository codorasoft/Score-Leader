import { hasCorrection, mentionsAssist, readVoiceAnswer, validateVoiceRequest, voicePrompt, voiceSchema, type VoicePlayer } from './voiceCommand'

const LEAGUE = '11111111-2222-3333-4444-555555555555'
const roster: VoicePlayer[] = [
  { id: 'a', name: 'أحمد', team: 'green', playing: true },
  { id: 'b', name: 'خالد', team: 'green', playing: true },
  { id: 'c', name: 'Sami', team: 'blue', playing: true },
  { id: 'd', name: 'محمد', team: 'yellow', playing: false },
]

describe('validateVoiceRequest', () => {
  const ok = { league_id: LEAGUE, text: ' هدف أحمد ', lang: 'ar', players: roster }

  it('accepts a request and trims the text', () => {
    const r = validateVoiceRequest(ok)
    expect(r.ok && r.value.text).toBe('هدف أحمد')
    expect(r.ok && r.value.alternatives).toEqual([])
  })

  it('keeps the other guesses, without blanks or the main text', () => {
    const r = validateVoiceRequest({ ...ok, alternatives: ['هدف احمد ', '', 'هدف أحمد'] })
    expect(r.ok && r.value.alternatives).toEqual(['هدف احمد'])
    expect(validateVoiceRequest({ ...ok, alternatives: ['a', 'b', 'c', 'd', 'e'] }).ok).toBe(false)
    expect(validateVoiceRequest({ ...ok, alternatives: [3] }).ok).toBe(false)
  })

  it('refuses bad input', () => {
    expect(validateVoiceRequest(null).ok).toBe(false)
    expect(validateVoiceRequest({ ...ok, league_id: 'x' }).ok).toBe(false)
    expect(validateVoiceRequest({ ...ok, text: '   ' }).ok).toBe(false)
    expect(validateVoiceRequest({ ...ok, text: 'x'.repeat(301) }).ok).toBe(false)
    expect(validateVoiceRequest({ ...ok, lang: 'fr' }).ok).toBe(false)
    expect(validateVoiceRequest({ ...ok, players: [roster[0], roster[0]] }).ok).toBe(false)
    expect(validateVoiceRequest({ ...ok, players: [{ id: 'a', name: '', team: 'green', playing: true }] }).ok).toBe(false)
  })
})

describe('voiceSchema and voicePrompt', () => {
  it('lists only roster keys', () => {
    const s = voiceSchema(roster)
    expect(s.properties.player).toEqual({ anyOf: [{ type: 'string', enum: ['p1', 'p2', 'p3', 'p4'] }, { type: 'null' }] })
  })

  it('still builds with nobody on the roster', () => {
    expect(voiceSchema([]).properties.player).toEqual({ type: 'null' })
  })

  it('marks waiting players in the roster', () => {
    const prompt = voicePrompt({ league_id: LEAGUE, text: 'goal Sami', alternatives: ['goal Sammy'], lang: 'en', players: roster })
    expect(prompt).toContain('p3: Sami (blue)')
    expect(prompt).toContain('p4: محمد (yellow, waiting)')
    expect(prompt).toContain('"goal Sami"')
    expect(prompt).toContain("other guesses at the same words (may spell a name better):\n\"goal Sammy\"")
  })

  it('gives the interpreter roster hints for a misheard family name without rewriting the transcript', () => {
    const prompt = voicePrompt({
      league_id: LEAGUE, text: 'دجل سجل جول', alternatives: [], lang: 'ar',
      players: [{ id: 'a', name: 'محمد العجل', team: 'green', playing: true }],
    })
    expect(prompt).toContain('"دجل سجل جول"')
    expect(prompt).toContain('"دجل" -> p1 (similar spelling only; ask the referee)')
    expect(prompt).not.toContain('"سجل" ->')
    expect(prompt).not.toContain('"جول" ->')
  })
})

describe('readVoiceAnswer', () => {
  const answer = (extra: Record<string, unknown>) => ({
    action: 'goal', player: null, other_player: null, suspension_minutes: null, candidates: [], ...extra,
  })

  it('maps keys back to player ids', () => {
    expect(readVoiceAnswer(answer({ player: 'p1', other_player: 'p2' }), roster))
      .toEqual({ action: 'goal', playerId: 'a', otherId: 'b', suspensionMinutes: null, candidates: [], otherCandidates: [] })
  })

  it('drops a waiting player from anything but a swap', () => {
    expect(readVoiceAnswer(answer({ player: 'p4' }), roster).playerId).toBeNull()
    expect(readVoiceAnswer(answer({ action: 'swap', player: 'p1', other_player: 'p4' }), roster))
      .toMatchObject({ playerId: 'a', otherId: 'd' })
  })

  it('keeps the assister only on a goal, and never the scorer twice', () => {
    expect(readVoiceAnswer(answer({ action: 'interception', player: 'p3', other_player: 'p1' }), roster).otherId).toBeNull()
    expect(readVoiceAnswer(answer({ player: 'p1', other_player: 'p1' }), roster).otherId).toBeNull()
  })

  it('never turns an assister into the scorer', () => {
    // "هدف … أسيست خالد" with the scorer misheard: خالد stays the assister and the scorer is asked
    expect(readVoiceAnswer(answer({ player: null, other_player: 'p2' }), roster))
      .toEqual({ action: 'goal', playerId: null, otherId: 'b', suspensionMinutes: null, candidates: [], otherCandidates: [] })
  })

  it('a one-player action takes its player from either field', () => {
    expect(readVoiceAnswer(answer({ action: 'yellow_card', player: null, other_player: 'p3' }), roster).playerId).toBe('c')
  })

  it('keeps suspension minutes only on a red card', () => {
    expect(readVoiceAnswer(answer({ action: 'red_card', player: 'p1', suspension_minutes: 3 }), roster).suspensionMinutes).toBe(3)
    expect(readVoiceAnswer(answer({ action: 'yellow_card', player: 'p1', suspension_minutes: 3 }), roster).suspensionMinutes).toBeNull()
  })

  it('keeps the assist and asks for the scorer when the scorer is only unsure', () => {
    // "هدف محمد أسيست خالد" with two players called محمد
    expect(readVoiceAnswer(answer({ player: null, other_player: 'p2', candidates: ['p1', 'p3', 'p2'] }), roster))
      .toEqual({ action: 'goal', playerId: null, otherId: 'b', suspensionMinutes: null, candidates: ['a', 'c'], otherCandidates: [] })
  })

  it('lists candidates only when no player was picked', () => {
    expect(readVoiceAnswer(answer({ candidates: ['p1', 'p2', 'p1', 'p4', 'zz'] }), roster).candidates).toEqual(['a', 'b'])
    expect(readVoiceAnswer(answer({ player: 'p3', candidates: ['p1'] }), roster).candidates).toEqual([])
  })

  it('clears player fields on clock and undo commands', () => {
    expect(readVoiceAnswer(answer({ action: 'pause', player: 'p1' }), roster))
      .toEqual({ action: 'pause', playerId: null, otherId: null, suspensionMinutes: null, candidates: [], otherCandidates: [] })
  })

  it('will not swap two players of the same team', () => {
    expect(readVoiceAnswer(answer({ action: 'swap', player: 'p1', other_player: 'p2' }), roster))
      .toMatchObject({ playerId: 'a', otherId: null })
  })

  it('lists the second player\'s candidates apart from the first player\'s', () => {
    // "هدف خالد أسيست …" with the assister unsure: the scorer is never among them
    expect(readVoiceAnswer(answer({ player: 'p2', other_candidates: ['p1', 'p2', 'p3', 'zz'] }), roster).otherCandidates)
      .toEqual(['a', 'c'])
    // A swap's second player comes from another team
    expect(readVoiceAnswer(answer({ action: 'swap', player: 'p1', other_candidates: ['p2', 'p3', 'p4'] }), roster).otherCandidates)
      .toEqual(['c', 'd'])
    // Only for goals and swaps, and only while the second player is unknown
    expect(readVoiceAnswer(answer({ action: 'yellow_card', player: 'p1', other_candidates: ['p3'] }), roster).otherCandidates).toEqual([])
    expect(readVoiceAnswer(answer({ player: 'p1', other_player: 'p2', other_candidates: ['p3'] }), roster).otherCandidates).toEqual([])
  })

  it('reads anything unexpected as not understood', () => {
    expect(readVoiceAnswer(null, roster).action).toBe('unknown')
    expect(readVoiceAnswer({ action: 'dance' }, roster).action).toBe('unknown')
  })
})

describe('roster suggestions when the interpreter misses a name', () => {
  const players: VoicePlayer[] = [
    { id: 'a', name: 'محمد العجل', team: 'green', playing: true },
    { id: 'b', name: 'خالد الحسن', team: 'green', playing: true },
    { id: 'c', name: 'عمر الحسن', team: 'blue', playing: true },
    { id: 'd', name: 'أحمد الدجل', team: 'yellow', playing: false },
  ]
  const missing = { action: 'goal', player: null, other_player: null, suspension_minutes: null, candidates: [] }
  const heard = (text: string, alternatives: string[] = []) => ({ text, alternatives })

  it('suggests the misheard surname but leaves the scorer for the referee to choose', () => {
    expect(readVoiceAnswer(missing, players.slice(0, 3), heard('دجل سجل جول')))
      .toEqual({ action: 'goal', playerId: null, otherId: null, suspensionMinutes: null, candidates: ['a'], otherCandidates: [] })
  })

  it('keeps all players sharing the spoken surname', () => {
    expect(readVoiceAnswer(missing, players, heard('هدف الحسن')).candidates).toEqual(['b', 'c'])
  })

  it('can use another recognition guess', () => {
    expect(readVoiceAnswer(missing, players, heard('هدف ممم', ['العجل سجل جول'])).candidates).toEqual(['a'])
  })

  it('does not derive a player from the action words', () => {
    expect(readVoiceAnswer(missing, players, heard('سجل جول')).candidates).toEqual([])
  })

  it('preserves the known assist alongside a suggested scorer', () => {
    expect(readVoiceAnswer({ ...missing, other_player: 'p2' }, players.slice(0, 3), heard('دجل سجل جول اسيست خالد')))
      .toMatchObject({ playerId: null, otherId: 'b', candidates: ['a'] })
  })

  it('never guesses a scorer from the known assister or another player sharing that name', () => {
    expect(readVoiceAnswer({ ...missing, other_player: 'p2' }, players, heard('هدف اسيست الحسن')))
      .toMatchObject({ playerId: null, otherId: 'b', candidates: [] })
  })

  it('does not replace an interpreter-selected player or its existing ambiguity', () => {
    expect(readVoiceAnswer({ ...missing, player: 'p2' }, players, heard('العجل سجل جول')))
      .toMatchObject({ playerId: 'b', candidates: [] })
    expect(readVoiceAnswer({ ...missing, candidates: ['p2', 'p3'] }, players, heard('العجل سجل جول')).candidates)
      .toEqual(['b', 'c'])
  })

  it('does not suggest waiting players or infer players for clock, undo, unknown or swap actions', () => {
    expect(readVoiceAnswer(missing, players, heard('الدجل سجل جول')).candidates).toEqual([])
    for (const action of ['pause', 'resume', 'undo', 'unknown', 'swap']) {
      expect(readVoiceAnswer({ ...missing, action }, players, heard('العجل سجل جول')).candidates).toEqual([])
    }
  })
})

describe('a misheard name after the assist word', () => {
  const players: VoicePlayer[] = [
    { id: 'a', name: 'محمد العجل', team: 'green', playing: true },
    { id: 'b', name: 'ليث', team: 'blue', playing: true },
    { id: 'c', name: 'خالد', team: 'blue', playing: true },
  ]
  const missing = { action: 'goal', player: null, other_player: null, suspension_minutes: null, candidates: [] }
  const heard = (text: string) => ({ text, alternatives: [] })

  it('is offered as the assister, never as the scorer', () => {
    expect(readVoiceAnswer(missing, players, heard('هدف أسيست دجل')))
      .toMatchObject({ playerId: null, otherId: null, candidates: [], otherCandidates: ['a'] })
    // With the scorer known, the misheard assister is still offered for the assist
    expect(readVoiceAnswer({ ...missing, player: 'p2' }, players, heard('هدف ليث أسيست دجل')))
      .toMatchObject({ playerId: 'b', candidates: [], otherCandidates: ['a'] })
  })

  it('keeps each role\'s guesses apart when both were misheard', () => {
    expect(readVoiceAnswer(missing, players, heard('هدف خالض بتمريرة دجل')))
      .toMatchObject({ candidates: ['c'], otherCandidates: ['a'] })
  })

  it('drops a scorer guess that Claude also gave as the assister', () => {
    expect(readVoiceAnswer({ ...missing, candidates: ['p1', 'p2'], other_candidates: ['p1'] }, players, heard('هدف ممم أسيست دجل')))
      .toMatchObject({ candidates: ['b'], otherCandidates: ['a'] })
  })

  it('finds the assist word with "and" joined to it', () => {
    // «وأسيست»: the referee's natural «هدف ليث وأسيست دجل»
    expect(readVoiceAnswer({ ...missing, player: 'p2' }, players, heard('هدف ليث وأسيست دجل')))
      .toMatchObject({ playerId: 'b', candidates: [], otherCandidates: ['a'] })
    expect(readVoiceAnswer(missing, players, heard('هدف وأسيست دجل')))
      .toMatchObject({ playerId: null, candidates: [], otherCandidates: ['a'] })
    expect(readVoiceAnswer(missing, players, heard('هدف خالض وبتمريرة دجل')))
      .toMatchObject({ candidates: ['c'], otherCandidates: ['a'] })
  })

  it('still reads a name before a passing verb as the scorer\'s guess', () => {
    // «مرّر» is not an assist marker: the order around it varies
    expect(readVoiceAnswer(missing, players, heard('دجل مرر جول')).candidates).toEqual(['a'])
  })

  it('reads «من» after the scorer as the assist, and keeps it open when the name is unclear', () => {
    // «هدف ليث من دجل»: ليث scored, the assister was spoken but not understood
    expect(readVoiceAnswer({ ...missing, player: 'p2' }, players, heard('هدف ليث من دجل')))
      .toMatchObject({ playerId: 'b', otherId: null, candidates: [], otherCandidates: ['a'] })
    // «من» straight after the goal word is the scorer's own: «هدف من دجل»
    expect(readVoiceAnswer(missing, players, heard('هدف من دجل')))
      .toMatchObject({ candidates: ['a'], otherCandidates: [] })
  })

  it('reads a passing verb after the scorer as the assist: «هدف ليث وباص دجل»', () => {
    expect(readVoiceAnswer({ ...missing, player: 'p2' }, players, heard('هدف ليث وباص دجل')))
      .toMatchObject({ playerId: 'b', otherCandidates: ['a'] })
  })

  it('keeps the roles apart when the assist comes first: «أسيست خالد هدف دجل»', () => {
    expect(readVoiceAnswer(missing, players, heard('أسيست خالد هدف دجل')))
      .toMatchObject({ playerId: null, otherId: null, candidates: ['a'], otherCandidates: ['c'] })
    expect(readVoiceAnswer({ ...missing, other_player: 'p3' }, players, heard('أسيست خالد هدف دجل')))
      .toMatchObject({ playerId: null, otherId: 'c', candidates: ['a'] })
  })

  it('reads «من» after a scorer named first as the assist: «ليث سجل من دجل»', () => {
    expect(readVoiceAnswer({ ...missing, player: 'p2' }, players, heard('ليث سجل من دجل')))
      .toMatchObject({ playerId: 'b', otherCandidates: ['a'] })
  })

  it('never offers a player the referee ruled out with «مش»', () => {
    // «هدف خالد مش ليث»: خالد, not ليث. Which name is which is for Claude and the referee.
    expect(readVoiceAnswer(missing, players, heard('هدف خالد مش ليث')))
      .toMatchObject({ candidates: [], otherCandidates: [] })
  })

  it('does not guess the role of a name that replaced another', () => {
    // «هدف ليث أسيست خالد لا دجل»: دجل replaced the assister, not the scorer
    expect(readVoiceAnswer(missing, players, heard('هدف ليث أسيست خالد لا دجل')))
      .toMatchObject({ candidates: [], otherCandidates: [] })
  })

  it('offers both names when the referee was not sure: «هدف ليث ولا خالد»', () => {
    expect(readVoiceAnswer(missing, players, heard('هدف ليث ولا خالد')).candidates).toEqual(['b', 'c'])
  })

  it('suggests names only from what the referee said after correcting himself', () => {
    // «هدف العجل قصدي زيد»: العجل was taken back, and زيد is nobody on the roster
    expect(readVoiceAnswer(missing, players, heard('هدف العجل قصدي زيد')))
      .toMatchObject({ playerId: null, candidates: [], otherCandidates: [] })
    expect(readVoiceAnswer(missing, players, heard('هدف ليث لا لا هدف دجل')).candidates).toEqual(['a'])
  })
})

describe('«من» after words that name nobody on the roster', () => {
  const players: VoicePlayer[] = [
    { id: 'a', name: 'محمد العجل', team: 'green', playing: true },
    { id: 's', name: 'محمد سالم', team: 'green', playing: true },
    { id: 'b', name: 'ليث', team: 'blue', playing: true },
    { id: 'c', name: 'خالد', team: 'blue', playing: true },
    { id: 'o', name: 'Omar', team: 'green', playing: true },
  ]
  const missing = { action: 'goal', player: null, other_player: null, suspension_minutes: null, candidates: [] }
  const heard = (text: string) => ({ text, alternatives: [] })
  // Praise, filler, made-up and misheard words: the roster knows none of them, and no list of
  // such words is kept anywhere. Each may describe the goal, or be a scorer's name the
  // recognizer got wrong.
  const unknownFirst = [
    'هدف حلو من دجل', 'هدف رائع من ليث', 'جول عالمي من خالد', 'يا سلام هدف من ليث', 'هدف بزلزل من ليث',
    'هدف طماطم من خالد', 'what a goal from Omar', 'stunning goal from Omar', 'goal blorp from Omar',
  ]

  it('never offers the name after «من» as the assister', () => {
    for (const t of unknownFirst) {
      expect(readVoiceAnswer(missing, players, heard(t)).otherCandidates, t).toEqual([])
      expect(mentionsAssist(t, players), t).toBe(false)
    }
  })

  it('does not force the name into the scorer\'s place either: the interpreter reads it and the referee confirms', () => {
    for (const t of unknownFirst) {
      expect(readVoiceAnswer(missing, players, heard(t)), t).toMatchObject({ playerId: null, candidates: [], otherCandidates: [] })
    }
    // What the interpreter understood stands as it is
    expect(readVoiceAnswer({ ...missing, player: 'p3' }, players, heard('هدف رائع من ليث')))
      .toMatchObject({ playerId: 'b', otherId: null, candidates: [], otherCandidates: [] })
  })

  it('a name only similar to a player\'s does not tell the scorer\'s part apart either', () => {
    // «دجل» may be العجل misheard, or not a name at all
    expect(readVoiceAnswer(missing, players, heard('هدف دجل من خالد')))
      .toMatchObject({ candidates: [], otherCandidates: [] })
  })

  it('a player\'s name among those words still makes what follows «من» the assist', () => {
    // ليث scored; the assister was spoken but misheard, and is kept open
    expect(readVoiceAnswer({ ...missing, player: 'p3' }, players, heard('هدف رائع لليث من دجل')))
      .toMatchObject({ playerId: 'b', otherCandidates: ['a'] })
    expect(mentionsAssist('هدف رائع لليث من دجل', players)).toBe(true)
    expect(mentionsAssist('what a goal by Omar from Khaled', players)).toBe(true)
  })

  it('a first name two players share is still a name: «هدف محمد من ليث»', () => {
    expect(readVoiceAnswer(missing, players, heard('هدف محمد من ليث')))
      .toMatchObject({ candidates: ['a', 's'], otherCandidates: ['b'] })
    expect(mentionsAssist('هدف محمد من ليث', players)).toBe(true)
  })
})

describe('a family name two players share', () => {
  const players: VoicePlayer[] = [
    { id: 'k', name: 'خالد الحسن', team: 'green', playing: true },
    { id: 'o', name: 'عمر الحسن', team: 'blue', playing: true },
    { id: 'l', name: 'ليث', team: 'blue', playing: true },
  ]
  const goal = { action: 'goal', player: null, other_player: null, suspension_minutes: null, candidates: [] }
  const heard = (text: string) => ({ text, alternatives: [] })

  it('never offers the assister\'s relative as the scorer', () => {
    // خالد الحسن understood as the assister from «باص الحسن»: عمر الحسن was never named
    expect(readVoiceAnswer({ ...goal, other_player: 'p1' }, players, heard('هدف باص الحسن')))
      .toMatchObject({ playerId: null, otherId: 'k', candidates: [] })
    expect(readVoiceAnswer({ ...goal, other_candidates: ['p1'] }, players, heard('هدف الحسن')))
      .toMatchObject({ playerId: null, candidates: [], otherCandidates: ['k'] })
  })

  it('never offers the scorer\'s relative as the assister', () => {
    expect(readVoiceAnswer({ ...goal, player: 'p2' }, players, heard('هدف عمر أسيست الحسن')))
      .toMatchObject({ playerId: 'o', otherCandidates: [] })
  })

  it('still offers both when nobody was placed yet', () => {
    expect(readVoiceAnswer(goal, players, heard('هدف الحسن')).candidates).toEqual(['k', 'o'])
  })

  it('counts the shared name as a scorer\'s name, so what follows «من» is the assist', () => {
    expect(readVoiceAnswer(goal, players, heard('هدف الحسن من ليث')))
      .toMatchObject({ candidates: ['k', 'o'], otherCandidates: ['l'] })
    expect(mentionsAssist('هدف الحسن من ليث', players)).toBe(true)
  })
})

describe('mentionsAssist', () => {
  // The scorers these sentences name, so the roster can tell a name from any other word
  const named: VoicePlayer[] = ['ليث', 'خالد', 'سامي', 'Omar', 'Laith', 'Sami'].map((name, i) =>
    ({ id: `n${i}`, name, team: i % 2 ? 'blue' : 'green', playing: true }))

  it('hears an assist however it is said', () => {
    for (const t of ['هدف ليث أسيست دجل', 'هدف العجل بتمريرة خالد', 'خالد مرّر للعجل وسجّل', 'هدف باص الحسن', 'goal Omar assist Ali']) {
      expect(mentionsAssist(t, named)).toBe(true)
    }
    for (const t of ['هدف ليث', 'هدف من ليث', 'goal for Sami', 'صفرا لسامي', 'هدف وليد', 'هدف فارس', 'هدف وسيم']) {
      expect(mentionsAssist(t, named)).toBe(false)
    }
  })

  it('hears it with "and" or "then" joined to the word', () => {
    for (const t of ['هدف ليث وأسيست دجل', 'هدف ليث وباص دجل', 'هدف ليث وبتمريرة دجل', 'هدف ليث والأسيست لدجل', 'هدف ليث فمررها دجل', 'هدف ليث وصناعة دجل']) {
      expect(mentionsAssist(t, named)).toBe(true)
    }
  })

  it('hears «من» or "from" after the scorer as an assist, but not straight after the goal word', () => {
    for (const t of ['هدف ليث من خالد', 'هدف ليث من دجل', 'هدف من ليث من خالد', 'جول لليث من خالد', 'goal Omar from Ali']) {
      expect(mentionsAssist(t, named)).toBe(true)
    }
    for (const t of ['هدف من ليث', 'goal from Ali', 'هدف عكسي من سامي', 'دفاع من خالد']) {
      expect(mentionsAssist(t, named)).toBe(false)
    }
  })

  it('hears it after a scorer named first: «ليث سجل من زيد»', () => {
    for (const t of ['ليث سجل من زيد', 'Laith scored from Zaid', 'ليث سجل وباص زيد']) {
      expect(mentionsAssist(t, named)).toBe(true)
    }
  })

  it('does not take «من» for an assist when it says where the goal came from', () => {
    for (const t of ['هدف ليث من بعيد', 'هدف ليث من ركنية', 'هدف ليث من ضربة حرة', 'هدف ليث من راسية', 'goal Omar from distance', 'goal Omar from a corner']) {
      expect(mentionsAssist(t, named)).toBe(false)
    }
  })

  it('goes by the corrected sentence', () => {
    expect(mentionsAssist('هدف ليث أسيست خالد لا هدف سامي', named)).toBe(false)
    expect(mentionsAssist('هدف ليث لا لا هدف خالد من ليث', named)).toBe(true)
  })
})

describe('hasCorrection', () => {
  it('hears the referee taking something back', () => {
    for (const t of ['هدف العجل قصدي زيد', 'مش هدف قطع كرة للعجل', 'صفرا لأ حمرا لسامي', 'goal Omar sorry Ali', 'goal Omar I mean Ali']) {
      expect(hasCorrection(t)).toBe(true)
    }
    for (const t of ['هدف ليث', 'هدف ليث من خالد', 'goal Omar', 'هدف لامع']) {
      expect(hasCorrection(t)).toBe(false)
    }
  })

  it('hears the referee not being sure, too', () => {
    for (const t of ['هدف ليث ولا خالد', 'هدف ليث أو خالد', 'goal Omar or Ali', 'هدف خالد مش ليث']) {
      expect(hasCorrection(t)).toBe(true)
    }
  })
})
