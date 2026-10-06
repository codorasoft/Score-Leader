import type { Player } from '../lib/types'

export interface BalanceResult {
  teams: Player[][]
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
// that still has room. Team sizes differ by at most one. `synergy` adds extra strength for
// pairs that win a lot together, so strong duos tend to be split across teams.
export function balanceTeams(
  players: Player[],
  teamCount: number,
  strength: (p: Player) => number = (p) => p.skill_rating,
  synergy: (a: Player, b: Player) => number = () => 0,
): BalanceResult {
  const allGks = byStrength(players.filter((p) => p.position === 'GK'), strength)
  const gks = allGks.slice(0, teamCount)
  const field = byStrength([...allGks.slice(teamCount), ...players.filter((p) => p.position !== 'GK')], strength)

  const slots = Array.from({ length: teamCount }, (_, i) => i)
  const caps = slots.map((i) => Math.floor(players.length / teamCount) + (i < players.length % teamCount ? 1 : 0))
  const teams: Player[][] = slots.map(() => [])
  const totals = slots.map(() => 0)
  const gain = (idx: number, p: Player) => strength(p) + teams[idx].reduce((n, q) => n + synergy(p, q), 0)
  const add = (idx: number, p: Player) => { totals[idx] += gain(idx, p); teams[idx].push(p) }

  gks.forEach((gk, i) => add(i, gk))
  for (const p of field) {
    const open = slots.filter((i) => teams[i].length < caps[i])
    const after = (i: number) => totals[i] + gain(i, p)
    const target = open.sort((a, b) => after(a) - after(b) || teams[a].length - teams[b].length || a - b)[0]
    add(target, p)
  }

  improveBySwaps(teams, strength, synergy)
  return { teams, needsGkAssignment: gks.length < teamCount }
}

const MAX_SWAP_ROUNDS = 50

// Placing players one at a time can leave the last ones no choice (team sizes are fixed), so
// afterwards swap outfield players between teams while that narrows the gap between teams.
function improveBySwaps(teams: Player[][], strength: (p: Player) => number, synergy: (a: Player, b: Player) => number) {
  const teamTotal = (team: Player[]) =>
    team.reduce((n, p, i) => n + strength(p) + team.slice(i + 1).reduce((m, q) => m + synergy(p, q), 0), 0)
  const spread = () => {
    const totals = teams.map(teamTotal)
    return Math.max(...totals) - Math.min(...totals)
  }
  for (let round = 0; round < MAX_SWAP_ROUNDS; round++) {
    let current = spread()
    let improved = false
    for (let a = 0; a < teams.length; a++) {
      for (let b = a + 1; b < teams.length; b++) {
        for (let i = 0; i < teams[a].length; i++) {
          for (let j = 0; j < teams[b].length; j++) {
            if (teams[a][i].position === 'GK' || teams[b][j].position === 'GK') continue
            ;[teams[a][i], teams[b][j]] = [teams[b][j], teams[a][i]]
            const next = spread()
            if (next < current - 1e-9) { current = next; improved = true }
            else [teams[a][i], teams[b][j]] = [teams[b][j], teams[a][i]]
          }
        }
      }
    }
    if (!improved) return
  }
}
