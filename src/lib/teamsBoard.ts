import { supabase } from './supabase'
import { labelSpotsForTeams, spotsForTeams } from '../utils/board'
import type { TeamColor } from './types'

// A new coach board with every team on it, a row each in the order given, with the team's name
// (label) above its row. Returns the board's id, or null when it could not be saved; a board
// whose players could not be placed is removed again, so no empty board is left in the list.
export async function createTeamsBoard(leagueId: string, name: string, teams: { color: TeamColor; label: string; playerIds: string[] }[]) {
  const id = crypto.randomUUID()
  const rows = teams.map((tm) => tm.playerIds)
  const labelSpots = labelSpotsForTeams(rows)
  const drawings = teams.flatMap((tm, i) => (rows[i].length
    ? [{ id: crypto.randomUUID(), kind: 'label' as const, team: tm.color, text: tm.label, ...labelSpots[i] }]
    : []))
  const { error } = await supabase.from('lineups').insert({ id, league_id: leagueId, name: name.slice(0, 80), drawings, guests: [] })
  if (error) return null
  const spots = spotsForTeams(rows).map((b) => ({ lineup_id: id, player_id: b.playerId, x: b.x, y: b.y }))
  const placed = await supabase.from('lineup_players').insert(spots)
  if (!placed.error) return id
  await supabase.from('lineups').delete().eq('id', id)
  return null
}
