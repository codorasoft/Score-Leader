-- Training: one catalog of training types and YouTube videos kept by the superadmin, and
-- per-league trainings that pick videos from it. Only adds; nobody has the feature until the
-- superadmin ticks it.

-- ===== Feature key

-- The same checks as before, with 'training' as the 15th key (supabase/functions/_shared/features.ts)
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
      'training'
    ]::text[]
    AND cardinality(f) = (SELECT count(DISTINCT k) FROM unnest(f) AS k)
    AND (NOT f @> ARRAY['voting']::text[] OR f @> ARRAY['awards']::text[])
    AND (NOT f @> ARRAY['potm']::text[] OR f @> ARRAY['leaderboard']::text[])
    AND (NOT f @> ARRAY['badges']::text[] OR f @> ARRAY['profiles']::text[])
$$;

-- ===== Catalog (global)

CREATE TABLE public.training_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  sort_order int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- youtube_id is the 11-character video id, never the link. The unique key also serves
-- "videos of a type".
CREATE TABLE public.training_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id uuid NOT NULL REFERENCES public.training_types(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  youtube_id text NOT NULL CHECK (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  sort_order int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (type_id, youtube_id)
);

-- ===== Trainings (per league)

CREATE TABLE public.trainings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  training_date date NOT NULL,
  title text CHECK (title IS NULL OR char_length(btrim(title)) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trainings_league_id_training_date_idx ON public.trainings (league_id, training_date);

-- A training points at catalog videos: deleting a video takes it out of every training
CREATE TABLE public.training_items (
  training_id uuid NOT NULL REFERENCES public.trainings(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.training_videos(id) ON DELETE CASCADE,
  position int NOT NULL CHECK (position >= 0),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  PRIMARY KEY (training_id, video_id)
);
CREATE INDEX training_items_video_id_idx ON public.training_items (video_id);
CREATE INDEX training_items_league_id_idx ON public.training_items (league_id);

CREATE TRIGGER training_items_set_league BEFORE INSERT OR UPDATE ON public.training_items
  FOR EACH ROW EXECUTE FUNCTION public.set_league_from_parent('trainings', 'training_id');

-- ===== Security rules

-- The caller is an enabled admin who has the feature (the catalog belongs to no league)
CREATE FUNCTION public.caller_has_feature(p_feature text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_profiles
    WHERE user_id = auth.uid() AND role = 'admin' AND NOT is_disabled AND p_feature = ANY (features)
  )
$$;

ALTER TABLE public.training_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_items ENABLE ROW LEVEL SECURITY;

-- Catalog: the superadmin writes it; admins with training read it; visitors get nothing
CREATE POLICY "catalog read" ON public.training_types FOR SELECT TO authenticated
  USING (public.is_superadmin() OR public.caller_has_feature('training'));
CREATE POLICY "superadmin catalog" ON public.training_types FOR ALL TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
CREATE POLICY "catalog read" ON public.training_videos FOR SELECT TO authenticated
  USING (public.is_superadmin() OR public.caller_has_feature('training'));
CREATE POLICY "superadmin catalog" ON public.training_videos FOR ALL TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- Trainings: owner only, and only with training; never public
CREATE POLICY "owner training" ON public.trainings FOR ALL TO authenticated
  USING (public.owns_league(league_id) AND public.league_has_feature(league_id, 'training'))
  WITH CHECK (public.owns_league(league_id) AND public.league_has_feature(league_id, 'training'));
CREATE POLICY "owner training" ON public.training_items FOR ALL TO authenticated
  USING (public.owns_league(league_id) AND public.league_has_feature(league_id, 'training'))
  WITH CHECK (public.owns_league(league_id) AND public.league_has_feature(league_id, 'training'));
-- So the catalog can say how many trainings use a video before it is deleted
CREATE POLICY "superadmin counts use" ON public.training_items FOR SELECT TO authenticated
  USING (public.is_superadmin());

-- ===== Saving a training

-- Saves a training and its videos together, with the caller's rights, so the rules above apply.
-- p_id NULL makes a new training in p_league_id; otherwise p_league_id is ignored (a training
-- never changes league). A blank title is stored as none.
CREATE FUNCTION public.save_training(p_id uuid, p_league_id uuid, p_date date, p_title text, p_video_ids uuid[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_id uuid := p_id;
BEGIN
  IF v_id IS NULL THEN
    INSERT INTO public.trainings (league_id, training_date, title)
    VALUES (p_league_id, p_date, NULLIF(btrim(p_title), ''))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.trainings
       SET training_date = p_date, title = NULLIF(btrim(p_title), ''), updated_at = now()
     WHERE id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'training not found'; END IF;
  END IF;

  DELETE FROM public.training_items WHERE training_id = v_id;

  -- Videos still in the catalog only, each once, in the order first given
  INSERT INTO public.training_items (training_id, video_id, position)
  SELECT v_id, x.video_id, (row_number() OVER (ORDER BY x.first_ord) - 1)::int
  FROM (
    SELECT u.video_id, min(u.ord) AS first_ord
    FROM unnest(p_video_ids) WITH ORDINALITY AS u(video_id, ord)
    JOIN public.training_videos v ON v.id = u.video_id
    GROUP BY u.video_id
  ) x;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.save_training(uuid, uuid, date, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_training(uuid, uuid, date, text, uuid[]) TO authenticated;
