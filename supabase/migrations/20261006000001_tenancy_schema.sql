-- Multi-tenancy, part 1: admin accounts, leagues, and league_id on every table. All existing
-- rows go to the legacy league Eagles, owned by info@codorasoft.com. The security rules that
-- use the helper functions below are in 20261006000002_tenancy_policies.sql.

-- ===== Accounts and leagues

-- Known feature keys, no duplicates, and the three dependencies (supabase/functions/_shared/features.ts)
CREATE FUNCTION public.valid_features(f text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT f IS NOT NULL
    AND f <@ ARRAY[
      'cards', 'swaps', 'smart_balancing', 'awards', 'voting', 'leaderboard', 'potm',
      'profiles', 'badges', 'records', 'player_cards', 'photos', 'summary_share', 'coach_board'
    ]::text[]
    AND cardinality(f) = (SELECT count(DISTINCT k) FROM unnest(f) AS k)
    AND (NOT f @> ARRAY['voting']::text[] OR f @> ARRAY['awards']::text[])
    AND (NOT f @> ARRAY['potm']::text[] OR f @> ARRAY['leaderboard']::text[])
    AND (NOT f @> ARRAY['badges']::text[] OR f @> ARRAY['profiles']::text[])
$$;

CREATE TABLE public.admin_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('superadmin', 'admin')),
  email text NOT NULL,
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 80),
  max_leagues int NOT NULL DEFAULT 1 CHECK (max_leagues >= 0),
  features text[] NOT NULL DEFAULT '{}' CHECK (public.valid_features(features)),
  is_disabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Slug rules: supabase/functions/_shared/slug.ts
CREATE TABLE public.leagues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.admin_profiles(user_id),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  slug text NOT NULL UNIQUE CHECK (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    AND char_length(slug) BETWEEN 3 AND 40
    AND slug <> ALL (ARRAY['leagues', 'players', 'history', 'sessions', 'lineups', 'settings', 'new', 'super'])
  ),
  logo_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX leagues_owner_id_idx ON public.leagues (owner_id);

-- Closed until the next migration adds policies (the API roles get table grants by default)
ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;

-- Locks the owner's profile so two concurrent inserts cannot both pass the limit
CREATE FUNCTION public.enforce_league_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  profile public.admin_profiles%ROWTYPE;
BEGIN
  SELECT * INTO profile FROM public.admin_profiles WHERE user_id = NEW.owner_id FOR UPDATE;
  IF NOT FOUND OR profile.role <> 'admin' OR profile.is_disabled THEN
    RAISE EXCEPTION 'league owner must be an enabled admin';
  END IF;
  IF (SELECT count(*) FROM public.leagues WHERE owner_id = NEW.owner_id) >= profile.max_leagues THEN
    RAISE EXCEPTION 'league limit reached';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER leagues_before_insert
  BEFORE INSERT ON public.leagues
  FOR EACH ROW EXECUTE FUNCTION public.enforce_league_limit();

CREATE FUNCTION public.keep_league_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.slug IS DISTINCT FROM OLD.slug OR NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'slug and owner cannot change';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER leagues_before_update
  BEFORE UPDATE ON public.leagues
  FOR EACH ROW EXECUTE FUNCTION public.keep_league_identity();

-- ===== Helpers for the security rules

CREATE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_profiles
    WHERE user_id = auth.uid() AND role = 'superadmin' AND NOT is_disabled
  )
$$;

CREATE FUNCTION public.owns_league(p_league_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leagues l
    JOIN public.admin_profiles p ON p.user_id = l.owner_id
    WHERE l.id = p_league_id AND l.owner_id = auth.uid() AND p.role = 'admin' AND NOT p.is_disabled
  )
$$;

CREATE FUNCTION public.league_has_feature(p_league_id uuid, p_feature text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leagues l
    JOIN public.admin_profiles p ON p.user_id = l.owner_id
    WHERE l.id = p_league_id AND p_feature = ANY (p.features)
  )
$$;

CREATE FUNCTION public.league_is_available(p_league_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leagues l
    JOIN public.admin_profiles p ON p.user_id = l.owner_id
    WHERE l.id = p_league_id AND NOT p.is_disabled
  )
$$;

-- Child tables: copies league_id from the parent row and rejects players from another league.
-- Trigger arguments: parent table, column holding the parent id, then any player id columns.
-- A missing parent or player is left to the foreign keys to report.
CREATE FUNCTION public.set_league_from_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  parent_league uuid;
  ref_player uuid;
  player_league uuid;
  i int;
BEGIN
  EXECUTE format('SELECT league_id FROM public.%I WHERE id = $1', TG_ARGV[0])
    INTO parent_league
    USING (to_jsonb(NEW) ->> TG_ARGV[1])::uuid;

  IF NEW.league_id IS NULL THEN
    NEW.league_id := parent_league;
  ELSIF parent_league IS NOT NULL AND NEW.league_id <> parent_league THEN
    RAISE EXCEPTION 'league mismatch';
  END IF;

  FOR i IN 2 .. TG_NARGS - 1 LOOP
    ref_player := (to_jsonb(NEW) ->> TG_ARGV[i])::uuid;
    IF ref_player IS NOT NULL THEN
      SELECT league_id INTO player_league FROM public.players WHERE id = ref_player;
      IF FOUND AND player_league IS DISTINCT FROM NEW.league_id THEN
        RAISE EXCEPTION 'player belongs to another league';
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END $$;

-- What public pages need about a league, without exposing admin_profiles
CREATE VIEW public.league_directory AS
  SELECT l.id, l.slug, l.name, l.logo_url, p.features, NOT p.is_disabled AS is_available
  FROM public.leagues l
  JOIN public.admin_profiles p ON p.user_id = l.owner_id;

REVOKE ALL ON public.league_directory FROM anon, authenticated;
GRANT SELECT ON public.league_directory TO anon, authenticated;

-- ===== Legacy account and league, league_id on every table

DO $$
DECLARE
  legacy_user auth.users%ROWTYPE;
  eagles uuid;
  t text;
BEGIN
  SELECT * INTO legacy_user FROM auth.users WHERE email = 'info@codorasoft.com';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'existing admin info@codorasoft.com not found';
  END IF;

  INSERT INTO public.admin_profiles (user_id, role, email, display_name, max_leagues, features)
  VALUES (legacy_user.id, 'admin', legacy_user.email, 'Eagles admin', 1, ARRAY[
    'cards', 'swaps', 'smart_balancing', 'awards', 'voting', 'leaderboard', 'potm',
    'profiles', 'badges', 'records', 'player_cards', 'photos', 'summary_share', 'coach_board'
  ]);

  INSERT INTO public.leagues (owner_id, name, slug, logo_url)
  VALUES (legacy_user.id, 'Eagles', 'eagles', NULL)
  RETURNING id INTO eagles;

  FOREACH t IN ARRAY ARRAY[
    'players', 'sessions', 'session_players', 'teams', 'team_players', 'matches', 'match_events',
    'award_votes', 'award_vote_nominations', 'award_vote_entries', 'session_awards',
    'lineups', 'lineup_players'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN league_id uuid', t);
    EXECUTE format('UPDATE public.%I SET league_id = $1', t) USING eagles;
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN league_id SET NOT NULL', t);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (league_id) REFERENCES public.leagues(id) ON DELETE CASCADE',
      t, t || '_league_id_fkey');
    EXECUTE format('CREATE INDEX %I ON public.%I (league_id)', t || '_league_id_idx', t);
  END LOOP;

  -- Temporary: the app deployed today does not send league_id. Removed by Migration 2.
  FOREACH t IN ARRAY ARRAY['players', 'sessions', 'lineups'] LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN league_id SET DEFAULT %L', t, eagles);
  END LOOP;
END $$;

-- ===== Child tables take their parent's league (after the backfill, so it is not affected)

CREATE TRIGGER session_players_set_league BEFORE INSERT ON public.session_players
  FOR EACH ROW EXECUTE FUNCTION public.set_league_from_parent('sessions', 'session_id', 'player_id');
CREATE TRIGGER teams_set_league BEFORE INSERT ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.set_league_from_parent('sessions', 'session_id');
CREATE TRIGGER team_players_set_league BEFORE INSERT ON public.team_players
  FOR EACH ROW EXECUTE FUNCTION public.set_league_from_parent('teams', 'team_id', 'player_id');
CREATE TRIGGER matches_set_league BEFORE INSERT ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.set_league_from_parent('sessions', 'session_id');
CREATE TRIGGER match_events_set_league BEFORE INSERT ON public.match_events
  FOR EACH ROW EXECUTE FUNCTION public.set_league_from_parent('matches', 'match_id', 'player_id');
CREATE TRIGGER award_votes_set_league BEFORE INSERT ON public.award_votes
  FOR EACH ROW EXECUTE FUNCTION public.set_league_from_parent('sessions', 'session_id', 'winner_player_id');
CREATE TRIGGER award_vote_nominations_set_league BEFORE INSERT ON public.award_vote_nominations
  FOR EACH ROW EXECUTE FUNCTION public.set_league_from_parent('award_votes', 'award_vote_id', 'player_id');
CREATE TRIGGER award_vote_entries_set_league BEFORE INSERT ON public.award_vote_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_league_from_parent('award_votes', 'award_vote_id', 'player_id');
CREATE TRIGGER session_awards_set_league BEFORE INSERT ON public.session_awards
  FOR EACH ROW EXECUTE FUNCTION public.set_league_from_parent('sessions', 'session_id', 'winner_player_id');
CREATE TRIGGER lineup_players_set_league BEFORE INSERT ON public.lineup_players
  FOR EACH ROW EXECUTE FUNCTION public.set_league_from_parent('lineups', 'lineup_id', 'player_id');
