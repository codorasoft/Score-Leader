-- Arrows and zones drawn on a coach board, as a JSON array of shapes (positions are 0..1 of the pitch).
ALTER TABLE public.lineups
  ADD COLUMN IF NOT EXISTS drawings jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(drawings) = 'array');
