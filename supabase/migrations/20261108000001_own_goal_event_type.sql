-- An own goal is logged as an 'own_goal' event: player_id is the player who put the ball in their
-- own net, team_id is the team the goal counts for (the other side). It adds to that team's score
-- but is not a goal for the player, so it never counts toward scorer stats, records or awards.
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'own_goal';
