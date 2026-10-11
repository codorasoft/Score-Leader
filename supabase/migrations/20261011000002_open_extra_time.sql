-- Extra time can be open: 0 means one stretch with no set length, ended by the referee during the
-- match. 1 to 15 are still two halves of that many minutes, and NULL is no extra time. No row changes.
ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_extra_time_minutes_check;
ALTER TABLE public.sessions ADD CONSTRAINT sessions_extra_time_minutes_check CHECK (extra_time_minutes BETWEEN 0 AND 15);
