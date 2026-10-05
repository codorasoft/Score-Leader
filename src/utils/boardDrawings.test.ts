import { shapeFromDrag, parseDrawings, DRAW_COLORS } from './boardDrawings'

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
