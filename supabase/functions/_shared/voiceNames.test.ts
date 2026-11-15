import { voiceNameHints } from './voiceNames'

const roster = [
  { id: 'ajl', name: 'محمد العجل' },
  { id: 'hasan', name: 'أحمد يوسف الحسن' },
  { id: 'khaled', name: 'خالد' },
]

describe('voiceNameHints', () => {
  it('suggests the full player when a surname was misheard by one letter', () => {
    expect(voiceNameHints(['دجل سجل جول'], roster)).toEqual([
      { heard: 'دجل', playerIds: ['ajl'], approximate: true },
    ])
  })

  it.each(['العجل', 'عجل', 'للعجل', 'بالعجل', 'والعجل'])(
    'matches the surname in %s without needing the first name', (spoken) => {
      const hints = voiceNameHints([`${spoken} سجل جول`], roster)
      expect(hints).toHaveLength(1)
      expect(hints[0]).toMatchObject({ playerIds: ['ajl'], approximate: false })
    },
  )

  it.each(['يوسف', 'الحسن'])(
    'matches the middle or last part %s of a three-part name', (spoken) => {
      expect(voiceNameHints([`${spoken} سجل جول`], roster)).toEqual([
        { heard: spoken, playerIds: ['hasan'], approximate: false },
      ])
    },
  )

  it('does not mistake the action words for a similar surname', () => {
    // سجل is only one substitution away from عجل; the command itself is not a name.
    expect(voiceNameHints(['سجل جول'], roster)).toEqual([])
  })

  it('keeps every player with the same surname as a candidate', () => {
    const family = [...roster, { id: 'ajl2', name: 'خالد العجل' }]
    expect(voiceNameHints(['العجل سجل جول'], family)).toEqual([
      { heard: 'العجل', playerIds: ['ajl', 'ajl2'], approximate: false },
    ])
    expect(voiceNameHints(['دجل سجل جول'], family)).toEqual([
      { heard: 'دجل', playerIds: ['ajl', 'ajl2'], approximate: true },
    ])
  })

  it('prefers an exact name over a similar name for the same spoken word', () => {
    const exact = [...roster, { id: 'dajl', name: 'حسن دجل' }]
    expect(voiceNameHints(['دجل سجل جول'], exact)).toEqual([
      { heard: 'دجل', playerIds: ['dajl'], approximate: false },
    ])
  })

  it('normalizes Arabic diacritics and hamza for exact matching', () => {
    const names = [{ id: 'ahmad', name: 'أَحْمَد خليل' }, { id: 'ibrahim', name: 'إبراهيم' }]
    expect(voiceNameHints(['احمد'], names)).toEqual([
      { heard: 'احمد', playerIds: ['ahmad'], approximate: false },
    ])
    expect(voiceNameHints(['ابراهيم'], names)).toEqual([
      { heard: 'ابراهيم', playerIds: ['ibrahim'], approximate: false },
    ])
  })

  it('uses the recognizer alternatives as additional name evidence', () => {
    const hints = voiceNameHints(['ممم سجل جول', 'العجل سجل جول'], roster)
    expect(hints).toEqual([
      { heard: 'العجل', playerIds: ['ajl'], approximate: false },
    ])
  })

  it('keeps distinct name mentions separate so callers can preserve scorer and assist roles', () => {
    expect(voiceNameHints(['دجل سجل جول أسيست خالد'], roster)).toEqual([
      { heard: 'دجل', playerIds: ['ajl'], approximate: true },
      { heard: 'خالد', playerIds: ['khaled'], approximate: false },
    ])
  })

  it('does not fuzzy-match a two-letter spoken fragment or roster name', () => {
    expect(voiceNameHints(['جل سجل جول'], roster)).toEqual([])
    expect(voiceNameHints(['عجل سجل جول'], [{ id: 'short', name: 'محمد جل' }])).toEqual([])
  })

  it('does not strip a leading ع from names such as علي', () => {
    expect(voiceNameHints(['علي سجل جول'], [{ id: 'ali', name: 'علي حسن' }])).toEqual([
      { heard: 'علي', playerIds: ['ali'], approximate: false },
    ])
  })

  it('limits approximate matching to Arabic while retaining exact Latin-name matches', () => {
    const names = [{ id: 'sami', name: 'Sami Khaled' }]
    expect(voiceNameHints(['goal Smi'], names)).toEqual([])
    expect(voiceNameHints(['goal sami'], names)).toEqual([
      { heard: 'sami', playerIds: ['sami'], approximate: false },
    ])
  })

  it('does not suggest unrelated names or invent players for an empty roster', () => {
    expect(voiceNameHints(['فيصل سجل جول'], roster)).toEqual([])
    expect(voiceNameHints(['العجل سجل جول'], [])).toEqual([])
  })
})
