-- Two steps of running a session were several separate requests from the phone, so a failed
-- request partway (common on a pitch's mobile signal) left them half done:
--   * confirming teams: teams saved but no players on them, or no match 1, and a second tap
--     then saved a second set of teams
--   * ending a match: the result saved but no next match, after which the app closed the session
-- Each is now one function call that saves everything or nothing. Both run with the caller's
-- rights (SECURITY INVOKER), so the existing row-level rules decide who may do it, as before.
-- Both lock their row first, so a second tap waits for the first and then gets its result.

-- Confirms a session's teams and sets up match 1. p_teams: [{ "id", "color", "player_ids": [..] }]
-- with ids made by the app, so it can choose the first match's teams (p_team1, p_team2, and
-- p_queue waiting in order) before the call. Returns match 1's id. When the teams were already
-- confirmed, nothing is saved and match 1's id is returned, or NULL if that match is gone.
CREATE FUNCTION public.confirm_teams(p_session_id uuid, p_teams jsonb, p_team1 uuid, p_team2 uuid, p_queue uuid[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_team_ids uuid[];
  v_match uuid;
BEGIN
  PERFORM 1 FROM public.sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session not found'; END IF;

  IF EXISTS (SELECT 1 FROM public.teams WHERE session_id = p_session_id) THEN
    SELECT id INTO v_match FROM public.matches WHERE session_id = p_session_id AND match_number = 1;
    RETURN v_match;
  END IF;

  v_team_ids := ARRAY(SELECT (t ->> 'id')::uuid FROM jsonb_array_elements(p_teams) t);
  IF p_team1 = p_team2 OR NOT ((ARRAY[p_team1, p_team2] || p_queue) <@ v_team_ids) THEN
    RAISE EXCEPTION 'the first match must be between two of the teams given';
  END IF;

  INSERT INTO public.teams (id, session_id, color)
  SELECT (t ->> 'id')::uuid, p_session_id, (t ->> 'color')::public.team_color
  FROM jsonb_array_elements(p_teams) t;

  INSERT INTO public.team_players (team_id, player_id)
  SELECT (t ->> 'id')::uuid, p.player_id::uuid
  FROM jsonb_array_elements(p_teams) t, jsonb_array_elements_text(t -> 'player_ids') AS p(player_id);

  -- The arrangement kept while teams were being picked is no longer needed
  UPDATE public.sessions SET status = 'active', draft_teams = NULL WHERE id = p_session_id;

  INSERT INTO public.matches (session_id, match_number, period, team1_id, team2_id, queue, waiting_team_id, status)
  VALUES (p_session_id, 1, 1, p_team1, p_team2, p_queue, p_queue[1], 'pending')
  RETURNING id INTO v_match;
  RETURN v_match;
END $$;

REVOKE ALL ON FUNCTION public.confirm_teams(uuid, jsonb, uuid, uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_teams(uuid, jsonb, uuid, uuid, uuid[]) TO authenticated;

-- Saves a match's result and sets up the next match (p_next_team1 against p_next_team2, with
-- p_next_queue waiting in order). Returns the next match's id. A match already ended keeps the
-- result it has, and a next match already set up is returned instead of a second one.
CREATE FUNCTION public.finish_match(
  p_match_id uuid,
  p_is_draw boolean,
  p_winner_team_id uuid,
  p_draw_resolved_by text,
  p_penalties_team1 integer,
  p_penalties_team2 integer,
  p_elapsed_seconds integer,
  p_period_seconds integer[],
  p_next_team1 uuid,
  p_next_team2 uuid,
  p_next_queue uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_match public.matches;
  v_next uuid;
BEGIN
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;

  IF v_match.status <> 'completed' THEN
    UPDATE public.matches
       SET is_draw = p_is_draw, winner_team_id = p_winner_team_id, draw_resolved_by = p_draw_resolved_by,
           penalties_team1 = p_penalties_team1, penalties_team2 = p_penalties_team2,
           status = 'completed', timer_status = 'stopped', timer_started_at = NULL,
           timer_elapsed_seconds = p_elapsed_seconds, period_seconds = p_period_seconds
     WHERE id = p_match_id;
  END IF;

  SELECT id INTO v_next FROM public.matches
   WHERE session_id = v_match.session_id AND match_number = v_match.match_number + 1;
  IF v_next IS NULL THEN
    INSERT INTO public.matches (session_id, match_number, period, team1_id, team2_id, queue, waiting_team_id, status)
    VALUES (v_match.session_id, v_match.match_number + 1, 1, p_next_team1, p_next_team2, p_next_queue,
            p_next_queue[1], 'pending')
    RETURNING id INTO v_next;
  END IF;
  RETURN v_next;
END $$;

REVOKE ALL ON FUNCTION public.finish_match(uuid, boolean, uuid, text, integer, integer, integer, integer[], uuid, uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_match(uuid, boolean, uuid, text, integer, integer, integer, integer[], uuid, uuid, uuid[]) TO authenticated;
