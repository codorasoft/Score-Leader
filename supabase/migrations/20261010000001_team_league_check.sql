-- Teams a match or match event points at must belong to its league, as players already must
-- (set_league_from_parent). Without this, an owner could save a match in their league that points
-- at another league's team; the foreign key then stops that league's owner, and even the
-- superadmin, from deleting the session or the league. No existing rows break this rule.
-- Trigger arguments: the columns holding team ids, each a uuid or a uuid[] (the waiting queue).
-- A missing team is left to the foreign key to report; queue entries have no foreign key.
CREATE FUNCTION public.check_teams_in_league()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  row_json jsonb := to_jsonb(NEW);
  refs uuid[] := '{}';
  val jsonb;
  i int;
BEGIN
  FOR i IN 0 .. TG_NARGS - 1 LOOP
    val := row_json -> TG_ARGV[i];
    IF jsonb_typeof(val) = 'string' THEN
      refs := refs || (val #>> '{}')::uuid;
    ELSIF jsonb_typeof(val) = 'array' THEN
      refs := refs || ARRAY(SELECT jsonb_array_elements_text(val)::uuid);
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.teams t WHERE t.id = ANY (refs) AND t.league_id <> NEW.league_id) THEN
    RAISE EXCEPTION 'team belongs to another league';
  END IF;
  RETURN NEW;
END $$;

-- BEFORE triggers fire in name order: these run after *_set_league has filled in league_id
CREATE TRIGGER matches_teams_in_league BEFORE INSERT OR UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.check_teams_in_league('team1_id', 'team2_id', 'waiting_team_id', 'winner_team_id', 'queue');
CREATE TRIGGER match_events_teams_in_league BEFORE INSERT OR UPDATE ON public.match_events
  FOR EACH ROW EXECUTE FUNCTION public.check_teams_in_league('team_id');
