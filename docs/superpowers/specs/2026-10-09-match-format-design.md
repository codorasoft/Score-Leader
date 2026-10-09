# Match format: periods, extra time, penalties, draw rule — Design Spec

**Date:** 2026-10-09
**Status:** Approved in conversation; awaiting written review

## 1. Goal

Today every match is one 7-minute period that ends early at 2 goals, and a draw is settled by a
fixed rotation rule. The admin wants to choose, per session, how matches are played: a quick
single period, two halves, or a knockout with extra time and penalties, with the numbers
adjustable. The tracker, the public live page and the night's rotation then follow that choice.

Decisions made with the admin:

- The format is chosen **per session**, in the New-session popup, and applies to every match that night.
- The **goal limit** is part of the Quick preset only; Halves and Knockout play to the clock; the admin can set a limit or "none" on any custom format.
- When a Halves match ends level (no penalties), **the draw stands**: both teams go off and the next two in the queue play. With two teams the same two play again.
- **Half-time is a simple stop:** the clock runs over with "+", the admin taps "End 1st half", later "Start 2nd half". No break timer.
- **Presets are starting points.** Tapping Quick / Halves / Knockout fills the fields; the admin can change any number; last time's settings are remembered.
- Settings are **plain columns on `sessions`** with database checks.

## 2. Data

### `sessions` — six new columns

| Column | Type / check | Default (= today) | Meaning |
|---|---|---|---|
| `period_count` | smallint, 1 or 2 | 1 | halves in regular time |
| `period_minutes` | smallint, 1–45 | 7 | length of each regular period |
| `extra_time_minutes` | smallint null, 1–15 | null | length of each of the two extra-time halves; null = no extra time |
| `penalties` | boolean | false | shoot-out when still level after regular time (and extra time, if any) |
| `goal_limit` | smallint null, 1–10 | 2 | match ends the moment a team reaches it, in any regular period; null = none |
| `draw_rule` | text, `'stay'` or `'draw'` | `'stay'` | what happens on the pitch when a match ends level and `penalties` is false (see §4) |

Presets (values the chips fill in):

| Preset | periods | minutes | extra time | penalties | goal limit | draw rule |
|---|---|---|---|---|---|---|
| Quick | 1 | 7 | none | no | 2 | stay |
| Halves | 2 | 10 | none | no | none | draw |
| Knockout | 2 | 10 | 5 | yes | none | (not applicable; stored as `stay`) |

A format whose six values match a preset is shown with that preset's name; anything else is shown as "Custom". The name is derived, never stored.

### `matches` — four new columns

| Column | Type / check | Default | Meaning |
|---|---|---|---|
| `period` | smallint 1–5, NOT NULL | none (filled by trigger, see below) | 1–2 regular halves, 3–4 extra time, 5 shoot-out |
| `period_seconds` | smallint[] | `{}` | actual length of each finished period, appended when it ends (overrun included) |
| `penalties_team1` | smallint null, ≥ 0 | null | shoot-out score (today shown, never saved) |
| `penalties_team2` | smallint null, ≥ 0 | null | |

The existing clock columns (`timer_status`, `timer_started_at`, `timer_elapsed_seconds`) describe **the current period**. Ending a period appends its elapsed seconds to `period_seconds` and freezes the clock (`timer_status = 'stopped'`); starting the next period sets `period + 1`, `timer_elapsed_seconds = 0`, `timer_status = 'running'`. Total match time = sum of `period_seconds` + current period clock.

`draw_resolved_by` gains the allowed value `'extra_time'`. A true draw is `is_draw = true, winner_team_id = null, draw_resolved_by = null`.

### `match_events` — one new column

`period smallint NOT NULL DEFAULT 1, CHECK 1–5`. `elapsed_seconds` stays "seconds into that period". Display: "2H 03:12" when the match has more than one period, "03:12" otherwise. Stats that need a match-wide time (records such as "fastest goal") add the lengths of the earlier periods from `period_seconds`.

### Old rows

All existing sessions, matches and events get the defaults above, which reproduce today's behaviour exactly. Verified by computing leaderboard, records and standings for the Eagles league before and after the migration and diffing the output.

### Old app versions

A trigger `match_period_from_old_apps` (same pattern as `match_queue_from_old_apps`) refuses an insert into `matches` whose session has `period_count = 2` or `extra_time_minutes IS NOT NULL` when the row comes from an app that doesn't know periods. Detection: the old app never sends `period`; the new app always sends it explicitly. The column has no default, so in the BEFORE INSERT trigger `NEW.period IS NULL` means an old app: on a single-period session the trigger sets it to 1, on any other session it raises. Existing rows are set to 1 by the migration. Error text: "This app version is out of date. Reload the page and try again." Old apps on Quick sessions keep working.

## 3. How a match runs

The period sequence is built from the session:

```
regular:   [P1] (+ [P2] if period_count = 2)
level after regular time?
  extra_time_minutes → [ET1] [ET2]
  level after extra time (or no extra time) and penalties → [PENS]
  otherwise → draw (§4)
```

Within a period everything is as today: Start, Pause/Resume, goals, cards, swaps, "+" overrun, server-clock timing, offline outbox.

Transitions (all go through the outbox like goals):

- **Goal limit reached** (regular periods only) → match ends immediately with that winner, reason `goalLimit`.
- **Period time up** → main button becomes "End 1st half" / "End 2nd half" / "End extra time 1/2". Tapping before time asks for confirmation (existing early-end dialog). Ending a period appends its elapsed seconds to `period_seconds` and stops the clock.
- **Between periods** → screen with score, period finished, and "Start 2nd half" / "Start extra time" / "Go to penalties" / "End match" as applicable. No events can be recorded (`canRecordEvents` requires a running or paused clock, unchanged).
- **After the last regular period:** leader → end (`timeUp`); level → extra time if configured, else penalties if configured, else draw.
- **After ET2:** leader → end (`draw_resolved_by = 'extra_time'`, `is_draw = false`); level → penalties if configured, else draw.
- **Penalties** → existing shoot-out screen; on confirm saves `penalties_team1/2`, `is_draw = true`, `draw_resolved_by = 'penalties'`, `winner_team_id`.

The whole sequence lives in one pure module, `src/utils/matchFormat.ts`: `periodsFor(session)`, `nextStep(session, match)` → one of `{kind: 'play' | 'endPeriod' | 'startPeriod' | 'penalties' | 'endMatch' | 'draw', label…}`, `totalSeconds(match)`, `periodLabel(period, session)`, `presetName(session)`. The tracker and the live page only render what it returns.

## 4. Draws, who plays next, standings

When a match ends level after all periods:

1. `penalties = true` → shoot-out decides; saved as today plus the score.
2. `penalties = false` → `draw_rule`:
   - `stay` (today's rule): the team already on the pitch loses its place, the challenger stays. In match 1 nobody was already on → shoot-out (as today).
   - `draw`: `is_draw = true, winner_team_id = null`. Both teams go off; `resolveMatch` puts them at the back of the queue in their current order and the next two play. With `team_count = 2` the same two play again.

Standings (`computeStandings`) and player stats already count a level score as a draw and ignore who stayed on; they need no change. Player of the Month points: a draw gives no win point (unchanged). `nextMatchToStart` / `resolveMatch` in `matchRotation.ts` gain the `draw` branch; everything else there is unchanged.

Session detail: the format summary line is read-only once the first match has started.

## 5. Screens

- **NewSessionDialog:** chips Quick · Halves · Knockout; fields periods (1/2), minutes, extra time (off/minutes), penalties (switch), goal limit (off/number), draw rule (stay/draw; disabled when penalties on). One-line summary in words. Remembers the last session's six values (same mechanism as team count). Saved with the session insert.
- **SessionDetailPage:** summary line under the date.
- **MatchTrackerPage:** period label above the clock; main button per §3; between-periods screen; penalty screen unchanged except saving; "so far tonight" lists show draws.
- **LiveSessionPage:** period label / "Half-time" under the clock; shoot-out score beside the final score ("2–2, pens 4–3"); timeline entries prefixed with period when the match has more than one.
- **HistoryPage, SessionMatchList, session summary image:** results formatted as "2–2 (draw)", "1–1, pens 4–3", "2–1 aet".
- **Locales:** every new string in `en.json` and `ar.json`.

## 6. Testing

Written before the code, per module:

- `matchFormat`: period sequences for the three presets and custom values; goal limit mid-period; early end; `totalSeconds` with overruns; labels; `presetName`.
- `matchRotation` / `decideResult`: full matrix of penalties × draw rule × match number × (2 teams, 3+ teams); what is saved and who plays next.
- `matchClock` / events: event times carry their period; display with and without periods.
- `NewSessionDialog`: chips fill fields; editing → "Custom"; disabled draw rule when penalties on; last values remembered; ranges.
- `MatchTrackerPage`: halves flow end to end (start, end half, start 2nd, end match); knockout flow into extra time and penalties with saved score; Quick session unchanged (existing tests still pass).
- `LiveSessionPage`: labels, half-time, pens score; old session looks unchanged.
- Migration: defaults on old rows; the old-app guard (insert without `period` into a two-period session is refused).
- Production check after each PR: the live Eagles pages render identically for existing sessions.

## 7. Delivery

Three pull requests, each green on its own:

1. **Data + settings:** migration (applied to Zurich after a dry run), types, `matchFormat.ts`, popup, summary lines, `period` written on every new match and event. Everything still plays as Quick.
2. **Periods on the pitch:** tracker sequence, between-periods screen, extra time, saved penalties, live page labels, result formatting.
3. **Draw rule and rotation:** `draw` branch in rotation, "so far tonight" lists, history formatting of draws.

Out of scope: a half-time countdown, per-match format overrides, named reusable formats, changing a session's format after its first match.
