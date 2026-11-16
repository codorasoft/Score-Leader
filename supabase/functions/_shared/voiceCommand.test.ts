import { readVoiceAnswer, validateVoiceRequest, voicePrompt, voiceSchema, type VoicePlayer } from './voiceCommand'

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
    expect(readVoiceAnswer({ ...missing, player: 'p2' }, players, heard('هدف ليث أسيست دجل')))
      .toMatchObject({ playerId: 'b', otherCandidates: [] })
  })

  it('keeps each role\'s guesses apart when both were misheard', () => {
    expect(readVoiceAnswer(missing, players, heard('هدف خالض بتمريرة دجل')))
      .toMatchObject({ candidates: ['c'], otherCandidates: ['a'] })
  })

  it('drops a scorer guess that Claude also gave as the assister', () => {
    expect(readVoiceAnswer({ ...missing, candidates: ['p1', 'p2'], other_candidates: ['p1'] }, players, heard('هدف ممم أسيست دجل')))
      .toMatchObject({ candidates: ['b'], otherCandidates: ['a'] })
  })

  it('still reads a name before a passing verb as the scorer\'s guess', () => {
    // «مرّر» is not an assist marker: the order around it varies
    expect(readVoiceAnswer(missing, players, heard('دجل مرر جول')).candidates).toEqual(['a'])
  })
})
