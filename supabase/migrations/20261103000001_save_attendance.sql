-- Attendance and guest changes commit together. Existing rows are untouched on installation.
CREATE FUNCTION public.save_attendance(p_session_id uuid, p_players uuid[], p_guests jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  booking public.sessions;
  removed uuid[];
BEGIN
  SELECT * INTO STRICT booking FROM public.sessions WHERE id = p_session_id FOR UPDATE;
  IF booking.status <> 'draft' OR p_players IS NULL
      OR cardinality(p_players) NOT BETWEEN booking.team_count AND booking.team_count * booking.team_size
      OR cardinality(p_players) <> (SELECT count(DISTINCT id) FROM unnest(p_players) AS pick(id)) THEN
    RAISE EXCEPTION 'Invalid attendance for this booking';
  END IF;

  INSERT INTO public.players (id, league_id, name, position, skill_rating, is_guest)
    SELECT g.id, booking.league_id, trim(g.name), 'MID', 3, true
    FROM jsonb_to_recordset(p_guests) AS g(id uuid, name text)
    WHERE g.id = ANY(p_players) AND length(trim(g.name)) BETWEEN 1 AND 40
      AND NOT EXISTS (
        SELECT 1 FROM public.session_players sp WHERE sp.session_id = booking.id AND sp.player_id = g.id
      );

  IF EXISTS (SELECT 1 FROM unnest(p_players) AS pick(id)
      LEFT JOIN public.players p ON p.id = pick.id AND p.league_id = booking.league_id
      WHERE p.id IS NULL OR (p.is_guest AND NOT EXISTS (
        SELECT 1 FROM public.session_players sp WHERE sp.session_id = booking.id AND sp.player_id = p.id
      ) AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(p_guests) AS g(id uuid) WHERE g.id = p.id))) THEN
    RAISE EXCEPTION 'Invalid player for this booking';
  END IF;

  WITH dropped AS (
    DELETE FROM public.session_players
    WHERE session_id = booking.id AND NOT (player_id = ANY(p_players))
    RETURNING player_id
  ) SELECT array_agg(player_id) INTO removed FROM dropped;

  INSERT INTO public.session_players (session_id, player_id)
    SELECT booking.id, id FROM unnest(p_players) AS pick(id)
    ON CONFLICT (session_id, player_id) DO NOTHING;

  -- Keep historical references, including any saved lineup that still uses this guest.
  UPDATE public.players p SET is_active = false
    WHERE p.id = ANY(removed) AND p.is_guest AND NOT EXISTS (
      SELECT 1 FROM public.session_players sp WHERE sp.player_id = p.id
    );
END $$;
REVOKE ALL ON FUNCTION public.save_attendance(uuid, uuid[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_attendance(uuid, uuid[], jsonb) TO authenticated;
