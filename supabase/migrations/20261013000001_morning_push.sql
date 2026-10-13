-- Morning push: each device that wants the morning notification, the function that saves one,
-- and the job that calls the server function every 15 minutes. Only adds; nothing is sent
-- until a coach turns the notification on and the two Vault values are set.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ===== Devices

-- One row per browser. endpoint, p256dh and auth come from the browser's push subscription;
-- time_zone is an IANA name (whether it is a real one is decided by the server function,
-- which skips a device whose zone it cannot read); last_sent_on is the device's local day
-- last handled.
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.admin_profiles(user_id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  time_zone text NOT NULL,
  notify_hour smallint NOT NULL,
  language text NOT NULL,
  last_sent_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_subscriptions_endpoint_check CHECK (endpoint LIKE 'https://%' AND char_length(endpoint) <= 2000),
  CONSTRAINT push_subscriptions_keys_check CHECK (char_length(p256dh) BETWEEN 1 AND 200 AND char_length(auth) BETWEEN 1 AND 200),
  CONSTRAINT push_subscriptions_time_zone_check CHECK (time_zone ~ '^[A-Za-z0-9_+/-]{1,64}$'),
  CONSTRAINT push_subscriptions_hour_check CHECK (notify_hour BETWEEN 0 AND 23),
  CONSTRAINT push_subscriptions_language_check CHECK (language IN ('en', 'ar'))
);
CREATE INDEX push_subscriptions_user_id_idx ON public.push_subscriptions (user_id);

-- ===== Security rules: a coach reads and deletes his own devices; rows are written only by
-- save_push_subscription

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_subscriptions FROM anon, authenticated;
GRANT SELECT, DELETE ON public.push_subscriptions TO authenticated;

CREATE POLICY "own devices read" ON public.push_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "own devices delete" ON public.push_subscriptions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Adds this device, or updates it when its address is already stored. Whoever holds the
-- address and its keys holds the device, so a second coach signing in on the same browser
-- takes the row over; the day already handled is then forgotten.
CREATE FUNCTION public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_time_zone text, p_notify_hour int, p_language text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.caller_has_feature('schedule') THEN
    RAISE EXCEPTION 'schedule feature needed';
  END IF;
  INSERT INTO public.push_subscriptions AS s (user_id, endpoint, p256dh, auth, time_zone, notify_hour, language)
  VALUES (auth.uid(), p_endpoint, p_p256dh, p_auth, p_time_zone, p_notify_hour, p_language)
  ON CONFLICT (endpoint) DO UPDATE SET
    last_sent_on = CASE WHEN s.user_id = EXCLUDED.user_id THEN s.last_sent_on END,
    user_id = EXCLUDED.user_id,
    p256dh = EXCLUDED.p256dh,
    auth = EXCLUDED.auth,
    time_zone = EXCLUDED.time_zone,
    notify_hour = EXCLUDED.notify_hour,
    language = EXCLUDED.language,
    updated_at = now();
END $$;

REVOKE ALL ON FUNCTION public.save_push_subscription(text, text, text, text, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_push_subscription(text, text, text, text, int, text) TO authenticated;

-- ===== The job

-- Calls the server function that sends the morning notifications. Quiet while nobody has
-- turned the notification on, and until the function's address and the job's secret are in
-- Vault under these two names (they are set by hand, never written in a migration).
CREATE FUNCTION public.kick_morning_push()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target text;
  secret text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.push_subscriptions) THEN RETURN; END IF;
  SELECT decrypted_secret INTO target FROM vault.decrypted_secrets WHERE name = 'morning_push_url';
  SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name = 'morning_push_secret';
  IF target IS NULL OR secret IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := target,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
END $$;

REVOKE ALL ON FUNCTION public.kick_morning_push() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('morning-push', '*/15 * * * *', 'SELECT public.kick_morning_push()');
-- The job history grows by 96 rows a day
SELECT cron.schedule('purge-cron-history', '0 3 * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days'$$);
