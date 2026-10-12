-- Coach's schedule: per-league calendar items (tasks, training days, matches, others) that can
-- repeat every week on chosen weekdays. Only adds; nobody has the feature until the superadmin
-- ticks it.

-- ===== Feature key

-- The same checks as before, with 'schedule' as the 16th key (supabase/functions/_shared/features.ts)
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
      'training', 'schedule'
    ]::text[]
    AND cardinality(f) = (SELECT count(DISTINCT k) FROM unnest(f) AS k)
    AND (NOT f @> ARRAY['voting']::text[] OR f @> ARRAY['awards']::text[])
    AND (NOT f @> ARRAY['potm']::text[] OR f @> ARRAY['leaderboard']::text[])
    AND (NOT f @> ARRAY['badges']::text[] OR f @> ARRAY['profiles']::text[])
$$;

-- ===== Items

-- Weekdays an item repeats on: 0 (Sunday) .. 6 (Saturday), each at most once; empty = no repeat
CREATE FUNCTION public.valid_repeat_days(d smallint[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT d IS NOT NULL
    AND array_position(d, NULL) IS NULL
    AND d <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]
    AND cardinality(d) = (SELECT count(DISTINCT x) FROM unnest(d) AS x)
$$;

-- item_date is the day; for a repeating item, the first day of its series. A repeating item is
-- on every day from item_date to repeat_until whose weekday is in repeat_days, except the days
-- in skipped_dates. No start_time means all day.
CREATE TABLE public.schedule_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  item_date date NOT NULL,
  start_time time,
  end_time time,
  note text,
  repeat_days smallint[] NOT NULL DEFAULT '{}',
  repeat_until date,
  -- So one plain filter tells repeating items from the rest
  repeats boolean GENERATED ALWAYS AS (cardinality(repeat_days) > 0) STORED,
  skipped_dates date[] NOT NULL DEFAULT '{}',
  done_dates date[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedule_items_kind_check CHECK (kind IN ('task', 'training', 'match', 'other')),
  CONSTRAINT schedule_items_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  CONSTRAINT schedule_items_times_check CHECK (end_time IS NULL OR (start_time IS NOT NULL AND end_time > start_time)),
  CONSTRAINT schedule_items_note_check CHECK (note IS NULL OR char_length(note) <= 500),
  CONSTRAINT schedule_items_repeat_days_check CHECK (public.valid_repeat_days(repeat_days)),
  CONSTRAINT schedule_items_repeat_until_check CHECK (
    repeat_until IS NULL OR (cardinality(repeat_days) > 0 AND repeat_until >= item_date)
  )
);
CREATE INDEX schedule_items_league_id_item_date_idx ON public.schedule_items (league_id, item_date);

-- ===== Security rules: owner only, and only with schedule; never public

ALTER TABLE public.schedule_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner schedule" ON public.schedule_items FOR ALL TO authenticated
  USING (public.owns_league(league_id) AND public.league_has_feature(league_id, 'schedule'))
  WITH CHECK (public.owns_league(league_id) AND public.league_has_feature(league_id, 'schedule'));
