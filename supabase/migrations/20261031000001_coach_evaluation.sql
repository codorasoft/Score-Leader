-- Coach evaluation: the coach's own record of the team's trainings and real matches (friendly,
-- official, league), with each player's attendance, the role and position they played, and the
-- coach's 1-10 rating. The coach ranking is worked out from these in the app
-- (src/utils/coachRating.ts). Only adds; nothing existing changes, and nobody has the feature
-- until the superadmin ticks it.

-- ===== Feature key

-- The same checks as before, with 'coach_eval' as the 17th key (supabase/functions/_shared/features.ts)
CREATE OR REPLACE FUNCTION public.valid_features(f text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT f IS NOT NULL
    AND f <@ ARRAY[
      'cards', 'swaps', 'smart_balancing', 'awards', 'voting', 'leaderboard', 'potm',
      'profiles', 'badges', 'records', 'player_cards', 'photos', 'summary_share', 'coach_board',
      'training', 'schedule', 'coach_eval'
    ]::text[]
    AND cardinality(f) = (SELECT count(DISTINCT k) FROM unnest(f) AS k)
    AND (NOT f @> ARRAY['voting']::text[] OR f @> ARRAY['awards']::text[])
    AND (NOT f @> ARRAY['potm']::text[] OR f @> ARRAY['leaderboard']::text[])
    AND (NOT f @> ARRAY['badges']::text[] OR f @> ARRAY['profiles']::text[])
$$;

-- ===== Days

-- A training or a match. A match has a type and may have a score and the coach board it was
-- lined up on; a training has neither. title is the training's name or the opponent's.
CREATE TABLE public.coach_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  kind text NOT NULL,
  event_date date NOT NULL,
  title text,
  match_type text,
  our_score smallint,
  their_score smallint,
  lineup_id uuid REFERENCES public.lineups(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coach_events_kind_check CHECK (kind IN ('training', 'match')),
  CONSTRAINT coach_events_title_check CHECK (title IS NULL OR char_length(btrim(title)) BETWEEN 1 AND 80),
  CONSTRAINT coach_events_match_type_check CHECK (
    (kind = 'match' AND match_type IN ('friendly', 'official', 'league'))
    OR (kind = 'training' AND match_type IS NULL)
  ),
  CONSTRAINT coach_events_score_check CHECK (
    (our_score IS NULL AND their_score IS NULL)
    OR (kind = 'match' AND our_score IS NOT NULL AND their_score IS NOT NULL
        AND our_score BETWEEN 0 AND 99 AND their_score BETWEEN 0 AND 99)
  ),
  CONSTRAINT coach_events_lineup_check CHECK (lineup_id IS NULL OR kind = 'match')
);
CREATE INDEX coach_events_league_id_event_date_idx ON public.coach_events (league_id, event_date);
CREATE INDEX coach_events_lineup_id_idx ON public.coach_events (lineup_id);

-- ===== Players on a day

-- A training has a row for each player the coach marked, absent ones included, so an absence is
-- recorded and not only implied. A match has a row for each player in the squad: a starter, a
-- substitute, or one who was named but did not come on. position is where they played that day.
CREATE TABLE public.coach_event_players (
  event_id uuid NOT NULL REFERENCES public.coach_events(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  attendance text NOT NULL DEFAULT 'present',
  role text,
  position text,
  rating smallint,
  goals smallint NOT NULL DEFAULT 0,
  assists smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, player_id),
  CONSTRAINT coach_event_players_attendance_check CHECK (attendance IN ('present', 'late', 'excused', 'absent')),
  CONSTRAINT coach_event_players_role_check CHECK (role IS NULL OR role IN ('starter', 'sub', 'unused')),
  CONSTRAINT coach_event_players_position_check CHECK (position IS NULL OR position IN ('GK', 'DEF', 'MID', 'ATT')),
  -- Only a player who was there and played can be rated
  CONSTRAINT coach_event_players_rating_check CHECK (
    rating IS NULL OR (rating BETWEEN 1 AND 10 AND attendance IN ('present', 'late') AND role IS DISTINCT FROM 'unused')
  ),
  CONSTRAINT coach_event_players_goals_check CHECK (goals BETWEEN 0 AND 50 AND assists BETWEEN 0 AND 50)
);
CREATE INDEX coach_event_players_player_id_idx ON public.coach_event_players (player_id);
CREATE INDEX coach_event_players_league_id_idx ON public.coach_event_players (league_id);

-- The row's league is its day's, and the player must be in that league
CREATE TRIGGER coach_event_players_set_league BEFORE INSERT OR UPDATE ON public.coach_event_players
  FOR EACH ROW EXECUTE FUNCTION public.set_league_from_parent('coach_events', 'event_id', 'player_id');

-- ===== Security rules: owner only, and only with coach_eval; never public

ALTER TABLE public.coach_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_event_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner coach eval" ON public.coach_events FOR ALL TO authenticated
  USING (public.owns_league(league_id) AND public.league_has_feature(league_id, 'coach_eval'))
  WITH CHECK (public.owns_league(league_id) AND public.league_has_feature(league_id, 'coach_eval'));
CREATE POLICY "owner coach eval" ON public.coach_event_players FOR ALL TO authenticated
  USING (public.owns_league(league_id) AND public.league_has_feature(league_id, 'coach_eval'))
  WITH CHECK (public.owns_league(league_id) AND public.league_has_feature(league_id, 'coach_eval'));

-- ===== Saving a day

-- Saves a day and its players together, with the caller's rights, so the rules above apply.
-- p_id NULL makes a new day of p_kind in p_league_id; otherwise p_league_id and p_kind are ignored
-- (a day never changes league or kind). A blank title is stored as none. p_players is a list of
-- {player_id, attendance, role, position, rating, goals, assists}; it replaces the day's players.
CREATE FUNCTION public.save_coach_event(
  p_id uuid, p_league_id uuid, p_kind text, p_date date, p_title text, p_match_type text,
  p_our_score int, p_their_score int, p_lineup_id uuid, p_players jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_id uuid := p_id;
  v_league uuid := p_league_id;
BEGIN
  IF v_id IS NULL THEN
    INSERT INTO public.coach_events (league_id, kind, event_date, title, match_type, our_score, their_score, lineup_id)
    VALUES (p_league_id, p_kind, p_date, NULLIF(btrim(p_title), ''), p_match_type, p_our_score, p_their_score, p_lineup_id)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.coach_events
       SET event_date = p_date, title = NULLIF(btrim(p_title), ''), match_type = p_match_type,
           our_score = p_our_score, their_score = p_their_score, lineup_id = p_lineup_id, updated_at = now()
     WHERE id = v_id
    RETURNING league_id INTO v_league;
    IF NOT FOUND THEN RAISE EXCEPTION 'coach event not found'; END IF;
  END IF;

  -- A coach board of another league is never linked; the caller sees only their own boards
  IF p_lineup_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.lineups WHERE id = p_lineup_id AND league_id = v_league) THEN
    RAISE EXCEPTION 'lineup not found';
  END IF;

  DELETE FROM public.coach_event_players WHERE event_id = v_id;

  INSERT INTO public.coach_event_players (event_id, player_id, attendance, role, position, rating, goals, assists)
  SELECT v_id, x.player_id, COALESCE(x.attendance, 'present'), x.role, x.position, x.rating,
         COALESCE(x.goals, 0), COALESCE(x.assists, 0)
  FROM jsonb_to_recordset(COALESCE(p_players, '[]'::jsonb))
    AS x(player_id uuid, attendance text, role text, position text, rating smallint, goals smallint, assists smallint);

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.save_coach_event(uuid, uuid, text, date, text, text, int, int, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_coach_event(uuid, uuid, text, date, text, text, int, int, uuid, jsonb) TO authenticated;
