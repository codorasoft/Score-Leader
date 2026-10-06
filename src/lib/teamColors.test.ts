import { styleMap, TEAM_COLORS, teamStyle } from './teamColors'

it('gives teams their colours in a fixed order, never red', () => {
  expect(TEAM_COLORS).toEqual(['green', 'blue', 'yellow', 'orange', 'purple', 'white'])
})

it('keeps the existing look for green, blue and yellow', () => {
  expect(teamStyle('green')).toEqual({
    dot: 'bg-green-500', card: 'bg-green-900/40 border-green-600', board: 'border-green-500 bg-green-900/20', hex: '#22c55e',
  })
  expect(teamStyle('blue').hex).toBe('#3b82f6')
  expect(teamStyle('yellow').dot).toBe('bg-yellow-400')
  expect(teamStyle('yellow').hex).toBe('#facc15')
})

it('styles every colour', () => {
  for (const c of TEAM_COLORS) {
    const s = teamStyle(c)
    expect(s.dot && s.card && s.board && s.hex).toBeTruthy()
  }
})

it('offers lookup tables keyed by colour name', () => {
  expect(styleMap('dot').orange).toBe(teamStyle('orange').dot)
  expect(Object.keys(styleMap('hex'))).toEqual(TEAM_COLORS)
})
