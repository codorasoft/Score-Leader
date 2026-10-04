-- Match clock reading (seconds since kickoff, pauses excluded) when the event was recorded.
-- Values above 420 are added time beyond the 7-minute limit.
ALTER TABLE match_events
  ADD COLUMN IF NOT EXISTS elapsed_seconds int CHECK (elapsed_seconds >= 0);
