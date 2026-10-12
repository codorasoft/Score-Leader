-- Coach's schedule: an item can also repeat every 2 (up to 4) weeks, or every month on the same
-- day number. No row changes: existing items keep repeating every week, or not at all. The app
-- already deployed keeps working: it sends neither new column, and `repeats` stays where it was.

ALTER TABLE public.schedule_items
  -- Every how many weeks the weekdays in repeat_days come round, counted in blocks of seven days
  -- from item_date
  ADD COLUMN repeat_every smallint NOT NULL DEFAULT 1,
  -- Every month on item_date's day number; a month without that day (the 31st, the 30th in
  -- February) is skipped
  ADD COLUMN repeat_monthly boolean NOT NULL DEFAULT false;

-- A generated column's rule cannot be changed in place: it is dropped and made again, now true
-- for monthly items too
ALTER TABLE public.schedule_items DROP COLUMN repeats;
ALTER TABLE public.schedule_items
  ADD COLUMN repeats boolean GENERATED ALWAYS AS (cardinality(repeat_days) > 0 OR repeat_monthly) STORED;

ALTER TABLE public.schedule_items
  DROP CONSTRAINT schedule_items_repeat_until_check,
  ADD CONSTRAINT schedule_items_repeat_until_check CHECK (
    repeat_until IS NULL OR ((cardinality(repeat_days) > 0 OR repeat_monthly) AND repeat_until >= item_date)
  ),
  -- An interval is for weekly repeats only
  ADD CONSTRAINT schedule_items_repeat_every_check CHECK (
    repeat_every BETWEEN 1 AND 4 AND (repeat_every = 1 OR cardinality(repeat_days) > 0)
  ),
  -- Weekly or monthly, never both
  ADD CONSTRAINT schedule_items_repeat_monthly_check CHECK (NOT (repeat_monthly AND cardinality(repeat_days) > 0));
