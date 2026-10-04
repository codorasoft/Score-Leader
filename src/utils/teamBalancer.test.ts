import { balanceTeams } from './teamBalancer'
import type { Player } from '../lib/types'

const p = (id: string, pos: Player['position'], skill: number): Player => ({
  id, name: id, position: pos, skill_rating: skill,
  photo_url: null, is_active: true, created_at: '',
})

it('assigns exactly one GK to each team when 3 GKs present', () => {
  const players = [
    p('gk1', 'GK', 3), p('gk2', 'GK', 3), p('gk3', 'GK', 3),
    ...Array.from({ length: 12 }, (_, i) => p(`f${i}`, 'DEF', (i % 5) + 1)),
  ]
  const { teams } = balanceTeams(players)
  teams.forEach((t) => expect(t.filter((pl) => pl.position === 'GK')).toHaveLength(1))
})

it('sets needsGkAssignment when fewer than 3 GKs', () => {
  const players = [
    p('gk1', 'GK', 3),
    ...Array.from({ length: 14 }, (_, i) => p(`f${i}`, 'MID', 3)),
  ]
  expect(balanceTeams(players).needsGkAssignment).toBe(true)
})

it('produces 3 equal-size teams for 15 players', () => {
  const players = Array.from({ length: 15 }, (_, i) =>
    p(`p${i}`, i < 3 ? 'GK' : 'MID', (i % 5) + 1))
  const { teams } = balanceTeams(players)
  teams.forEach((t) => expect(t).toHaveLength(5))
})

it('snake draft balances total skill within 2 points', () => {
  const players = Array.from({ length: 15 }, (_, i) =>
    p(`p${i}`, i < 3 ? 'GK' : 'ATT', (i % 5) + 1))
  const { teams } = balanceTeams(players)
  const sums = teams.map((t) => t.reduce((a, pl) => a + pl.skill_rating, 0))
  expect(Math.max(...sums) - Math.min(...sums)).toBeLessThanOrEqual(2)
})

it('handles 9 players (3 per team)', () => {
  const players = Array.from({ length: 9 }, (_, i) =>
    p(`p${i}`, i < 3 ? 'GK' : 'MID', 3))
  const { teams } = balanceTeams(players)
  teams.forEach((t) => expect(t).toHaveLength(3))
})
