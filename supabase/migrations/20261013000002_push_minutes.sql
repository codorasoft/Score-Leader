-- Morning push: the time of the notification gains minutes, in quarters (the job runs on
-- every quarter hour). No row changes: every device already turned on stays on the hour. The
-- app already deployed keeps working: it names no minutes, and then they are left as they are.

ALTER TABLE public.push_subscriptions
  ADD COLUMN notify_minute smallint NOT NULL DEFAULT 0,
  ADD CONSTRAINT push_subscriptions_minute_check CHECK (notify_minute IN (0, 15, 30, 45));

-- One more argument, with a default, in place of the old function (an old and a new one side
-- by side could not be told apart by a call that names no minutes).
DROP FUNCTION public.save_push_subscription(text, text, text, text, int, text);

-- Adds this device, or updates it when its address is already stored. Whoever holds the
-- address and its keys holds the device, so a second coach signing in on the same browser
-- takes the row over; the day already handled is then forgotten. Without p_notify_minute the
-- minutes stay as they are for the same coach, and are 0 for a new device or a new owner.
CREATE FUNCTION public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_time_zone text, p_notify_hour int, p_language text,
  p_notify_minute int DEFAULT NULL
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
  INSERT INTO public.push_subscriptions AS s (user_id, endpoint, p256dh, auth, time_zone, notify_hour, notify_minute, language)
  VALUES (auth.uid(), p_endpoint, p_p256dh, p_auth, p_time_zone, p_notify_hour, COALESCE(p_notify_minute, 0), p_language)
  ON CONFLICT (endpoint) DO UPDATE SET
    last_sent_on = CASE WHEN s.user_id = EXCLUDED.user_id THEN s.last_sent_on END,
    notify_minute = CASE
      WHEN p_notify_minute IS NOT NULL THEN p_notify_minute
      WHEN s.user_id = EXCLUDED.user_id THEN s.notify_minute
      ELSE 0
    END,
    user_id = EXCLUDED.user_id,
    p256dh = EXCLUDED.p256dh,
    auth = EXCLUDED.auth,
    time_zone = EXCLUDED.time_zone,
    notify_hour = EXCLUDED.notify_hour,
    language = EXCLUDED.language,
    updated_at = now();
END $$;

REVOKE ALL ON FUNCTION public.save_push_subscription(text, text, text, text, int, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_push_subscription(text, text, text, text, int, text, int) TO authenticated;
