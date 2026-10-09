-- Per-session match format: one period or two halves, optional extra time, penalties, goal limit and
-- draw rule. Defaults equal the rules every session has used so far. Every existing match and event
-- becomes period 1.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS period_count smallint NOT NULL DEFAULT 1 CHECK (period_count IN (1, 2)),
  ADD COLUMN IF NOT EXISTS period_minutes smallint NOT NULL DEFAULT 7 CHECK (period_minutes BETWEEN 1 AND 45),
  ADD COLUMN IF NOT EXISTS extra_time_minutes smallint CHECK (extra_time_minutes BETWEEN 1 AND 15),
  ADD COLUMN IF NOT EXISTS penalties boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS goal_limit smallint DEFAULT 2 CHECK (goal_limit BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS draw_rule text NOT NULL DEFAULT 'stay' CHECK (draw_rule IN ('stay', 'draw'));

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS period smallint CHECK (period BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS period_seconds smallint[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS penalties_team1 smallint CHECK (penalties_team1 >= 0),
  ADD COLUMN IF NOT EXISTS penalties_team2 smallint CHECK (penalties_team2 >= 0);

UPDATE public.matches SET period = 1 WHERE period IS NULL;
-- No default on purpose: the trigger below fills it for old apps, and refuses where 1 would be wrong.
ALTER TABLE public.matches ALTER COLUMN period SET NOT NULL;

ALTER TABLE public.match_events
  ADD COLUMN IF NOT EXISTS period smallint NOT NULL DEFAULT 1 CHECK (period BETWEEN 1 AND 5);

ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_draw_resolved_by_check;
ALTER TABLE public.matches ADD CONSTRAINT matches_draw_resolved_by_check
  CHECK (draw_resolved_by IN ('penalties', 'late_team', 'extra_time'));

-- A phone still running an app version from before match formats saves new matches without a period.
-- In a one-period session with no extra time that is period 1, so fill it in. In any other session it
-- would be wrong, so refuse it: the old app shows an error and reloading gets the current version.
CREATE OR REPLACE FUNCTION public.match_period_from_old_apps() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  periods smallint;
  et smallint;
BEGIN
  IF NEW.period IS NULL THEN
    SELECT period_count, extra_time_minutes INTO periods, et FROM public.sessions WHERE id = NEW.session_id;
    IF periods IS DISTINCT FROM 1 OR et IS NOT NULL THEN
      RAISE EXCEPTION 'This app version is out of date. Reload the page and try again.';
    END IF;
    NEW.period := 1;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS matches_period_from_old_apps ON public.matches;
CREATE TRIGGER matches_period_from_old_apps BEFORE INSERT ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.match_period_from_old_apps();
