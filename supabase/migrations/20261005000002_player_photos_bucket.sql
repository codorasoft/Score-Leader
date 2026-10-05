-- Player photos uploaded from the admin's phone. Anyone can view them (public bucket);
-- only signed-in admins can add, replace or delete. Files are resized to ~512px on the
-- phone before upload, so 2 MB is a generous cap.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('player-photos', 'player-photos', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "player photos admin insert" ON storage.objects;
DROP POLICY IF EXISTS "player photos admin update" ON storage.objects;
DROP POLICY IF EXISTS "player photos admin delete" ON storage.objects;

CREATE POLICY "player photos admin insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'player-photos');
CREATE POLICY "player photos admin update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'player-photos') WITH CHECK (bucket_id = 'player-photos');
CREATE POLICY "player photos admin delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'player-photos');
