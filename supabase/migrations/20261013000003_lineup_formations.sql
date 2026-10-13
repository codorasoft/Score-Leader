-- Coach board: the formation the players were lined up in, and the substitutes beside the
-- pitch. No row changes: every board keeps all its players on the pitch with no formation.
-- The app already deployed keeps working: it names neither column.

-- A formation is its lines from the defence forward ("4-3-2-1"): one to five lines of one to
-- six players. The goalkeeper is not written. Empty for no formation.
ALTER TABLE public.lineups
  ADD COLUMN IF NOT EXISTS formation text,
  ADD CONSTRAINT lineups_formation_check CHECK (formation ~ '^[1-6](-[1-6]){0,4}$');

-- Empty for a player on the pitch, otherwise the place among the substitutes, from 0. Guests
-- (in lineups.guests) share the same order through a "bench" number of their own.
ALTER TABLE public.lineup_players
  ADD COLUMN IF NOT EXISTS bench_order smallint,
  ADD CONSTRAINT lineup_players_bench_order_check CHECK (bench_order >= 0);
