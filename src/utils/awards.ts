import type { Match, MatchEvent, Player } from '../lib/types'

export interface TopPlayer {
  player: Player
  count: number
  rank: number
}

const COUNTED: Record<'goals' | 'assists', MatchEvent['event_type'][]> = {
  goals: ['goal', 'penalty_goal'],
  assists: ['assist'],
}

// Top 3 places (ties share a place, so more than 3 players can appear) from finished matches only.
export function topPlayers(players: Player[], events: MatchEvent[], matches: Match[], kind: 'goals' | 'assists'): TopPlayer[] {
  const finished = new Set(matches.filter((m) => m.status === 'completed').map((m) => m.id))
  const counts = new Map<string, number>()
  for (const e of events) {
    if (finished.has(e.match_id) && COUNTED[kind].includes(e.event_type)) {
      counts.set(e.player_id, (counts.get(e.player_id) ?? 0) + 1)
    }
  }
  const ranked = players
    .filter((p) => (counts.get(p.id) ?? 0) > 0)
    .map((player) => ({ player, count: counts.get(player.id)!, rank: 0 }))
    .sort((a, b) => b.count - a.count)
  ranked.forEach((r, i) => { r.rank = i > 0 && ranked[i - 1].count === r.count ? ranked[i - 1].rank : i + 1 })
  return ranked.filter((r) => r.rank <= 3)
}

export function tallyVotes(nomineeIds: string[], entries: { player_id: string }[]) {
  const rows = nomineeIds
    .map((playerId) => ({ playerId, votes: entries.filter((e) => e.player_id === playerId).length }))
    .sort((a, b) => b.votes - a.votes)
  const total = entries.length
  const top = rows[0]?.votes ?? 0
  return { rows, total, leaders: top > 0 ? rows.filter((r) => r.votes === top).map((r) => r.playerId) : [] }
}
