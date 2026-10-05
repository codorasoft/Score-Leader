-- Where each player stands on the lineup pitch, in their own half:
-- pos_x 0 (left) .. 1 (right), pos_y 0 (own goal line) .. 1 (halfway line). NULL = default formation.
ALTER TABLE public.team_players
  ADD COLUMN IF NOT EXISTS pos_x real CHECK (pos_x BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS pos_y real CHECK (pos_y BETWEEN 0 AND 1);
