-- Guest players: someone who joins one booking without being in the league's Players list.
-- A guest is an ordinary players row, so teams, goals, assists and cards work for them as for
-- anyone else. The flag keeps them off the Players list, the leaderboard, records, player cards,
-- Player of the Month, booking awards and the coach pages. Adding a guest to the squad clears it.
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS is_guest boolean NOT NULL DEFAULT false;
