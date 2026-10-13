# Today in the App — Design Spec

**Date:** 2026-10-13
**Status:** Design agreed in conversation; awaiting review of this document

## 1. Goal

The coach keeps his days in the coach's schedule (spec of 2026-10-12), but nothing tells him
what is on today unless he opens that page. He wants to be told at the start of the day.

This is the first of two releases:

1. **Today in the app** (this spec): what he sees the first time he opens the app each day.
2. **Morning push** (its own spec, later): a notification that arrives with the app closed.

Decisions made with the user:

- **A popup once a day** lists today's items, on whatever admin page he lands on.
- **A Today card on Home** keeps the same list in view for the rest of the day.
- **One league at a time:** both cover the league he is in.
- **Tasks already ticked as done are left out.**
- **Rows are links.** Nothing is ticked or changed from the popup or the card.

No database change, no server function and no new feature key: everything here is for admins
who already have `schedule`.

## 2. Today's items

"Today" is the device's own date (`localToday()`), the same day the schedule page opens on.

The rows, in this order:

1. **Schedule items** on today (`itemsOn`): the timed ones by start time, then the all-day ones
   by name. A task whose `done_dates` holds today is left out.
2. **Match sessions** dated today, whatever their status.
3. **Training plans** dated today, only when the league has `training`.

This is the day list of the schedule page, minus the finished tasks.

Each row shows:

| Row | Dot | Small line | Main line | Opens |
|---|---|---|---|---|
| Schedule item | its kind's colour | its time (`timeLabel`), or "All day" | its title | the schedule page |
| Match session | session colour | "All day" | "Match session" | the session |
| Training plan | plan colour | "Training plan" | its title, when it has one | the plan |

The colours are the calendar's own (`DOT_COLOR`). The schedule page opens on today, so a row
that leads there needs no date in its link.

## 3. The popup

A component in the admin layout runs a check and, when today has rows, shows the popup over
the page.

**When the check runs.** Once for each league on each day on each device, and only when the
league has `schedule`. It runs when the admin area opens, when the league is switched, and
when the app comes back to the front on a day it has not handled yet (an app left open past
midnight).

**What the check does.** It reads today's schedule items, sessions and plans for the league
(`fetchScheduleItems` and `fetchScheduleExtras`, with today as both ends of the range) and
works out the rows.

- **Rows:** the popup opens, and the day is remembered as handled.
- **No rows:** nothing is shown, and the day is remembered as handled all the same. An item
  the coach adds for today afterwards does not bring up a popup about what he has just typed.
- **The read fails:** nothing is shown and nothing is remembered. It is tried again the next
  time the app is opened or comes back to the front. No toast of any kind, with no
  connection or with a refused request: he did not ask for anything.

**Not during a match.** On the match tracker (`…/sessions/:sessionId/match/:matchId`) the
check does not run, so the popup never covers the goal and card buttons. It runs when he
moves to any other page.

**A league left behind.** An answer that arrives after the league was switched is dropped,
and that league's day is not remembered.

**The popup itself:**

- Title **Today**, with the long date under it (`longDay`).
- The rows of section 2. A long list scrolls inside the popup.
- **Open schedule** (a link to the schedule page) and **Got it**.
- Got it, Escape, a tap outside, Open schedule and a tap on any row all close it.
- Built like the app's other dialogs: `role="dialog"`, `aria-modal`, named by its title;
  focus starts on Got it and Tab stays inside.

**Remembering the day.** One key on the device, `scoreleader.todaySeen`, holds the last
handled day for each league (`{ "<league id>": "2026-10-13" }`). When the device's storage is
blocked, the day is kept in memory instead, so the popup still shows only once until the
page is reloaded.

## 4. The Today card on Home

Home asks for today's items and extras together with its other requests, when the league has
`schedule`.

- The card is shown only when there are rows. It sits under the start / live card and above
  To do.
- Heading **Today** with the number of rows; the heading links to the schedule page.
- The same rows as the popup, each a link.
- Home reads again every time it is opened, so the card follows what was added, deleted or
  ticked since the popup. A Home left open past midnight reads again when the app comes back
  to the front on the new day, so the card never shows yesterday as today.
- If the schedule cannot be read, the card is left out and the rest of Home shows as usual.
- Without `schedule` nothing is asked and nothing is shown.

## 5. Code layout

| File | Purpose |
|---|---|
| `src/utils/schedule.ts` | `todayRows(items, extras, date)`: the ordered rows of section 2, a pure function |
| `src/lib/scheduleApi.ts` | `fetchToday(leagueId, date, withPlans)`: reads one day and returns its rows |
| `src/lib/todaySeen.ts` | reads and writes the handled day per league, with the in-memory fallback |
| `src/hooks/useLocalToday.ts` | the device's date, read again each time the app comes back to the front; shared by the check and Home |
| `src/lib/reportingFetch.ts` | `quietSignal()`: a request made with this signal is never reported |
| `src/components/TodayList.tsx` | the rows as links; shared by the popup and the card |
| `src/components/TodayDialog.tsx` | the popup |
| `src/components/TodayReminder.tsx` | the once-a-day check; shows `TodayDialog` |
| `src/layouts/AdminLayout.tsx` | renders `TodayReminder` |
| `src/pages/admin/HomePage.tsx` | the Today card |
| `src/locales/en.json`, `src/locales/ar.json` | Today, Open schedule, Got it, the count |

`TodayReminder` reads quietly: it gives `fetchToday` a `quietSignal()`, and the app's request
reporting says nothing about a request made with one. Muting toasts for a while
(`withNetworkToastsMuted`) does not fit here: the client tries a failed read again for several
seconds, and other screens' failed saves would be hidden meanwhile.

## 6. Testing

- **`todayRows`:** the order (timed, all-day, sessions, plans); a repeating item on and off
  today; a skipped day; a finished task left out and an unfinished one kept; a day with
  nothing.
- **`todaySeen`:** a day remembered per league; another league or another day is not
  handled; blocked storage falls back to memory.
- **`TodayReminder`:** opens with rows; stays closed with none and remembers the day; does
  not open twice on one day; opens again for another league; does nothing without
  `schedule`; does not run on the match tracker and runs on leaving it; a failed read shows
  nothing, is read quietly and is not remembered; a new day on coming back to the front runs
  it again.
- **`TodayDialog`:** the rows and their links; Got it, Escape and a tap outside close it;
  focus starts on Got it.
- **Home:** the card with rows and its links; the new day's rows after midnight on coming
  back to the front; no card with nothing today, without
  `schedule`, or when the read fails; plans only with `training`.
- **Arabic:** the popup and the card show their Arabic wording when the app is in Arabic
  (`inArabic`).

## 7. Out of scope

- The morning push with the app closed (release 2): push subscriptions, the morning job, a
  time zone per admin, the app icons.
- One list across several leagues.
- Ticking a task, or changing anything, from the popup or the card.
- A setting to switch the popup off, or to snooze it.
- Tomorrow's items, or a reminder shortly before an item's time.
