import type { LeagueData } from './playerOfMonth'
import { matchesByPlayer } from './playerMatches'
import { formRatings } from './playerForm'
import { playerCard, type CardInput, type PlayerCard } from './playerCard'

export function cardsForLeague(league: LeagueData): Map<string, { card: PlayerCard; input: CardInput }> {
  const played = matchesByPlayer(league)
  // Keep the full roster for match history and swaps. Only requested cards need a form rating.
  const cardPlayerIds = new Set(league.players.map((p) => p.id))
  const form = formRatings({
    ...league,
    teamPlayers: league.teamPlayers.filter((tp) => cardPlayerIds.has(tp.player_id)),
  })
  const completedIds = new Set(league.matches.filter((m) => m.status === 'completed').map((m) => m.id))
  const count = (playerId: string, types: string[]) =>
    league.events.filter((e) => e.player_id === playerId && completedIds.has(e.match_id) && types.includes(e.event_type)).length

  return new Map(league.players.map((p) => {
    const list = played.get(p.id) ?? []
    const input: CardInput = {
      stars: p.skill_rating,
      position: p.position,
      matches: list.length,
      wins: list.filter((x) => x.result === 'W').length,
      goals: count(p.id, ['goal', 'penalty_goal']),
      assists: count(p.id, ['assist']),
      cleanSheets: list.filter((x) => x.goalsAgainst === 0).length,
      form: form.get(p.id),
    }
    return [p.id, { card: playerCard(input), input }]
  }))
}
