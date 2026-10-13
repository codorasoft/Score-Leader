import { MAX_ON_PITCH, MIN_ON_PITCH, fitsPitch, formationName, formationSpots, parseFormation, suggestedFormations } from './formation'

describe('parseFormation', () => {
  it('reads the lines from the defence forward', () => {
    expect(parseFormation('4-3-2-1')).toEqual([4, 3, 2, 1])
    expect(parseFormation('1')).toEqual([1])
    expect(formationName([4, 4, 2])).toBe('4-4-2')
  })

  it('refuses what is not a formation', () => {
    for (const bad of ['', '4-4-7', '4-0-2', '1-1-1-1-1-1', '4--2', '4-4-2-', 'abc', ' 4-4-2', '10', null, undefined, 442]) {
      expect(parseFormation(bad)).toBeNull()
    }
  })
})

describe('fitsPitch', () => {
  it('needs the lines to add up to everyone but the goalkeeper', () => {
    expect(fitsPitch([4, 4, 2], 11)).toBe(true)
    expect(fitsPitch([4, 4, 2], 10)).toBe(false)
    expect(fitsPitch([1], 2)).toBe(true)
    expect(fitsPitch([], 1)).toBe(false)
    expect(fitsPitch([6, 6], 13)).toBe(false)
  })
})

describe('suggestedFormations', () => {
  it('offers only formations that fit the number on the pitch', () => {
    for (let n = MIN_ON_PITCH; n <= MAX_ON_PITCH; n++) {
      const names = suggestedFormations(n)
      expect(names.length).toBeGreaterThan(0)
      expect(new Set(names).size).toBe(names.length)
      for (const name of names) expect(fitsPitch(parseFormation(name)!, n)).toBe(true)
    }
  })

  it('is the table of the spec', () => {
    expect(suggestedFormations(5)).toEqual(['2-2', '1-2-1', '2-1-1', '1-1-2'])
    expect(suggestedFormations(7)).toEqual(['2-3-1', '3-2-1', '3-1-2', '2-2-2'])
    expect(suggestedFormations(11)).toEqual(['4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '4-3-2-1', '5-3-2', '3-4-3', '4-1-4-1'])
  })

  it('has nothing for one player or for twelve', () => {
    expect(suggestedFormations(1)).toEqual([])
    expect(suggestedFormations(12)).toEqual([])
  })
})

describe('formationSpots', () => {
  it('puts the keeper in goal and spreads the lines up the pitch', () => {
    expect(formationSpots([4, 4, 2])).toEqual([
      { x: 0.5, y: 0.92, role: 'GK' },
      { x: 0.185, y: 0.74, role: 'DEF' }, { x: 0.395, y: 0.74, role: 'DEF' }, { x: 0.605, y: 0.74, role: 'DEF' }, { x: 0.815, y: 0.74, role: 'DEF' },
      { x: 0.185, y: 0.47, role: 'MID' }, { x: 0.395, y: 0.47, role: 'MID' }, { x: 0.605, y: 0.47, role: 'MID' }, { x: 0.815, y: 0.47, role: 'MID' },
      { x: 0.29, y: 0.2, role: 'ATT' }, { x: 0.71, y: 0.2, role: 'ATT' },
    ])
  })

  it('with two lines has a defence and an attack; with one, a midfield in the middle', () => {
    expect(formationSpots([2, 2]).map((s) => [s.y, s.role])).toEqual([[0.92, 'GK'], [0.74, 'DEF'], [0.74, 'DEF'], [0.2, 'ATT'], [0.2, 'ATT']])
    expect(formationSpots([1])).toEqual([{ x: 0.5, y: 0.92, role: 'GK' }, { x: 0.5, y: 0.47, role: 'MID' }])
  })

  it('calls every line between the first and the last midfield', () => {
    expect(formationSpots([4, 2, 3, 1]).map((s) => s.role).join(' ')).toBe('GK DEF DEF DEF DEF MID MID MID MID MID ATT')
    expect(formationSpots([4, 2, 3, 1]).filter((s) => s.role === 'MID').map((s) => s.y)).toEqual([0.56, 0.56, 0.38, 0.38, 0.38])
  })
})
