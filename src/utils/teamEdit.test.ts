import { draftOf, restoreDraft, swapPlayers, movePlayer, teamStars, type Teams } from './teamEdit'
import type { Player } from '../lib/types'

const p = (id: string, skill_rating = 3) => ({ id, name: id, skill_rating }) as Player
const teams = (): [Player[], Player[], Player[]] => [[p('a'), p('b')], [p('c'), p('d')], [p('e')]]

it('swaps two players on different teams, keeping their slots', () => {
  const next = swapPlayers(teams(), 'b', 'e')
  expect(next.map((t) => t.map((x) => x.id))).toEqual([['a', 'e'], ['c', 'd'], ['b']])
})

it('ignores a swap within the same team or with an unknown player', () => {
  const start = teams()
  expect(swapPlayers(start, 'a', 'b')).toBe(start)
  expect(swapPlayers(start, 'a', 'zz')).toBe(start)
})

it('moves a player to the end of another team', () => {
  const next = movePlayer(teams(), 'a', 2)
  expect(next.map((t) => t.map((x) => x.id))).toEqual([['b'], ['c', 'd'], ['e', 'a']])
})

it('does not mutate the original teams', () => {
  const start = teams()
  swapPlayers(start, 'b', 'e')
  movePlayer(start, 'a', 1)
  expect(start.map((t) => t.map((x) => x.id))).toEqual([['a', 'b'], ['c', 'd'], ['e']])
})

it('sums skill stars per team', () => {
  expect(teamStars([p('x', 5), p('y', 2)])).toBe(7)
})

it('swaps and moves players across five teams', () => {
  const five = [[p('a')], [p('b')], [p('c')], [p('d')], [p('e'), p('f')]]
  const swapped = swapPlayers(five, 'a', 'f')
  expect(swapped.map((t) => t.map((pl) => pl.id))).toEqual([['f'], ['b'], ['c'], ['d'], ['e', 'a']])
  const moved = movePlayer(five, 'e', 3)
  expect(moved.map((t) => t.map((pl) => pl.id))).toEqual([['a'], ['b'], ['c'], ['d', 'e'], ['f']])
})

describe('the saved arrangement of unconfirmed teams', () => {
  const pl = (id: string) => ({ id, name: id }) as Player
  const attending = ['a', 'b', 'c', 'd'].map(pl)
  const names = (teams: Teams | null) => teams?.map((t) => t.map((p) => p.id)) ?? null

  it('is the player ids of each team, in team order', () => {
    expect(draftOf([[pl('a'), pl('b')], [pl('c')], []])).toEqual([['a', 'b'], ['c'], []])
  })

  it('comes back as the same teams, uneven ones included', () => {
    expect(names(restoreDraft([['c', 'a', 'b'], ['d']], attending, 2))).toEqual([['c', 'a', 'b'], ['d']])
  })

  it('is dropped when the session has a different number of teams', () => {
    expect(restoreDraft([['a', 'b'], ['c', 'd']], attending, 3)).toBeNull()
  })

  it('is dropped when someone attending is not in it', () => {
    expect(restoreDraft([['a', 'b'], ['c']], attending, 2)).toBeNull()
  })

  it('is dropped when it holds someone who is not attending', () => {
    expect(restoreDraft([['a', 'b'], ['c', 'x']], attending, 2)).toBeNull()
    expect(restoreDraft([['a', 'b', 'x'], ['c', 'd']], attending, 2)).toBeNull()
  })

  it('is dropped when a player is in it twice', () => {
    expect(restoreDraft([['a', 'b'], ['c', 'd', 'a']], attending, 2)).toBeNull()
  })

  it('is dropped when nothing usable was saved', () => {
    for (const raw of [null, undefined, 'a', {}, [['a', 'b'], 'c'], [['a', 1], ['c', 'd']]]) expect(restoreDraft(raw, attending, 2)).toBeNull()
  })
})
