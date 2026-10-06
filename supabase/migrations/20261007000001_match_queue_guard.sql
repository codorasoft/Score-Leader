-- A phone still running an app version from before waiting queues saves new matches with only
-- waiting_team_id. In a 3-team session that is the whole queue, so fill it in. In any other session
-- it would drop teams from the rotation, so refuse it: the old app shows an error and reloading
-- gets the current version.
CREATE OR REPLACE FUNCTION public.match_queue_from_old_apps() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  teams_in_session smallint;
BEGIN
  IF NEW.queue = '{}' AND NEW.waiting_team_id IS NOT NULL THEN
    SELECT team_count INTO teams_in_session FROM public.sessions WHERE id = NEW.session_id;
    IF teams_in_session IS DISTINCT FROM 3 THEN
      RAISE EXCEPTION 'This app version is out of date. Reload the page and try again.';
    END IF;
    NEW.queue := ARRAY[NEW.waiting_team_id];
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS matches_queue_from_old_apps ON public.matches;
CREATE TRIGGER matches_queue_from_old_apps BEFORE INSERT ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.match_queue_from_old_apps();
