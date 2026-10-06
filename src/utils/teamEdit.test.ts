import { swapPlayers, movePlayer, teamStars } from './teamEdit'
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
