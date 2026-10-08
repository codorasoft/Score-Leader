import { supabase } from './supabase'
import type { LeagueInfo } from './tenancy'
import type { Match, MatchEvent, Player, Session, Team, TeamPlayer } from './types'

export interface SessionData {
  session: Session
  teams: Team[]
  teamPlayers: TeamPlayer[]
  // In match order
  matches: Match[]
  // Every match's goals, cards and swaps
  events: MatchEvent[]
  // The session's team lists plus anyone named in an event, so swapped-in players still have names
  players: Player[]
}

// One request instead of several in a row: the database follows the links and nests the rows.
// Teams come from the session, not the match, because a match points at teams in several ways.
const SELECT = '*, teams(*, team_players(*, players(*))), matches(*, match_events(*, players(*)))'

type Row = Session & {
  teams: (Team & { team_players: (TeamPlayer & { players: Player | null })[] })[]
  matches: (Match & { match_events: (MatchEvent & { players: Player | null })[] })[]
}

export function unpackSession({ teams: teamRows, matches: matchRows, ...session }: Row): SessionData {
  const players = new Map<string, Player>()
  const teamPlayers: TeamPlayer[] = []
  const teams = teamRows.map(({ team_players, ...team }) => {
    for (const { players: p, ...tp } of team_players) {
      teamPlayers.push(tp)
      if (p) players.set(p.id, p)
    }
    return team
  })
  const events: MatchEvent[] = []
  const matches = matchRows.map(({ match_events, ...match }) => {
    for (const { players: p, ...event } of match_events) {
      events.push(event)
      if (p) players.set(p.id, p)
    }
    return match
  }).sort((a, b) => a.match_number - b.match_number)
  return { session, teams, teamPlayers, matches, events, players: [...players.values()] }
}

// A live link's route loads the league and the whole session together; the page then takes that
// session once instead of asking again. Later loads (live refreshes) always ask.
const primed = new Map<string, SessionData>()

export interface LiveLink {
  // null when the league is gone or not available
  league: LeagueInfo | null
  session: SessionData
}

// Everything a /s/:token visit needs in one request. Throws when the request fails; null means no such link.
export async function fetchLiveLink(token: string): Promise<LiveLink | null> {
  const { data, error } = await supabase.from('sessions').select(`${SELECT}, league_directory(*)`).eq('share_token', token).maybeSingle()
  if (error) throw error
  if (!data) return null
  const { league_directory, ...row } = data as unknown as Row & { league_directory: LeagueInfo | null }
  const session = unpackSession(row)
  primed.set(token, session)
  return { league: league_directory ?? null, session }
}

// By share link (public live page) or id (admin, only within the given league).
// Throws the request's error when it fails; null means no such session.
export async function fetchSession(by: 'share_token' | 'id', value: string, leagueId?: string): Promise<SessionData | null> {
  if (by === 'share_token') {
    const ready = primed.get(value)
    primed.delete(value)
    if (ready) return ready
  }
  let query = supabase.from('sessions').select(SELECT).eq(by, value)
  if (leagueId) query = query.eq('league_id', leagueId)
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data ? unpackSession(data as unknown as Row) : null
}
