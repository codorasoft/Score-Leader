import { spotForNewPlayer, clampSpot, lineupChanges, makeGuest, parseGuests, spotsForTeams } from './board'

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

describe('spotsForTeams', () => {
  it('gives each team a row, from the top down, with its players spread evenly across', () => {
    expect(spotsForTeams([['a', 'b'], ['c', 'd'], ['e', 'f']])).toEqual([
      { playerId: 'a', x: 0.25, y: 0.1667 }, { playerId: 'b', x: 0.75, y: 0.1667 },
      { playerId: 'c', x: 0.25, y: 0.5 }, { playerId: 'd', x: 0.75, y: 0.5 },
      { playerId: 'e', x: 0.25, y: 0.8333 }, { playerId: 'f', x: 0.75, y: 0.8333 },
    ])
  })

  it('centres a player who is alone in a team, and skips a team with nobody', () => {
    expect(spotsForTeams([['a'], []])).toEqual([{ playerId: 'a', x: 0.5, y: 0.25 }])
  })

  it('keeps the order of the players within a row', () => {
    const xs = spotsForTeams([['a', 'b', 'c', 'd', 'e']]).map((s) => s.x)
    expect(xs).toEqual([0.1, 0.3, 0.5, 0.7, 0.9])
  })

  it('wraps a team of more than six onto two lines inside its own band', () => {
    const spots = spotsForTeams([['a', 'b', 'c', 'd', 'e', 'f', 'g'], ['h']])
    const first = spots.filter((s) => s.playerId !== 'h')
    // Four on the first line, three on the second, both in the top half
    expect(first.map((s) => s.y)).toEqual([0.125, 0.125, 0.125, 0.125, 0.375, 0.375, 0.375])
    expect(first.slice(4).map((s) => s.x)).toEqual([0.1667, 0.5, 0.8333])
    expect(spots.find((s) => s.playerId === 'h')).toEqual({ playerId: 'h', x: 0.5, y: 0.75 })
  })

  it('keeps everyone on the pitch and nobody on the same spot, up to six teams of eleven', () => {
    const teams = Array.from({ length: 6 }, (_, t) => Array.from({ length: 11 }, (_, i) => `t${t}p${i}`))
    const spots = spotsForTeams(teams)
    expect(spots).toHaveLength(66)
    for (const s of spots) {
      expect(s.x).toBeGreaterThan(0)
      expect(s.x).toBeLessThan(1)
      expect(s.y).toBeGreaterThan(0)
      expect(s.y).toBeLessThan(1)
    }
    expect(new Set(spots.map((s) => `${s.x},${s.y}`)).size).toBe(66)
  })
})
