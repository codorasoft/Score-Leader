# Coach's Schedule — Design Spec

**Date:** 2026-10-12
**Status:** Design agreed in conversation; built directly, reviewed through its pull request

## 1. Goal

The coach wants one place to see and plan his days: his own tasks, his training days with the
team, his matches and anything else, on a full month calendar. Things the app already knows the
date of (match sessions, training plans) must show there without being typed again.

Decisions made with the user:

- A new section, **Schedule**, with a **full month calendar** and a list of the chosen day.
- Four kinds of item, each with its own colour: **Task, Training, Match, Other**.
- **Repeats are in the first version:** an item can repeat every week on chosen weekdays, with an optional last day.
- **Private:** only the league's owner sees it. No public page.
- **Per league**, like players and training plans.
- **Switchable** per admin by the superadmin: feature key `schedule`.

## 2. Data

### `schedule_items` (per league)

| Column | Type / check | Notes |
|---|---|---|
| `id` | uuid PK, `gen_random_uuid()` | |
| `league_id` | uuid NOT NULL → `leagues(id)` ON DELETE CASCADE | set by the app |
| `kind` | text, one of `task`, `training`, `match`, `other` | |
| `title` | text, trimmed length 1–80 | |
| `item_date` | date NOT NULL | the day; for a repeating item, the first day of the series |
| `start_time`, `end_time` | time NULL | no start = all day; an end needs a start and must be later |
| `note` | text NULL, at most 500 characters | |
| `repeat_days` | smallint[] NOT NULL DEFAULT `{}` | weekdays 0 (Sunday) – 6 (Saturday) it repeats on; empty = does not repeat; no duplicates |
| `repeat_until` | date NULL | last day of the series, inclusive, never before `item_date`; only with `repeat_days` |
| `repeats` | boolean, generated: `repeat_days` is not empty | so one plain filter separates the two cases |
| `skipped_dates` | date[] NOT NULL DEFAULT `{}` | days of the series that were deleted on their own |
| `done_dates` | date[] NOT NULL DEFAULT `{}` | days on which the item was ticked as done |
| `created_at`, `updated_at` | timestamptz, `now()` | |

Index: `(league_id, item_date)`.

**When an item is on a day D:**

- not repeating: `D = item_date`;
- repeating: `D ≥ item_date`, `D ≤ repeat_until` when set, the weekday of D is in `repeat_days`, and D is not in `skipped_dates`.

A repeating item's own `item_date` is on the calendar only when its weekday is one of `repeat_days`.

### Feature key

`schedule` becomes the 16th key in `supabase/functions/_shared/features.ts` and in `valid_features`. No dependency. Nobody has it until the superadmin ticks it. The `create-admin` function is redeployed because it shares the list.

## 3. Database rules

`schedule_items`: read and write only for the league's owner, and only while the owner has `schedule` (`owns_league(league_id) AND league_has_feature(league_id, 'schedule')`), for `authenticated` only. Visitors and other admins get nothing. The superadmin gets nothing.

## 4. The page

Route `/admin/:slug/schedule`, behind the feature; a **Schedule** tab after Coach Board.

- **Month:** the month's name, previous / next arrows and **Today**. A grid of seven columns with the weekday names; days of the neighbouring months fill the first and last weeks, dimmed. The week starts on **Saturday in Arabic** and **Monday in English**.
- **A day cell** shows its number and up to four coloured dots, one per kind of thing on it. Today is ringed; the chosen day is filled.
- **The chosen day** (today when the page opens) is listed under the grid: timed items first by start time, then all-day items; each with its time or "All day", its title, its kind, and a repeat mark when it repeats.
- **Tasks** have a tick box; ticking marks that day as done (`done_dates`).
- **From the app itself**, not editable here, each a link to its own page: the league's **match sessions** on their date, and (when the league has `training`) its **training plans** on theirs.
- **Add** opens the item form for the chosen day. Tapping an item opens the same form filled in.

### The item form

Kind (four chips), title, date, optional start and end time, optional note, and **Repeat every week on** with seven weekday chips and an optional **Until** date. Turning on a first weekday is enough to make it repeat.

- Save is off without a title, with an end time that is not after the start, or with an Until before the date.
- **Delete**, for an existing item: a repeating one asks **Only this day** (the day joins `skipped_dates`) or **All days** (the row is deleted). A change to a repeating item applies to the whole series.

Loading, load failure with Retry, and the error toast on a refused save work as on the other pages. The calendar needs a connection; nothing is queued offline.

## 5. Code layout

| File | Purpose |
|---|---|
| `supabase/migrations/20261012000002_schedule.sql` | the table, its checks and rules, `valid_features` |
| `supabase/functions/_shared/features.ts` | add `schedule` |
| `src/utils/schedule.ts` | pure calendar logic: month grid, "is it on this day", a day's items, a day's dots, form checks |
| `src/lib/scheduleApi.ts` | queries: the items that can touch a range of days, sessions and plans in the range, save, delete, skip a day, tick a day |
| `src/components/MonthCalendar.tsx` | the grid |
| `src/components/ScheduleItemDialog.tsx` | the form |
| `src/pages/admin/SchedulePage.tsx` | the page |
| `src/router.tsx`, `src/layouts/AdminLayout.tsx` | route and tab |
| `scripts/backup.ts` | the table joins the backup (optional while absent) |

## 6. Testing

- **Calendar logic:** the grid of a month for both week starts; repeating and non-repeating items on and off a day, with Until and skipped days; ordering of a day; dots; form checks.
- **Database rules** (in `supabase/tests/tenancy.test.sql`): 16 valid keys; the owner reads and writes only with the feature; another admin, the superadmin and visitors read nothing and change nothing; each check refuses bad rows; deleting the league removes its items.
- **Pages and components:** the grid, moving between months, choosing a day, adding, editing, deleting one day or all, ticking a task, sessions and plans shown as links, the tab and the route with and without the feature.

## 7. Out of scope

- Reminders and notifications.
- Repeats by other rules (every third week, the first Monday of a month, every year).
- Changing a single day of a repeating item (only deleting it).
- Sharing the schedule with players or anyone else.
- One calendar across several leagues.

## 8. Added on 2026-10-12: more repeats, and week and day views

### Repeats

Two new columns on `schedule_items`:

- `repeat_every` smallint, 1–4, default 1: every how many weeks the weekdays in `repeat_days` come round. Weeks are counted in blocks of seven days from `item_date`, so the answer does not depend on the day a calendar week starts on. More than 1 needs `repeat_days`.
- `repeat_monthly` boolean, default false: every month on the day number of `item_date`. A month without that day (the 31st; the 30th in February) is skipped. Never together with `repeat_days`.

`repeats` is now true for monthly items too, and `repeat_until` is allowed for them.

The form offers **Does not repeat / Every week / Every 2 weeks / Every month**. The weekly choices show the weekday chips, starting on the date's own weekday; at least one weekday is needed.

### Views

A **Month / Week / Day** switch; the last one used is remembered on the device.

- **Week** and **Day** show the hours down the page (07:00–21:00, stretched to hold an earlier or later item) with one column per day. A timed item is a block at its time, as tall as it is long (one hour when it has no end); items that overlap sit side by side.
- What has no time (all-day items, match sessions, training plans) sits in a row above the hours.
- Tapping an empty hour starts a new item on that day at that time. Tapping an item opens it. In the week, tapping a day's heading opens that day.
- The arrows move a month, a week or a day, by the view. Today returns to today.

### Tab

The tab is named **Coach's schedule** (جدول المدرب). On a phone a tab name too long for its column wraps onto a second line.
