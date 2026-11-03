-- A new board and its player positions become visible together.
CREATE FUNCTION public.create_lineup(p_id uuid, p_league_id uuid, p_board jsonb, p_spots jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.lineups AS l (id, league_id, name, drawings, guests, formation)
    VALUES (p_id, p_league_id, p_board->>'name', p_board->'drawings', p_board->'guests', p_board->>'formation')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, drawings = EXCLUDED.drawings,
      guests = EXCLUDED.guests, formation = EXCLUDED.formation, updated_at = now()
    WHERE l.league_id = EXCLUDED.league_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid lineup'; END IF;

  DELETE FROM public.lineup_players WHERE lineup_id = p_id;
  INSERT INTO public.lineup_players (lineup_id, player_id, x, y, bench_order)
    SELECT p_id, s.player_id, s.x, s.y, s.bench_order
    FROM jsonb_to_recordset(p_spots) AS s(player_id uuid, x real, y real, bench_order smallint);
END $$;
REVOKE ALL ON FUNCTION public.create_lineup(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_lineup(uuid, uuid, jsonb, jsonb) TO authenticated;
