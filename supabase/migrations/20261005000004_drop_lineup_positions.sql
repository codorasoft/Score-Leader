-- The per-session lineup was replaced by a standalone lineup builder; drop its columns.
ALTER TABLE public.team_players DROP COLUMN IF EXISTS pos_x, DROP COLUMN IF EXISTS pos_y;
