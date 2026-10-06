-- The Storage API deletes and replaces files with DELETE/UPDATE ... WHERE ... RETURNING, which only
-- reaches rows the caller can SELECT. Without a read policy every removal of an old player photo or
-- league logo silently matched nothing and left the file behind. League owners may now see the files
-- in their own leagues' folders (public viewing still goes through the public bucket URLs).
DROP POLICY IF EXISTS "league photos owner read" ON storage.objects;
DROP POLICY IF EXISTS "league logos owner read" ON storage.objects;

CREATE POLICY "league photos owner read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'player-photos' AND public.owns_league(public.storage_league_id(name)));
CREATE POLICY "league logos owner read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'league-logos' AND public.owns_league(public.storage_league_id(name)));
