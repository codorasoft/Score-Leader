-- Guest players on a coach board: typed names that are not in the Players list.
-- JSON array of { id, name, x, y } (positions 0..1 of the pitch).
ALTER TABLE public.lineups
  ADD COLUMN IF NOT EXISTS guests jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(guests) = 'array');
