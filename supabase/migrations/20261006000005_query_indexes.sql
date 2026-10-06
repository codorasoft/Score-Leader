-- Indexes for the columns pages filter on that had none. league_id, team_players.team_id,
-- session_players.session_id and the vote tables were already indexed. No data changes.

-- Session page, match tracker, live score page (and its realtime filter on session_id)
CREATE INDEX IF NOT EXISTS matches_session_id_idx ON public.matches (session_id);
CREATE INDEX IF NOT EXISTS teams_session_id_idx ON public.teams (session_id);

-- Match events by match (timelines, live realtime filter), by player (profiles, team balancing)
-- and by the goal an assist or swap belongs to (undo, removing a goal)
CREATE INDEX IF NOT EXISTS match_events_match_id_idx ON public.match_events (match_id);
CREATE INDEX IF NOT EXISTS match_events_player_id_idx ON public.match_events (player_id);
CREATE INDEX IF NOT EXISTS match_events_related_event_id_idx ON public.match_events (related_event_id);

-- Player profiles and team balancing look up a player's teams
CREATE INDEX IF NOT EXISTS team_players_player_id_idx ON public.team_players (player_id);

-- Awards and votes of a session; a player's awards on their profile
CREATE INDEX IF NOT EXISTS session_awards_session_id_idx ON public.session_awards (session_id);
CREATE INDEX IF NOT EXISTS session_awards_winner_player_id_idx ON public.session_awards (winner_player_id);
CREATE INDEX IF NOT EXISTS award_votes_session_id_idx ON public.award_votes (session_id);
