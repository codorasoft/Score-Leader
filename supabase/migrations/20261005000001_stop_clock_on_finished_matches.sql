-- One-off cleanup: matches finished before the app stopped the clock on End Match were left
-- with timer_status 'running'. Stop them. Their real final time was never saved, so
-- timer_elapsed_seconds is left as recorded rather than guessed.
UPDATE public.matches
SET timer_status = 'stopped', timer_started_at = NULL
WHERE status = 'completed' AND (timer_status <> 'stopped' OR timer_started_at IS NOT NULL);
