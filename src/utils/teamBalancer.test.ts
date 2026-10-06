import { balanceTeams } from './teamBalancer'
import type { Player } from '../lib/types'

const p = (id: string, pos: Player['position'], skill: number): Player => ({
  id, name: id, position: pos, skill_rating: skill,
  photo_url: null, is_active: true, created_at: '',
})

const total = (team: Player[], strength: (pl: Player) => number = (pl) => pl.skill_rating) =>
  team.reduce((a, pl) => a + strength(pl), 0)

it('assigns exactly one GK to each team when 3 GKs present', () => {
  const players = [
    p('gk1', 'GK', 3), p('gk2', 'GK', 3), p('gk3', 'GK', 3),
    ...Array.from({ length: 12 }, (_, i) => p(`f${i}`, 'DEF', (i % 5) + 1)),
  ]
  const { teams } = balanceTeams(players, 3)
  teams.forEach((t) => expect(t.filter((pl) => pl.position === 'GK')).toHaveLength(1))
})

it('sets needsGkAssignment when fewer than 3 GKs', () => {
  const players = [
    p('gk1', 'GK', 3),
    ...Array.from({ length: 14 }, (_, i) => p(`f${i}`, 'MID', 3)),
  ]
  expect(balanceTeams(players, 3).needsGkAssignment).toBe(true)
})

it('produces 3 equal-size teams for 15 players', () => {
  const players = Array.from({ length: 15 }, (_, i) =>
    p(`p${i}`, i < 3 ? 'GK' : 'MID', (i % 5) + 1))
  const { teams } = balanceTeams(players, 3)
  teams.forEach((t) => expect(t).toHaveLength(5))
})

it('keeps team sizes within one player for uneven numbers', () => {
  const players = Array.from({ length: 14 }, (_, i) => p(`p${i}`, i < 3 ? 'GK' : 'MID', (i % 5) + 1))
  const sizes = balanceTeams(players, 3).teams.map((t) => t.length).sort()
  expect(sizes).toEqual([4, 5, 5])
})

it('balances total skill within 2 points', () => {
  const players = Array.from({ length: 15 }, (_, i) =>
    p(`p${i}`, i < 3 ? 'GK' : 'ATT', (i % 5) + 1))
  for (let run = 0; run < 20; run++) {
    const sums = balanceTeams(players, 3).teams.map((t) => total(t))
    expect(Math.max(...sums) - Math.min(...sums)).toBeLessThanOrEqual(2)
  }
})

it('balances on the given strength instead of stars, goalkeeper strength included', () => {
  const players = [
    p('gkA', 'GK', 1), p('gkB', 'GK', 1), p('gkC', 'GK', 1),
    ...Array.from({ length: 12 }, (_, i) => p(`f${i}`, 'MID', 3)),
  ]
  // A star-based snake draft would end up 17 / 15 / 13 here
  const form: Record<string, number> = { gkA: 5, gkB: 3, gkC: 1, f0: 5, f1: 5, f2: 4, f3: 4, f4: 3, f5: 3, f6: 3, f7: 3, f8: 2, f9: 2, f10: 1, f11: 1 }
  const strength = (pl: Player) => form[pl.id]
  const sums = balanceTeams(players, 3, strength).teams.map((t) => total(t, strength))
  expect(Math.max(...sums) - Math.min(...sums)).toBeLessThanOrEqual(2)
})

it('splits up a duo that wins a lot together when told about partnerships', () => {
  const players = [
    // Without partnerships Omar (weak) often joins Ali (strong) to even out the totals
    p('gk1', 'GK', 3), p('gk2', 'GK', 3), p('gk3', 'GK', 3),
    p('ali', 'MID', 5), p('b', 'MID', 5), p('c', 'MID', 5),
    p('omar', 'MID', 1), p('d', 'MID', 1), p('e', 'MID', 1),
  ]
  const synergy = (a: Player, b: Player) => ([a.id, b.id].sort().join() === 'ali,omar' ? 3 : 0)
  for (let run = 0; run < 30; run++) {
    const { teams } = balanceTeams(players, 3, undefined, synergy)
    const aliTeam = teams.findIndex((t) => t.some((pl) => pl.id === 'ali'))
    expect(teams[aliTeam].some((pl) => pl.id === 'omar')).toBe(false)
  }
})

it('handles 9 players (3 per team)', () => {
  const players = Array.from({ length: 9 }, (_, i) =>
    p(`p${i}`, i < 3 ? 'GK' : 'MID', 3))
  const { teams } = balanceTeams(players, 3)
  teams.forEach((t) => expect(t).toHaveLength(3))
})

describe('any number of teams', () => {
  const field = (n: number, from = 0) => Array.from({ length: n }, (_, i) => p(`f${from + i}`, 'MID', 1 + ((from + i) % 5)))
  const gks = (n: number) => Array.from({ length: n }, (_, i) => p(`gk${i}`, 'GK', 3))
  const sizes = (teams: Player[][]) => teams.map((t) => t.length).sort((a, b) => b - a)
  const keepersPerTeam = (teams: Player[][]) => teams.map((t) => t.filter((pl) => pl.position === 'GK').length)

  it('13 players in 4 teams: sizes 4/3/3/3, a keeper for as many teams as there are keepers', () => {
    const { teams, needsGkAssignment } = balanceTeams([...gks(2), ...field(11)], 4)
    expect(teams).toHaveLength(4)
    expect(sizes(teams)).toEqual([4, 3, 3, 3])
    expect(keepersPerTeam(teams).filter((n) => n === 1)).toHaveLength(2)
    expect(needsGkAssignment).toBe(true)
  })

  it('12 players with 4 keepers in 4 teams: three each, one keeper each', () => {
    const { teams, needsGkAssignment } = balanceTeams([...gks(4), ...field(8)], 4)
    expect(sizes(teams)).toEqual([3, 3, 3, 3])
    expect(keepersPerTeam(teams)).toEqual([1, 1, 1, 1])
    expect(needsGkAssignment).toBe(false)
  })

  it('10 players in 2 teams of 5', () => {
    expect(sizes(balanceTeams(field(10), 2).teams)).toEqual([5, 5])
  })

  it('6 teams use every player once', () => {
    const players = [...gks(6), ...field(24)]
    const ids = balanceTeams(players, 6).teams.flat().map((pl) => pl.id).sort()
    expect(ids).toEqual(players.map((pl) => pl.id).sort())
  })
})
