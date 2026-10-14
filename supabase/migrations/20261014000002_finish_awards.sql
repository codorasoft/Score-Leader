-- Finishing a session's awards was several separate requests (each open vote, its nominees, the
-- awards, then closing the session). A failure partway left some of them behind, and tapping
-- Finish again added another open vote and duplicate awards. It is now one function call that
-- saves everything or nothing, with the caller's rights (SECURITY INVOKER), as confirm_teams and
-- finish_match do.

-- p_awards: [{ "award_type", "winner_player_id", "decided_by", "is_tied" }]
-- p_votes:  [{ "award_type", "vote_token", "nominees": [player ids] }]
-- Returns the session's open votes as [{ "award_type", "vote_token" }]. A session already
-- finished is left as it is and its open votes are returned, so a second tap shows the same links.
-- On a session not finished yet, award rows can only be what an earlier try left when it failed
-- partway (sessions are never reopened, and those links were never shown): they are replaced.
CREATE FUNCTION public.finish_awards(p_session_id uuid, p_awards jsonb, p_votes jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_status public.session_status;
  v_vote jsonb;
  v_vote_id uuid;
BEGIN
  SELECT status INTO v_status FROM public.sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session not found'; END IF;

  IF v_status <> 'completed' THEN
    DELETE FROM public.award_votes WHERE session_id = p_session_id;
    DELETE FROM public.session_awards WHERE session_id = p_session_id;

    FOR v_vote IN SELECT value FROM jsonb_array_elements(p_votes) LOOP
      INSERT INTO public.award_votes (session_id, award_type, status, decided_by, vote_token)
      VALUES (p_session_id, v_vote ->> 'award_type', 'open', 'vote', v_vote ->> 'vote_token')
      RETURNING id INTO v_vote_id;
      INSERT INTO public.award_vote_nominations (award_vote_id, player_id)
      SELECT v_vote_id, n.player_id::uuid FROM jsonb_array_elements_text(v_vote -> 'nominees') AS n(player_id);
    END LOOP;

    INSERT INTO public.session_awards (session_id, award_type, winner_player_id, decided_by, is_tied)
    SELECT p_session_id, (a ->> 'award_type')::public.award_type, (a ->> 'winner_player_id')::uuid,
           (a ->> 'decided_by')::public.award_decided_by, coalesce((a ->> 'is_tied')::boolean, false)
    FROM jsonb_array_elements(p_awards) a;

    UPDATE public.sessions SET status = 'completed' WHERE id = p_session_id;
  END IF;

  RETURN coalesce(
    (SELECT jsonb_agg(jsonb_build_object('award_type', award_type, 'vote_token', vote_token) ORDER BY award_type)
       FROM public.award_votes WHERE session_id = p_session_id AND status = 'open'),
    '[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.finish_awards(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_awards(uuid, jsonb, jsonb) TO authenticated;
