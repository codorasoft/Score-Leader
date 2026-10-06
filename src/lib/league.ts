import { supabase } from './supabase'
import { selectAll } from './selectAll'
import { cachedLoad } from './leagueCache'
import type { LeagueData } from '../utils/playerOfMonth'
import type { Match, MatchEvent, Player, Session, SessionAward, Team, TeamPlayer } from './types'

export interface FullLeague extends LeagueData {
  teams: Team[]
  awards: SessionAward[]
}

// Everyone's finished results; used for the leaderboard, Player of the Month, records, cards and
// partnerships. Kept for a minute so moving between those pages downloads it once.
export function loadLeague(leagueId: string): Promise<FullLeague> {
  return cachedLoad(leagueId, async () => {
    let complete = true
    const failed = () => { complete = false }
    const [players, sessions, matches, events, teamPlayers, teams, awards] = await Promise.all([
      selectAll<Player>((a, b) => supabase.from('players').select('*').eq('league_id', leagueId).range(a, b), failed),
      selectAll<Session>((a, b) => supabase.from('sessions').select('*').eq('league_id', leagueId).range(a, b), failed),
      selectAll<Match>((a, b) => supabase.from('matches').select('*').eq('league_id', leagueId).eq('status', 'completed').range(a, b), failed),
      selectAll<MatchEvent>((a, b) => supabase.from('match_events').select('*').eq('league_id', leagueId).range(a, b), failed),
      selectAll<TeamPlayer>((a, b) => supabase.from('team_players').select('*').eq('league_id', leagueId).range(a, b), failed),
      selectAll<Team>((a, b) => supabase.from('teams').select('*').eq('league_id', leagueId).range(a, b), failed),
      selectAll<SessionAward>((a, b) => supabase.from('session_awards').select('*').eq('league_id', leagueId).range(a, b), failed),
    ])
    return { value: { players, sessions, matches, events, teamPlayers, teams, awards }, complete }
  })
}
