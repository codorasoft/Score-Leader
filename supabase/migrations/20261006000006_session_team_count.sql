-- Sessions choose how many teams play and how many players each team has; matches keep the
-- order of the teams waiting to come on (winner stays, loser joins the back of the queue).

-- More team colours, in the order teams get them: green, blue, yellow, orange, purple, white
ALTER TYPE team_color ADD VALUE IF NOT EXISTS 'orange';
ALTER TYPE team_color ADD VALUE IF NOT EXISTS 'purple';
ALTER TYPE team_color ADD VALUE IF NOT EXISTS 'white';

-- Earlier sessions were all 3 teams of 5
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS team_count smallint NOT NULL DEFAULT 3 CHECK (team_count BETWEEN 2 AND 6),
  ADD COLUMN IF NOT EXISTS team_size smallint NOT NULL DEFAULT 5 CHECK (team_size BETWEEN 3 AND 11);

-- The waiting queue; the first team comes on next. A 2-team session has no waiting team.
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS queue uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.matches ALTER COLUMN waiting_team_id DROP NOT NULL;
UPDATE public.matches SET queue = ARRAY[waiting_team_id] WHERE waiting_team_id IS NOT NULL AND queue = '{}';
