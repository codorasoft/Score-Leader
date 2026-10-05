import { spotForNewPlayer, clampSpot, lineupChanges, makeGuest, parseGuests } from './board'

describe('spotForNewPlayer', () => {
  it('fills rows of four from the bottom of the pitch upwards', () => {
    expect(spotForNewPlayer(0)).toEqual({ x: 0.2, y: 0.85 })
    expect(spotForNewPlayer(3)).toEqual({ x: 0.8, y: 0.85 })
    expect(spotForNewPlayer(4)).toEqual({ x: 0.2, y: 0.7 })
  })

  it('keeps every spot on the pitch however many players are added', () => {
    for (let i = 0; i < 60; i++) {
      const s = spotForNewPlayer(i)
      expect(s.x).toBeGreaterThanOrEqual(0)
      expect(s.x).toBeLessThanOrEqual(1)
      expect(s.y).toBeGreaterThan(0)
      expect(s.y).toBeLessThan(1)
    }
  })
})

it('keeps a dropped player inside the pitch', () => {
  expect(clampSpot({ x: -0.2, y: 1.3 })).toEqual({ x: 0, y: 1 })
  expect(clampSpot({ x: 0.123456, y: 0.5 })).toEqual({ x: 0.1235, y: 0.5 })
})

it('works out which players to remove and which spots to save', () => {
  const changes = lineupChanges('L1', ['ali', 'omar', 'sami'], [
    { playerId: 'ali', x: 0.5, y: 0.5 },
    { playerId: 'hadi', x: 0.2, y: 0.8 },
  ])
  expect(changes.remove).toEqual(['omar', 'sami'])
  expect(changes.upsert).toEqual([
    { lineup_id: 'L1', player_id: 'ali', x: 0.5, y: 0.5 },
    { lineup_id: 'L1', player_id: 'hadi', x: 0.2, y: 0.8 },
  ])
})

describe('guests', () => {
  it('makes a guest from a typed name, trimmed and length-limited', () => {
    expect(makeGuest('  Khalil  ', { x: 0.2, y: 0.85 }, 'g1')).toEqual({ id: 'g1', name: 'Khalil', x: 0.2, y: 0.85 })
    expect(makeGuest('x'.repeat(60), { x: 0.2, y: 0.85 }, 'g2')!.name).toHaveLength(40)
    expect(makeGuest('   ', { x: 0.2, y: 0.85 }, 'g3')).toBeNull()
  })

  it('reads saved guests back and drops anything malformed', () => {
    expect(parseGuests([
      { id: 'a', name: 'Khalil', x: 0.3, y: 0.4 },
      { id: 'b', name: '', x: 0.3, y: 0.4 },
      { id: 'c', name: 'Off pitch', x: 3, y: 0.4 },
      'nonsense',
    ])).toEqual([{ id: 'a', name: 'Khalil', x: 0.3, y: 0.4 }])
    expect(parseGuests(undefined)).toEqual([])
  })
})
