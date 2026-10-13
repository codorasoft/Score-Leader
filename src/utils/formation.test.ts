import { MAX_ON_PITCH, MIN_ON_PITCH, assignToFormation, fitsPitch, formationName, formationSpots, parseFormation, suggestedFormations, type FormationPlayer } from './formation'

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

describe('assignToFormation', () => {
  const p = (id: string, position: FormationPlayer['position'], x = 0.5, y = 0.5): FormationPlayer => ({ id, position, x, y })
  const where = (lines: number[], players: FormationPlayer[]) =>
    Object.fromEntries(assignToFormation(lines, players).map((a) => [a.id, [a.x, a.y]]))

  it('puts the keeper in goal and each line takes its own role', () => {
    const at = where([2, 1, 1], [p('att', 'ATT'), p('mid', 'MID'), p('d1', 'DEF', 0.2), p('gk', 'GK'), p('d2', 'DEF', 0.8)])
    expect(at).toEqual({ gk: [0.5, 0.92], d1: [0.29, 0.74], d2: [0.71, 0.74], mid: [0.5, 0.47], att: [0.5, 0.2] })
  })

  it('keeps the order players stand in from left to right inside a line', () => {
    const at = where([3], [p('gk', 'GK'), p('right', 'MID', 0.9), p('left', 'MID', 0.1), p('centre', 'MID', 0.5)])
    expect([at.left[0], at.centre[0], at.right[0]]).toEqual([0.22, 0.5, 0.78])
  })

  it('spills spare defenders into midfield before the attack', () => {
    const at = where([1, 1, 1], [p('gk', 'GK'), p('d1', 'DEF', 0.5, 0.9), p('d2', 'DEF', 0.5, 0.8), p('att', 'ATT')])
    expect(at.d1[1]).toBe(0.74)
    expect(at.d2[1]).toBe(0.47)
    expect(at.att[1]).toBe(0.2)
  })

  it('with two keepers, the one nearer the bottom goal keeps goal', () => {
    const at = where([1], [p('high', 'GK', 0.5, 0.3), p('low', 'GK', 0.5, 0.8)])
    expect(at).toEqual({ low: [0.5, 0.92], high: [0.5, 0.47] })
  })

  it('with no keeper, whoever is left over keeps goal', () => {
    const at = where([2, 2], [p('d1', 'DEF', 0.1), p('d2', 'DEF', 0.9), p('mid', 'MID'), p('a1', 'ATT', 0.1), p('a2', 'ATT', 0.9)])
    expect(at.mid).toEqual([0.5, 0.92])
  })

  it('places guests last, in what is left', () => {
    const at = where([1, 1], [p('guest', null), p('att', 'ATT'), p('gk', 'GK')])
    expect(at).toEqual({ gk: [0.5, 0.92], guest: [0.5, 0.74], att: [0.5, 0.2] })
  })

  it('gives the same answer for the same players', () => {
    const players = [p('a', 'MID', 0.3, 0.4), p('b', 'MID', 0.3, 0.4), p('c', null), p('d', 'DEF'), p('e', 'ATT')]
    expect(assignToFormation([2, 2], players)).toEqual(assignToFormation([2, 2], players))
    expect(assignToFormation([2, 2], players)).toHaveLength(5)
  })

  it('places nobody when the formation does not fit their number', () => {
    expect(assignToFormation([4, 4, 2], [p('a', 'GK'), p('b', 'DEF')])).toEqual([])
  })
})
