-- Player swaps are logged on the match timeline as a pair of linked 'swap' events:
-- each row's team_id is the team that player moved TO; the second row's
-- related_event_id points at the first.
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'swap';
