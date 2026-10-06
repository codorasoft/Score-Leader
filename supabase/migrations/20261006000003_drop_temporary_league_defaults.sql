-- The new app sends league_id on every players / sessions / lineups insert, so the temporary
-- "put it in Eagles" defaults that kept the old app working during the rollout are removed.
ALTER TABLE public.players ALTER COLUMN league_id DROP DEFAULT;
ALTER TABLE public.sessions ALTER COLUMN league_id DROP DEFAULT;
ALTER TABLE public.lineups ALTER COLUMN league_id DROP DEFAULT;
