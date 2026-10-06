# Session setup popup and any number of teams: design

**Date:** 2026-10-06
**Status:** Approved in conversation, awaiting spec review

## 1. Goal

Starting a session should take one popup on Home instead of a separate tab. The admin decides how many teams play and how many players each team has, instead of the fixed 3 teams × 5 players.

Decisions from the conversation:
- "New session" leaves the navigation bar. **Start new session** on Home opens a popup.
- The popup sets the **date**, the **number of teams** and the **players per team**.
- If fewer players come than teams × per team, team sizes differ by at most one.
- With more than 3 teams, waiting teams form a **queue**: the winner stays, the loser goes to the back of the queue, and the front team comes on. With 3 teams this is today's rule.

## 2. Data model (one migration, applied by Claude)

`sessions`
- `team_count smallint NOT NULL DEFAULT 3 CHECK (team_count BETWEEN 2 AND 6)`
- `team_size smallint NOT NULL DEFAULT 5 CHECK (team_size BETWEEN 3 AND 11)`
- Existing sessions get the defaults (3 × 5), which matches how they were played.

`matches`
- New `queue uuid[] NOT NULL DEFAULT '{}'`: the waiting teams in order; the first comes on next.
- `waiting_team_id` becomes nullable, because a 2-team session has no waiting team. For every new match it is set to `queue[1]` (Postgres arrays start at 1), or NULL when the queue is empty. Existing code and data that read it keep working.
- Backfill: `queue = ARRAY[waiting_team_id]` for existing rows.

`team_color` enum: add `orange`, `purple`, `white`. Colour order for teams: green, blue, yellow, orange, purple, white. Red is left out because the league's teams were moved from red to green earlier.

There are no new tables. The tenancy rules hold: both tables already have `league_id` and RLS, and no new feature switch is needed.

## 3. Creating a session

- Remove the **New session** item from the admin navigation bar (`AdminLayout`).
- **Start new session** on Home becomes a button that opens `NewSessionDialog`:
  - Date: defaults to today.
  - Number of teams: a stepper, 2–6.
  - Players per team: a stepper, 3–11.
  - A summary line: "Up to N players" (teams × per team).
  - The defaults come from the league's most recent session, or 3 × 5 when there is none.
  - **Create** inserts the session (`draft`, with both numbers) and opens the attendance page. **Cancel** closes the popup without saving anything.
  - The dialog follows the delete-league dialog's accessibility: labelled dialog, focus on open, Escape closes, Tab stays inside.
- Attendance moves to its own page, `/admin/:slug/sessions/:sessionId/players` (`AttendancePage`, reusing `AttendancePicker`):
  - The limit is `team_count × team_size` instead of the hard-coded 15.
  - Confirming needs at least `team_count` players (one per team).
  - The page shows the session's date and its "N teams × M players".
- `/admin/:slug/sessions/new` (bookmarks, old links) redirects to Home with the popup open.
- Home's "Continue" for a `draft` session goes to attendance when it has no players yet, otherwise to the team builder, as today.

## 4. Teams

- New `src/lib/teamColors.ts`: the ordered colour list plus each colour's dot, background and border classes and its hex value (for share images). It replaces the colour maps currently copied across about 15 components and pages.
- `balanceTeams(players, teamCount, strength, synergy)` returns `Player[][]` with `teamCount` teams:
  - one goalkeeper per team while there are enough keepers;
  - sizes differ by at most one;
  - the same strength, form and duo logic as today;
  - `needsGkAssignment` when there are fewer keepers than teams.
- `teamEdit` (swap/move) works on `Player[][]` instead of exactly three teams.
- `TeamSwapBoard` shows N columns: 2–3 per row on phones, wrapping as needed.
- The team builder reads `team_count` from the session and creates that many teams in colour order.

## 5. Rotation

`src/utils/matchRotation.ts`:
- `setupFirstMatch(teams, chosen?)`:
  - the two chosen teams play; with no choice, a random two play;
  - the queue is the remaining teams in colour order;
  - this replaces "choose the waiting team".
- `resolveMatch(match)`: the winner stays as team1, the queue's first team comes on as team2, and the new queue is the rest of the queue plus the loser.
  - With 2 teams the queue is always empty, so team2 is the loser and the same two play again.
  - With 3 teams the result is identical to today's.
- `decideResult` is unchanged:
  - in match 1, a draw goes to penalties;
  - later, a draw goes to team2, the team that came on.
  - With 2 teams after match 1, team2 is the previous loser, so it wins a draw. This is consistent with "the team that waited longer".
- `nextMatchToStart` (session page recovery) uses the same rules and needs the session's team count instead of exactly 3.
- `FirstMatchPicker` becomes "who plays first": pick two teams, or random.

Everywhere that creates a match (team builder, match tracker, session page "Start match N") writes `queue` and `waiting_team_id = queue[0] ?? null`.

## 6. Screens that show the waiting team

The match tracker, live score page, session page (upcoming match), Home live block and match result dialog:
- show **"Next up: Orange Team"** when the queue has one team;
- show **"Next up: Orange Team, then Purple Team"** when it has more;
- show nothing for 2-team sessions.

The penalty shootout, standings, top players, records, leaderboard, profiles and share images already loop over the session's teams. Each is checked with a 4-team session in tests.

## 7. Errors and edge cases

- The popup's Create button is disabled while saving. On failure it shows the translated server error and stays open.
- The attendance limit blocks extra picks, as it does today.
- A session saved before this change behaves exactly as before: 3 teams, `queue` backfilled.
- A 2-team session never shows a waiting team and never writes `waiting_team_id`.

## 8. Testing

- Rotation: 2, 3, 4 and 5 teams; draws in match 1 and later; penalties; the queue order across several matches; 3-team results identical to the current rules.
- Balancer: 2–6 teams, uneven attendance, the keeper rule, `needsGkAssignment`.
- Pages:
  - Home popup: defaults, create, cancel, error;
  - nav without New session; old-link redirect;
  - attendance limit;
  - team builder with 4 teams;
  - match tracker ending a match in a 4-team session;
  - live page "Next up";
  - session page recovery with 4 teams.
- Migration: dry-run, then apply. Check the new columns, the enum values and the backfill through the API.

## 9. Out of scope

- Changing a session's team count after teams are made.
- More than 6 teams or colours.
- Other rotation styles, such as both teams going off, or the admin picking every match.
