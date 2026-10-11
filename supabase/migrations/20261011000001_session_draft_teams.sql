-- The team builder's arrangement before the teams are confirmed: player ids per team, in colour
-- order (green, blue, yellow, ...). Kept with the session so reopening the page, on any device,
-- shows the same teams instead of a new shuffle. Cleared when the teams are confirmed; confirmed
-- teams live in teams / team_players as before. Apps from before this column ignore it.
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS draft_teams jsonb;
