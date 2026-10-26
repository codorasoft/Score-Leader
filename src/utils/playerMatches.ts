import type { Match, MatchEvent, Session, TeamPlayer } from '../lib/types'

// matchId → playerId → the team that player was on in that match
export type MatchRosters = Map<string, Map<string, string>>

// A swap pair: each row's team_id is the team that player moved to
interface SwapPair { a: MatchEvent; b: MatchEvent }

// Before kick-off the clock has not started, so the swap counts from this match on. A swap made
// once the match is under way counts from the next match: the player started this one on the old team.
const beforeKickOff = (e: MatchEvent) => (e.period ?? 1) === 1 && !e.elapsed_seconds

// team_players holds each player's team at the end of the session, after every swap. Undoing the
// session's swaps from last to first gives the teams it started with; replaying them in match
// order gives who was on which team in each match.
export function matchRosters(src: {
  matches: Match[]
  teamPlayers: Pick<TeamPlayer, 'team_id' | 'player_id'>[]
  events: MatchEvent[]
}): MatchRosters {
  const sessionOfTeam = new Map<string, string>()
  for (const m of src.matches) {
    sessionOfTeam.set(m.team1_id, m.session_id)
    sessionOfTeam.set(m.team2_id, m.session_id)
  }
  const matchById = new Map(src.matches.map((m) => [m.id, m]))

  // Each session's teams as they are now
  const now = new Map<string, Map<string, string>>()
  for (const tp of src.teamPlayers) {
    const session = sessionOfTeam.get(tp.team_id)
    if (!session) continue
    if (!now.has(session)) now.set(session, new Map())
    now.get(session)!.set(tp.player_id, tp.team_id)
  }

  // Swap pairs per session, in the order they were made; a swap in a match that is not listed
  // (one never finished) still moved the players, after every listed match
  const swapRows = src.events.filter((e) => e.event_type === 'swap')
  const swapById = new Map(swapRows.map((e) => [e.id, e]))
  const swaps = new Map<string, SwapPair[]>()
  for (const b of swapRows) {
    if (!b.related_event_id) continue
    const a = swapById.get(b.related_event_id)
    const session = a && sessionOfTeam.get(a.team_id)
    if (!a || !session) continue
    swaps.set(session, [...(swaps.get(session) ?? []), { a, b }])
  }
  const order = (pair: SwapPair) => matchById.get(pair.a.match_id)?.match_number ?? Infinity
  for (const list of swaps.values()) list.sort((x, y) => order(x) - order(y) || x.a.created_at.localeCompare(y.a.created_at))

  const apply = (teams: Map<string, string>, { a, b }: SwapPair) => {
    teams.set(a.player_id, a.team_id)
    teams.set(b.player_id, b.team_id)
  }
  const undo = (teams: Map<string, string>, { a, b }: SwapPair) => {
    teams.set(a.player_id, b.team_id)
    teams.set(b.player_id, a.team_id)
  }

  const rosters: MatchRosters = new Map()
  const bySession = new Map<string, Match[]>()
  for (const m of src.matches) bySession.set(m.session_id, [...(bySession.get(m.session_id) ?? []), m])
  for (const [session, matches] of bySession) {
    const list = swaps.get(session) ?? []
    const teams = new Map(now.get(session) ?? [])
    for (const pair of [...list].reverse()) undo(teams, pair)
    for (const m of [...matches].sort((x, y) => x.match_number - y.match_number)) {
      const inMatch = list.filter((pair) => pair.a.match_id === m.id)
      for (const pair of inMatch) if (beforeKickOff(pair.a)) apply(teams, pair)
      rosters.set(m.id, new Map(teams))
      for (const pair of inMatch) if (!beforeKickOff(pair.a)) apply(teams, pair)
    }
  }
  return rosters
}

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
  const rosters = matchRosters(league)

  const ordered = league.matches
    .filter((m) => m.status === 'completed')
    .sort((a, b) => (date.get(a.session_id) ?? '').localeCompare(date.get(b.session_id) ?? '') || a.match_number - b.match_number)

  const out = new Map<string, PlayedMatch[]>()
  for (const match of ordered) {
    for (const [teamId, scored, conceded] of [
      [match.team1_id, match.team1_score, match.team2_score],
      [match.team2_id, match.team2_score, match.team1_score],
    ] as const) {
      for (const [playerId, onTeam] of rosters.get(match.id) ?? []) {
        if (onTeam !== teamId) continue
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
