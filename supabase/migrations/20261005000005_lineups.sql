-- Standalone lineup builder: named boards where the admin places any players anywhere on a pitch.
CREATE TABLE IF NOT EXISTS public.lineups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Spot on the full pitch seen from above: x 0 (left) .. 1 (right), y 0 (top goal) .. 1 (bottom goal)
CREATE TABLE IF NOT EXISTS public.lineup_players (
  lineup_id uuid NOT NULL REFERENCES public.lineups(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  x real NOT NULL CHECK (x BETWEEN 0 AND 1),
  y real NOT NULL CHECK (y BETWEEN 0 AND 1),
  PRIMARY KEY (lineup_id, player_id)
);

-- Admin-only: lineups are shared as images, not as public pages
ALTER TABLE public.lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lineup_players ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin all" ON public.lineups;
DROP POLICY IF EXISTS "admin all" ON public.lineup_players;
CREATE POLICY "admin all" ON public.lineups FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin all" ON public.lineup_players FOR ALL TO authenticated USING (true) WITH CHECK (true);
