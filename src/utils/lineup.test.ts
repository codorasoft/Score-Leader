import { defaultFormation, toPitch, fromPitch, ROW_LAYOUTS } from './lineup'
import type { Player } from '../lib/types'

const p = (id: string, position: Player['position']) => ({ id, name: id, position }) as Player

describe('defaultFormation', () => {
  it('puts the goalkeeper in goal and spreads 4 outfield players 2-2, defenders at the back', () => {
    const spots = defaultFormation([p('a', 'ATT'), p('gk', 'GK'), p('d1', 'DEF'), p('m', 'MID'), p('d2', 'DEF')])
    expect(spots.get('gk')).toEqual({ x: 0.5, y: 0.16 })
    const back = [spots.get('d1')!, spots.get('d2')!]
    const front = [spots.get('m')!, spots.get('a')!]
    expect(back.every((s) => s.y < front[0].y)).toBe(true)
    expect(back.map((s) => s.x).sort()).toEqual([0.3, 0.7])
    expect(front.map((s) => s.x).sort()).toEqual([0.3, 0.7])
  })

  it('has a row layout for every team size the app produces', () => {
    for (let n = 1; n <= 8; n++) expect(ROW_LAYOUTS[n].reduce((a, b) => a + b, 0)).toBe(n)
  })

  it('handles a team with no goalkeeper', () => {
    const spots = defaultFormation([p('a', 'MID'), p('b', 'MID'), p('c', 'MID')])
    expect(spots.size).toBe(3)
    expect([...spots.values()].every((s) => s.y > 0.2)).toBe(true)
  })
})

describe('pitch coordinates', () => {
  it('puts the bottom team in the lower half with its goal at the bottom', () => {
    expect(toPitch({ x: 0.2, y: 0 }, 'bottom')).toEqual({ px: 0.2, py: 1 })
    expect(toPitch({ x: 0.2, y: 1 }, 'bottom')).toEqual({ px: 0.2, py: 0.5 })
  })

  it('mirrors the top team so it faces the bottom team', () => {
    expect(toPitch({ x: 0.2, y: 0 }, 'top')).toEqual({ px: 0.8, py: 0 })
    expect(toPitch({ x: 0.2, y: 1 }, 'top')).toEqual({ px: 0.8, py: 0.5 })
  })

  it('converts a drop point back and keeps players inside their own half', () => {
    expect(fromPitch({ px: 0.2, py: 0.75 }, 'bottom')).toEqual({ x: 0.2, y: 0.5 })
    expect(fromPitch({ px: 0.2, py: 0.1 }, 'bottom')).toEqual({ x: 0.2, y: 1 })
    expect(fromPitch({ px: 0.8, py: 0.25 }, 'top')).toEqual({ x: 0.2, y: 0.5 })
    expect(fromPitch({ px: -0.3, py: 1.4 }, 'bottom')).toEqual({ x: 0, y: 0 })
  })
})
