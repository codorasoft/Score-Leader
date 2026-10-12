import { shapeFromDrag, parseDrawings, undoDrawn, clearDrawn, hasDrawn, DRAW_COLORS, type Shape, BOARD_TEXT_MAX, makeText, moveText } from './boardDrawings'

const id = 'd1'

describe('shapeFromDrag', () => {
  it('makes a solid arrow for a pass and a dashed one for a run', () => {
    expect(shapeFromDrag('pass', { x: 0.2, y: 0.8 }, { x: 0.6, y: 0.5 }, 'yellow', id))
      .toEqual({ id, kind: 'arrow', dashed: false, color: 'yellow', x1: 0.2, y1: 0.8, x2: 0.6, y2: 0.5 })
    expect(shapeFromDrag('run', { x: 0.2, y: 0.8 }, { x: 0.6, y: 0.5 }, 'white', id))
      .toMatchObject({ kind: 'arrow', dashed: true })
  })

  it('makes a zone centred where the drag started, sized by how far it went', () => {
    // 0.15 across and 0.1 down on a 2:3 pitch = 0.15 and 0.15 in pitch-width units → radius ≈ 0.2121
    expect(shapeFromDrag('zone', { x: 0.5, y: 0.5 }, { x: 0.65, y: 0.6 }, 'red', id))
      .toEqual({ id, kind: 'zone', color: 'red', cx: 0.5, cy: 0.5, r: 0.2121 })
  })

  it('ignores taps too short to mean anything', () => {
    expect(shapeFromDrag('pass', { x: 0.5, y: 0.5 }, { x: 0.51, y: 0.5 }, 'white', id)).toBeNull()
    expect(shapeFromDrag('zone', { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.51 }, 'white', id)).toBeNull()
  })
})

describe('parseDrawings', () => {
  it('keeps valid saved shapes and drops anything malformed', () => {
    const saved = [
      { id: 'a', kind: 'arrow', dashed: true, color: 'blue', x1: 0.1, y1: 0.2, x2: 0.3, y2: 0.4 },
      { id: 'z', kind: 'zone', color: 'white', cx: 0.5, cy: 0.5, r: 0.1 },
      { id: 'bad-color', kind: 'zone', color: 'pink', cx: 0.5, cy: 0.5, r: 0.1 },
      { id: 'off-pitch', kind: 'arrow', dashed: false, color: 'red', x1: 2, y1: 0, x2: 0, y2: 0 },
      'nonsense',
    ]
    expect(parseDrawings(saved).map((s) => s.id)).toEqual(['a', 'z'])
    expect(parseDrawings(null)).toEqual([])
  })
})

it('offers four colours', () => {
  expect(Object.keys(DRAW_COLORS)).toEqual(['white', 'yellow', 'red', 'blue'])
})

describe('team labels', () => {
  const label = { id: 'l', kind: 'label', team: 'green', text: 'Green Team', x: 0.5, y: 0.1 }

  it('are kept among the saved drawings', () => {
    expect(parseDrawings([label])).toEqual([label])
  })

  it('are dropped when the team colour is unknown, the text is empty or the spot is off the pitch', () => {
    const bad = [
      { ...label, id: 'team', team: 'pink' },
      { ...label, id: 'empty', text: '  ' },
      { ...label, id: 'no-text', text: 7 },
      { ...label, id: 'off', y: 1.2 },
    ]
    expect(parseDrawings(bad)).toEqual([])
  })
})

describe('undo and clear', () => {
  const label: Shape = { id: 'l', kind: 'label', team: 'green', text: 'Green Team', x: 0.5, y: 0.1 }
  const arrow: Shape = { id: 'a', kind: 'arrow', dashed: false, color: 'white', x1: 0.1, y1: 0.2, x2: 0.3, y2: 0.4 }
  const zone: Shape = { id: 'z', kind: 'zone', color: 'red', cx: 0.5, cy: 0.5, r: 0.1 }

  it('undo takes back the last arrow or zone and leaves the team names', () => {
    expect(undoDrawn([arrow, label, zone]).map((s) => s.id)).toEqual(['a', 'l'])
    expect(undoDrawn([arrow, zone, label]).map((s) => s.id)).toEqual(['a', 'l'])
    expect(undoDrawn([label])).toEqual([label])
  })

  it('clear removes every arrow and zone and leaves the team names', () => {
    expect(clearDrawn([arrow, label, zone])).toEqual([label])
  })

  it('there is something to undo only when an arrow or zone was drawn', () => {
    expect(hasDrawn([label])).toBe(false)
    expect(hasDrawn([label, zone])).toBe(true)
  })
})

describe('free text', () => {
  const note = { id: 'n1', kind: 'text' as const, color: 'red' as const, text: 'Press high', x: 0.5, y: 0.2 }

  it('is made from what was typed: trimmed, single spaces, in the chosen colour, where the pitch was tapped', () => {
    expect(makeText('  Press   high \n now ', { x: 0.25, y: 0.75 }, 'blue', 'n9'))
      .toEqual({ id: 'n9', kind: 'text', color: 'blue', text: 'Press high now', x: 0.25, y: 0.75 })
  })

  it('is not made from nothing', () => {
    expect(makeText('', { x: 0.5, y: 0.5 }, 'white', 'n9')).toBeNull()
    expect(makeText('   ', { x: 0.5, y: 0.5 }, 'white', 'n9')).toBeNull()
  })

  it('is cut at the longest text a board takes', () => {
    expect(BOARD_TEXT_MAX).toBe(40)
    expect(makeText('x'.repeat(60), { x: 0.5, y: 0.5 }, 'white', 'n9')).toMatchObject({ text: 'x'.repeat(40) })
  })

  it('is kept among the saved drawings', () => {
    expect(parseDrawings([note])).toEqual([note])
  })

  it('is dropped when its colour is unknown, it is empty or too long, or its spot is off the pitch', () => {
    expect(parseDrawings([
      { ...note, id: 'a', color: 'pink' },
      { ...note, id: 'b', text: '  ' },
      { ...note, id: 'c', text: 'x'.repeat(41) },
      { ...note, id: 'd', x: 1.2 },
      { ...note, id: 'e', text: 7 },
      { id: 'f', kind: 'text', text: 'No colour', x: 0.5, y: 0.5 },
    ])).toEqual([])
  })

  it('moves to a new spot, and only that text moves', () => {
    const arrow = { id: 'a1', kind: 'arrow' as const, dashed: false, color: 'white' as const, x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.5 }
    const other = { ...note, id: 'n2', text: 'Hold' }
    expect(moveText([arrow, note, other], 'n1', { x: 0.7, y: 0.9 })).toEqual([arrow, { ...note, x: 0.7, y: 0.9 }, other])
    // An id that is not a text changes nothing
    expect(moveText([arrow, note], 'a1', { x: 0.7, y: 0.9 })).toEqual([arrow, note])
  })

  it('counts as drawn by hand: Undo and Clear take it away', () => {
    expect(hasDrawn([note])).toBe(true)
    expect(undoDrawn([note])).toEqual([])
    expect(clearDrawn([note])).toEqual([])
  })
})

