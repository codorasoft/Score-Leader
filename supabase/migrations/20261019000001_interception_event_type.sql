-- A defender winning the ball is logged on the match timeline as an 'interception' event
-- (one row, the player who won it and their team). It earns leaderboard points.
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'interception';
