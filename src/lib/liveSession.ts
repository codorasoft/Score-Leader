import { supabase } from './supabase'
import type { Match, MatchEvent, Player, Session, Team, TeamPlayer } from './types'

export interface LiveSession {
  session: Session
  teams: Team[]
  matches: Match[]
  events: MatchEvent[]
  // The session's team lists plus anyone named in an event, so swapped-in players still have names
  players: Player[]
}

// One request instead of four in a row: the database follows the links and nests the rows.
// Teams come from the session, not the match, because a match points at teams in several ways.
const SELECT = '*, teams(*, team_players(*, players(*))), matches(*, match_events(*, players(*)))'

type Row = Session & {
  teams: (Team & { team_players: (TeamPlayer & { players: Player | null })[] })[]
  matches: (Match & { match_events: (MatchEvent & { players: Player | null })[] })[]
}

export function unpackLiveSession({ teams: teamRows, matches: matchRows, ...session }: Row): LiveSession {
  const players = new Map<string, Player>()
  const teams = teamRows.map(({ team_players, ...team }) => {
    for (const tp of team_players) if (tp.players) players.set(tp.players.id, tp.players)
    return team
  })
  const events: MatchEvent[] = []
  const matches = matchRows.map(({ match_events, ...match }) => {
    for (const { players: p, ...event } of match_events) {
      events.push(event)
      if (p) players.set(p.id, p)
    }
    return match
  })
  return { session, teams, matches, events, players: [...players.values()] }
}

// Throws when the request fails; null means no session has this link.
export async function fetchLiveSession(token: string): Promise<LiveSession | null> {
  const { data, error } = await supabase.from('sessions').select(SELECT).eq('share_token', token).maybeSingle()
  if (error) throw error
  return data ? unpackLiveSession(data as unknown as Row) : null
}
