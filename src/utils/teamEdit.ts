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

// The arrangement as saved with the session until the teams are confirmed: player ids per team
export const draftOf = (teams: Teams): string[][] => teams.map((team) => team.map((p) => p.id))

// The saved arrangement as teams of these players, or null when it no longer fits: nothing usable
// was saved, the session has a different number of teams, or it is not exactly the players
// attending now (someone was added or removed since).
export function restoreDraft(raw: unknown, attendees: Player[], teamCount: number): Teams | null {
  if (!Array.isArray(raw) || raw.length !== teamCount) return null
  if (!raw.every((team) => Array.isArray(team) && team.every((id) => typeof id === 'string'))) return null
  const ids = (raw as string[][]).flat()
  const byId = new Map(attendees.map((p) => [p.id, p]))
  if (ids.length !== byId.size || new Set(ids).size !== ids.length || !ids.every((id) => byId.has(id))) return null
  return (raw as string[][]).map((team) => team.map((id) => byId.get(id)!))
}

export const teamStars = (team: Player[]) => team.reduce((sum, p) => sum + p.skill_rating, 0)
