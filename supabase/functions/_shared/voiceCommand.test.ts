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
})

describe('readVoiceAnswer', () => {
  const answer = (extra: Record<string, unknown>) => ({
    action: 'goal', player: null, other_player: null, suspension_minutes: null, candidates: [], ...extra,
  })

  it('maps keys back to player ids', () => {
    expect(readVoiceAnswer(answer({ player: 'p1', other_player: 'p2' }), roster))
      .toEqual({ action: 'goal', playerId: 'a', otherId: 'b', suspensionMinutes: null, candidates: [] })
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

  it('a lone name is the scorer, even when Claude put it as the assister', () => {
    // "هدف من ليث": من before the only name does not make it an assist
    expect(readVoiceAnswer(answer({ player: null, other_player: 'p1' }), roster))
      .toEqual({ action: 'goal', playerId: 'a', otherId: null, suspensionMinutes: null, candidates: [] })
    expect(readVoiceAnswer(answer({ action: 'yellow_card', player: null, other_player: 'p3' }), roster).playerId).toBe('c')
  })

  it('keeps suspension minutes only on a red card', () => {
    expect(readVoiceAnswer(answer({ action: 'red_card', player: 'p1', suspension_minutes: 3 }), roster).suspensionMinutes).toBe(3)
    expect(readVoiceAnswer(answer({ action: 'yellow_card', player: 'p1', suspension_minutes: 3 }), roster).suspensionMinutes).toBeNull()
  })

  it('keeps the assist and asks for the scorer when the scorer is only unsure', () => {
    // "هدف محمد أسيست خالد" with two players called محمد
    expect(readVoiceAnswer(answer({ player: null, other_player: 'p2', candidates: ['p1', 'p3', 'p2'] }), roster))
      .toEqual({ action: 'goal', playerId: null, otherId: 'b', suspensionMinutes: null, candidates: ['a', 'c'] })
  })

  it('lists candidates only when no player was picked', () => {
    expect(readVoiceAnswer(answer({ candidates: ['p1', 'p2', 'p1', 'p4', 'zz'] }), roster).candidates).toEqual(['a', 'b'])
    expect(readVoiceAnswer(answer({ player: 'p3', candidates: ['p1'] }), roster).candidates).toEqual([])
  })

  it('clears player fields on clock and undo commands', () => {
    expect(readVoiceAnswer(answer({ action: 'pause', player: 'p1' }), roster))
      .toEqual({ action: 'pause', playerId: null, otherId: null, suspensionMinutes: null, candidates: [] })
  })

  it('reads anything unexpected as not understood', () => {
    expect(readVoiceAnswer(null, roster).action).toBe('unknown')
    expect(readVoiceAnswer({ action: 'dance' }, roster).action).toBe('unknown')
  })
})
