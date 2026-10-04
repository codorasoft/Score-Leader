import type { Player } from '../lib/types'

export interface BalanceResult {
  teams: [Player[], Player[], Player[]]
  needsGkAssignment: boolean
}

export function balanceTeams(players: Player[]): BalanceResult {
  const gks = players.filter((p) => p.position === 'GK').slice(0, 3)
  const field = players
    .filter((p) => p.position !== 'GK')
    .sort((a, b) => b.skill_rating - a.skill_rating)

  const needsGkAssignment = gks.length < 3

  const teams: [Player[], Player[], Player[]] = [
    gks[0] ? [gks[0]] : [],
    gks[1] ? [gks[1]] : [],
    gks[2] ? [gks[2]] : [],
  ]

  // Snake draft: round even → forward (0,1,2), round odd → backward (2,1,0)
  field.forEach((player, i) => {
    const teamIdx = i % 6 < 3 ? i % 3 : 2 - (i % 3)
    teams[teamIdx].push(player)
  })

  return { teams, needsGkAssignment }
}
