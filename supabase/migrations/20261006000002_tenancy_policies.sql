-- Multi-tenancy, part 2: security rules. Visitors read leagues whose owner is enabled; each
-- admin writes only in leagues they own; the superadmin reads everything. Uses the helper
-- functions from 20261006000001_tenancy_schema.sql.

-- ===== League data tables

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'players', 'sessions', 'session_players', 'teams', 'team_players', 'matches', 'match_events',
    'award_votes', 'award_vote_nominations', 'award_vote_entries', 'session_awards'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "public read" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "admin write" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "league read" ON public.%I FOR SELECT TO anon, authenticated
       USING (public.league_is_available(league_id) OR public.owns_league(league_id) OR public.is_superadmin())',
      t);
    IF t <> 'award_votes' THEN
      EXECUTE format(
        'CREATE POLICY "owner write" ON public.%I FOR ALL TO authenticated
         USING (public.owns_league(league_id)) WITH CHECK (public.owns_league(league_id))',
        t);
    END IF;
  END LOOP;
END $$;

-- Opening a vote needs `voting`; an owner can still close or delete votes after it is turned
-- off. Separate policies, because permissive policies are OR-ed (a FOR ALL one would let the
-- insert through). The owner reads them through "league read".
CREATE POLICY "owner write insert" ON public.award_votes FOR INSERT TO authenticated
  WITH CHECK (public.owns_league(league_id) AND public.league_has_feature(league_id, 'voting'));
CREATE POLICY "owner write update" ON public.award_votes FOR UPDATE TO authenticated
  USING (public.owns_league(league_id)) WITH CHECK (public.owns_league(league_id));
CREATE POLICY "owner write delete" ON public.award_votes FOR DELETE TO authenticated
  USING (public.owns_league(league_id));

-- Visitors vote through the public link: an open vote, for a nominated player, in a league
-- that has voting and whose owner is enabled. league_id is already set by the BEFORE trigger.
DROP POLICY IF EXISTS "public vote" ON public.award_vote_entries;
CREATE POLICY "public vote" ON public.award_vote_entries
  FOR INSERT TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.award_votes v
      WHERE v.id = award_vote_entries.award_vote_id AND v.status = 'open'
    )
    AND EXISTS (
      SELECT 1 FROM public.award_vote_nominations n
      WHERE n.award_vote_id = award_vote_entries.award_vote_id AND n.player_id = award_vote_entries.player_id
    )
    AND public.league_has_feature(league_id, 'voting')
    AND public.league_is_available(league_id)
  );

-- ===== Coach boards: owner only, never public

DROP POLICY IF EXISTS "admin all" ON public.lineups;
DROP POLICY IF EXISTS "admin all" ON public.lineup_players;
CREATE POLICY "owner coach board" ON public.lineups FOR ALL TO authenticated
  USING (public.owns_league(league_id) AND public.league_has_feature(league_id, 'coach_board'))
  WITH CHECK (public.owns_league(league_id) AND public.league_has_feature(league_id, 'coach_board'));
CREATE POLICY "owner coach board" ON public.lineup_players FOR ALL TO authenticated
  USING (public.owns_league(league_id) AND public.league_has_feature(league_id, 'coach_board'))
  WITH CHECK (public.owns_league(league_id) AND public.league_has_feature(league_id, 'coach_board'));

-- ===== Admin accounts and leagues (accounts are created and leagues deleted by Edge Functions)

CREATE POLICY "self or superadmin read" ON public.admin_profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_superadmin());
CREATE POLICY "superadmin update" ON public.admin_profiles FOR UPDATE TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE POLICY "owner or superadmin read" ON public.leagues FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_superadmin());
-- The league limit and the enabled-admin check are in the leagues_before_insert trigger
CREATE POLICY "owner insert" ON public.leagues FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "owner update" ON public.leagues FOR UPDATE TO authenticated
  USING (public.owns_league(id)) WITH CHECK (public.owns_league(id));

-- ===== Storage: files live under <league_id>/

-- The league id in an object's first folder, or NULL when that folder is not a uuid. The CASE
-- makes sure the cast never runs on other input (a plain AND does not guarantee the order).
CREATE FUNCTION public.storage_league_id(object_name text)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN (storage.foldername(object_name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN ((storage.foldername(object_name))[1])::uuid
  END
$$;

-- League logos uploaded by the admin. Public, like player photos; resized on the phone first.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('league-logos', 'league-logos', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- From now on the old app cannot upload photos (its paths have no league folder) until the
-- new app is deployed; see Review Focus 1 in the multi-tenant plan.
DROP POLICY IF EXISTS "player photos admin insert" ON storage.objects;
DROP POLICY IF EXISTS "player photos admin update" ON storage.objects;
DROP POLICY IF EXISTS "player photos admin delete" ON storage.objects;

CREATE POLICY "league photos write insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'player-photos'
    AND public.owns_league(public.storage_league_id(name))
    AND public.league_has_feature(public.storage_league_id(name), 'photos')
  );
CREATE POLICY "league photos write update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'player-photos'
    AND public.owns_league(public.storage_league_id(name))
    AND public.league_has_feature(public.storage_league_id(name), 'photos')
  )
  WITH CHECK (
    bucket_id = 'player-photos'
    AND public.owns_league(public.storage_league_id(name))
    AND public.league_has_feature(public.storage_league_id(name), 'photos')
  );
CREATE POLICY "league photos write delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'player-photos'
    AND public.owns_league(public.storage_league_id(name))
    AND public.league_has_feature(public.storage_league_id(name), 'photos')
  );

CREATE POLICY "league logos write insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'league-logos' AND public.owns_league(public.storage_league_id(name)));
CREATE POLICY "league logos write update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'league-logos' AND public.owns_league(public.storage_league_id(name)))
  WITH CHECK (bucket_id = 'league-logos' AND public.owns_league(public.storage_league_id(name)));
CREATE POLICY "league logos write delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'league-logos' AND public.owns_league(public.storage_league_id(name)));
