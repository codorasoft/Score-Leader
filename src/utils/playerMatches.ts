import type { Match, MatchEvent, Session, TeamPlayer } from '../lib/types'

export interface PlayedMatch {
  match: Match
  sessionDate: string
  teamId: string
  result: 'W' | 'D' | 'L'
  goalsFor: number
  goalsAgainst: number
}

interface Source {
  sessions: Pick<Session, 'id' | 'date'>[]
  matches: Match[]
  teamPlayers: TeamPlayer[]
  events: MatchEvent[]
}

const resultOf = (scored: number, conceded: number): PlayedMatch['result'] =>
  scored > conceded ? 'W' : scored === conceded ? 'D' : 'L'

// A win means outscoring the other team, as in player stats and standings.
export function matchesByPlayer(league: Source): Map<string, PlayedMatch[]> {
  const date = new Map(league.sessions.map((s) => [s.id, s.date]))
  const playersOfTeam = new Map<string, string[]>()
  for (const tp of league.teamPlayers) playersOfTeam.set(tp.team_id, [...(playersOfTeam.get(tp.team_id) ?? []), tp.player_id])

  const ordered = league.matches
    .filter((m) => m.status === 'completed')
    .sort((a, b) => (date.get(a.session_id) ?? '').localeCompare(date.get(b.session_id) ?? '') || a.match_number - b.match_number)

  const out = new Map<string, PlayedMatch[]>()
  for (const match of ordered) {
    for (const [teamId, scored, conceded] of [
      [match.team1_id, match.team1_score, match.team2_score],
      [match.team2_id, match.team2_score, match.team1_score],
    ] as const) {
      for (const playerId of playersOfTeam.get(teamId) ?? []) {
        const row: PlayedMatch = {
          match, sessionDate: date.get(match.session_id) ?? '', teamId,
          result: resultOf(scored, conceded), goalsFor: scored, goalsAgainst: conceded,
        }
        out.set(playerId, [...(out.get(playerId) ?? []), row])
      }
    }
  }
  return out
}

export interface Pair { a: string; b: string; matches: number; wins: number; draws: number }

export function partnerships(league: Source): Pair[] {
  const pairs = new Map<string, Pair>()
  const byPlayer = matchesByPlayer(league)
  // Group each match's players by side, then count every pair on the same side
  const sides = new Map<string, { players: string[]; result: PlayedMatch['result'] }>()
  for (const [playerId, played] of byPlayer) {
    for (const p of played) {
      const key = `${p.match.id}|${p.teamId}`
      const side = sides.get(key) ?? { players: [], result: p.result }
      side.players.push(playerId)
      sides.set(key, side)
    }
  }
  for (const { players, result } of sides.values()) {
    const sorted = [...players].sort()
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const key = `${sorted[i]}|${sorted[j]}`
        const pair = pairs.get(key) ?? { a: sorted[i], b: sorted[j], matches: 0, wins: 0, draws: 0 }
        pair.matches++
        if (result === 'W') pair.wins++
        else if (result === 'D') pair.draws++
        pairs.set(key, pair)
      }
    }
  }
  return [...pairs.values()]
}

export interface Partner { partnerId: string; matches: number; wins: number; winRate: number }

export function partnersOf(pairs: Pair[], playerId: string, minMatches: number) {
  const mine: Partner[] = pairs
    .filter((p) => (p.a === playerId || p.b === playerId) && p.matches >= minMatches)
    .map((p) => ({ partnerId: p.a === playerId ? p.b : p.a, matches: p.matches, wins: p.wins, winRate: p.wins / p.matches }))
  const sorted = [...mine].sort((x, y) => y.winRate - x.winRate || y.matches - x.matches)
  // With everyone level there is no "toughest" pairing; otherwise the lists never share a partner
  if (sorted.every((p) => p.winRate === sorted[0]?.winRate)) return { best: sorted.slice(0, 3), worst: [] }
  const bestCount = Math.min(3, Math.ceil(sorted.length / 2))
  return { best: sorted.slice(0, bestCount), worst: sorted.slice(bestCount).reverse().slice(0, 3) }
}
