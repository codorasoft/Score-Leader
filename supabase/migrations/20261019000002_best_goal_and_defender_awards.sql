-- Two more session awards the admin picks (no vote): the session's best goal and best defender.
-- Each earns leaderboard points.
ALTER TYPE award_type ADD VALUE IF NOT EXISTS 'best_goal';
ALTER TYPE award_type ADD VALUE IF NOT EXISTS 'best_defender';
