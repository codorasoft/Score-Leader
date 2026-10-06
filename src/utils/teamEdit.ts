import type { Player } from '../lib/types'

// One list of players per team, in colour order
export type Teams = Player[][]

const copy = (teams: Teams) => teams.map((t) => [...t]) as Teams
const teamOf = (teams: Teams, id: string) => teams.findIndex((t) => t.some((p) => p.id === id))

export function swapPlayers(teams: Teams, aId: string, bId: string): Teams {
  const ta = teamOf(teams, aId)
  const tb = teamOf(teams, bId)
  if (ta === -1 || tb === -1 || ta === tb) return teams
  const next = copy(teams)
  const ia = next[ta].findIndex((p) => p.id === aId)
  const ib = next[tb].findIndex((p) => p.id === bId)
  ;[next[ta][ia], next[tb][ib]] = [next[tb][ib], next[ta][ia]]
  return next
}

export function movePlayer(teams: Teams, playerId: string, toTeam: number): Teams {
  const from = teamOf(teams, playerId)
  if (from === -1 || from === toTeam) return teams
  const next = copy(teams)
  const [player] = next[from].splice(next[from].findIndex((p) => p.id === playerId), 1)
  next[toTeam].push(player)
  return next
}

export const teamStars = (team: Player[]) => team.reduce((sum, p) => sum + p.skill_rating, 0)
