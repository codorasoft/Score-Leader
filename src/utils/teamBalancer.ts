import type { Player } from '../lib/types'

export interface BalanceResult {
  teams: [Player[], Player[], Player[]]
  needsGkAssignment: boolean
}

const shuffle = <T,>(items: T[]) => {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// Shuffling first means equally strong players land differently on each "Shuffle All",
// while the strength order (stable sort) still drives the balancing.
const byStrength = (players: Player[], strength: (p: Player) => number) =>
  shuffle(players).sort((a, b) => strength(b) - strength(a))

// One goalkeeper per team, then each player (strongest first) joins the weakest team
// that still has room. Team sizes differ by at most one.
export function balanceTeams(players: Player[], strength: (p: Player) => number = (p) => p.skill_rating): BalanceResult {
  const allGks = byStrength(players.filter((p) => p.position === 'GK'), strength)
  const gks = allGks.slice(0, 3)
  const field = byStrength([...allGks.slice(3), ...players.filter((p) => p.position !== 'GK')], strength)

  const caps = [0, 1, 2].map((i) => Math.floor(players.length / 3) + (i < players.length % 3 ? 1 : 0))
  const teams: [Player[], Player[], Player[]] = [[], [], []]
  const totals = [0, 0, 0]
  const add = (idx: number, p: Player) => { teams[idx].push(p); totals[idx] += strength(p) }

  gks.forEach((gk, i) => add(i, gk))
  for (const p of field) {
    const open = [0, 1, 2].filter((i) => teams[i].length < caps[i])
    const target = open.sort((a, b) => totals[a] - totals[b] || teams[a].length - teams[b].length || a - b)[0]
    add(target, p)
  }

  return { teams, needsGkAssignment: gks.length < 3 }
}
