-- The server's clock, so every device times matches and red-card suspensions the same way even
-- when a phone or PC clock is wrong. Public: the live session page needs it too.
CREATE OR REPLACE FUNCTION public.server_now() RETURNS timestamptz
LANGUAGE sql STABLE AS $$ SELECT now() $$;

GRANT EXECUTE ON FUNCTION public.server_now() TO anon, authenticated;
