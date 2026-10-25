-- Takes a session whose teams were confirmed back to picking teams, as long as nothing has been
-- played: no match ended and no goal, assist or card recorded. Match 1 (and any match set up
-- after it) and the teams are removed, and the session is a draft again. The confirmed teams are
-- kept as the draft arrangement (p_draft_teams: player ids per team, in the app's colour order),
-- so the team builder opens on the same teams instead of a new shuffle. With the caller's rights
-- (SECURITY INVOKER), like confirm_teams, so the row-level rules decide who may do it.
-- Returns false, with nothing changed, when the session is not under way or has been played.
CREATE FUNCTION public.reopen_teams(p_session_id uuid, p_draft_teams jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  PERFORM 1 FROM public.sessions WHERE id = p_session_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  IF EXISTS (SELECT 1 FROM public.matches WHERE session_id = p_session_id AND status = 'completed')
     OR EXISTS (SELECT 1 FROM public.match_events e JOIN public.matches m ON m.id = e.match_id
                WHERE m.session_id = p_session_id) THEN
    RETURN false;
  END IF;

  -- Matches point at the teams, so they go first; their events go with them (ON DELETE CASCADE)
  DELETE FROM public.matches WHERE session_id = p_session_id;
  -- team_players go with their teams (ON DELETE CASCADE)
  DELETE FROM public.teams WHERE session_id = p_session_id;
  UPDATE public.sessions SET status = 'draft', draft_teams = p_draft_teams WHERE id = p_session_id;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.reopen_teams(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_teams(uuid, jsonb) TO authenticated;
