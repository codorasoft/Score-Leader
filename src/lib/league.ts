import { supabase } from './supabase'
import { selectAll } from './selectAll'
import type { LeagueData } from '../utils/playerOfMonth'
import type { Match, MatchEvent, Player, Session, SessionAward, Team, TeamPlayer } from './types'

export interface FullLeague extends LeagueData {
  teams: Team[]
  awards: SessionAward[]
}

// Everyone's finished results; used for Player of the Month, records, cards and partnerships.
export async function loadLeague(leagueId: string): Promise<FullLeague> {
  const [players, sessions, matches, events, teamPlayers, teams, awards] = await Promise.all([
    selectAll<Player>((a, b) => supabase.from('players').select('*').eq('league_id', leagueId).range(a, b)),
    selectAll<Session>((a, b) => supabase.from('sessions').select('*').eq('league_id', leagueId).range(a, b)),
    selectAll<Match>((a, b) => supabase.from('matches').select('*').eq('league_id', leagueId).eq('status', 'completed').range(a, b)),
    selectAll<MatchEvent>((a, b) => supabase.from('match_events').select('*').eq('league_id', leagueId).range(a, b)),
    selectAll<TeamPlayer>((a, b) => supabase.from('team_players').select('*').eq('league_id', leagueId).range(a, b)),
    selectAll<Team>((a, b) => supabase.from('teams').select('*').eq('league_id', leagueId).range(a, b)),
    selectAll<SessionAward>((a, b) => supabase.from('session_awards').select('*').eq('league_id', leagueId).range(a, b)),
  ])
  return { players, sessions, matches, events, teamPlayers, teams, awards }
}
