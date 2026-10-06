# Session Setup Popup and Any Number of Teams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start sessions from a Home popup (date, number of teams, players per team) and support 2–6 teams with a winner-stays queue rotation.

**Architecture:**
- Sessions store `team_count` and `team_size`; matches store the ordered waiting `queue`.
- Pure helpers carry all the rules and the pages call them:
  - `matchRotation.ts` for rotation;
  - `teamBalancer.ts` and `teamEdit.ts` for teams;
  - `teamColors.ts` for colours.
- All UI that assumed 3 teams reads the session's teams instead.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind, Supabase (Postgres + RLS), Vitest with the in-memory fake (`src/test/fakeSupabase.ts`).

**Spec:** `docs/superpowers/specs/2026-10-06-session-setup-and-team-count-design.md`

## Global Constraints

- Teams: 2–6 (`team_count`). Players per team: 3–11 (`team_size`). Defaults 3 and 5.
- Colour order: `green, blue, yellow, orange, purple, white`. Never red.
- Attendance limit is `team_count × team_size`. Confirm needs at least `team_count` players.
- The match row always gets `queue` (string[]) and `waiting_team_id = queue[0] ?? null`.
- With 3 teams, every rotation result must equal today's.
- Draw rules are unchanged (`decideResult`): in match 1 a draw goes to penalties; later, a draw goes to team2.
- Every new UI string goes in both `src/locales/en.json` and `src/locales/ar.json`.
- Root-table reads stay filtered by `league_id`. No new feature switch.
- Claude applies the migration (`supabase db push --linked --dry-run`, then `--yes`) and verifies it through the API.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A match created by an older cached app version** (`queue` = `{}` but `waiting_team_id` set). The next rotation must treat the queue as `[waiting_team_id]`. Test in Task 3.
2. **Uneven attendance** (4 teams × 5, only 13 players). Team sizes must be 4/3/3/3, and each team gets a keeper while keepers last. Test in Task 4.
3. **2-team session.** The same two teams always play, no "Next up" is shown, a draw in match 1 goes to penalties, and the match row stores `waiting_team_id` NULL. Tests in Tasks 3 and 6.
4. **The popup's Create fails** (network or RLS). The popup stays open with the translated error and no navigation happens. Test in Task 8.
5. **A 3-team session already in progress during the deploy** (backfilled queue). Ending its next match produces exactly today's next match. Test in Task 6.

---

### Task 1: Database columns, types and fixtures

**Files:**
- Create: `supabase/migrations/20261006000006_session_team_count.sql`
- Modify: `src/lib/types.ts`, `src/test/fixtures.ts`, and every file `npm run typecheck` flags for a nullable `waiting_team_id`

**Interfaces:**
- Produces:
  - `Session.team_count: number`, `Session.team_size: number`
  - `Match.queue: string[]`, `Match.waiting_team_id: string | null`
  - `TeamColor = 'green' | 'blue' | 'yellow' | 'orange' | 'purple' | 'white'`
  - Fixtures: `session` has `team_count: 3, team_size: 5`; `match()` defaults `queue: ['ty']`.

- [ ] **Step 1: Write the migration**
  - Postgres requires a new enum value to be committed before it is used, and nothing here uses it.
  - `ALTER TYPE team_color ADD VALUE IF NOT EXISTS` for `orange`, `purple` and `white`.
  - `sessions`: add `team_count smallint NOT NULL DEFAULT 3 CHECK (team_count BETWEEN 2 AND 6)` and `team_size smallint NOT NULL DEFAULT 5 CHECK (team_size BETWEEN 3 AND 11)`.
  - `matches`: add `queue uuid[] NOT NULL DEFAULT '{}'`, then `ALTER COLUMN waiting_team_id DROP NOT NULL`, then `UPDATE matches SET queue = ARRAY[waiting_team_id] WHERE waiting_team_id IS NOT NULL AND queue = '{}'`.
- [ ] **Step 2: Dry-run, then apply.** Run `supabase db push --linked --dry-run`. Expected: only `20261006000006_session_team_count.sql`. Then run `supabase db push --linked --yes`.
- [ ] **Step 3: Verify through the API.** Run `supabase db query --linked "select team_count, team_size from sessions limit 1"`, `select count(*) from matches where queue = '{}'` (expect 0), and `select enum_range(null::team_color)` (lists all 7 values, red included).
- [ ] **Step 4: Update the types and fixtures** as in Interfaces. Run `npm run typecheck`. Fix each error by handling `null` where the code reads `waiting_team_id`; no behaviour change.
- [ ] **Step 5:** Run `npx vitest run`. Expected: all pass.
- [ ] **Step 6:** Commit: `feat(db): sessions store team count and size; matches store the waiting queue`.

### Task 2: One place for team colours

**Files:**
- Create: `src/lib/teamColors.ts`, `src/lib/teamColors.test.ts`
- Modify: every file holding its own colour map:
  - `CardDialog`, `FirstMatchPicker`, `GoalDialog`, `MatchResultDialog`, `MatchTimeline`, `SessionMatchList`, `SessionStandings`, `TeamSwapBoard`
  - `shareImage.ts`
  - `HomePage`, `MatchTrackerPage`, `SessionDetailPage`, `LiveSessionPage`, `PlayerProfilePage`, `RecordsPage`

**Interfaces:**
- Produces: `TEAM_COLORS: readonly TeamColor[]` (spec order) and `teamStyle(color: TeamColor): { dot: string; card: string; board: string; hex: string }`.
  - `dot`: the class used for the small dot (today `bg-green-500` and so on);
  - `card`: the score-card class (today `bg-green-900/40 border-green-600`);
  - `board`: the team-builder column class (today `border-green-500 bg-green-900/20`);
  - `hex`: the share-image colour.
  - Orange, purple and white use Tailwind orange-500, purple-500 and gray-100. White's text stays readable on dark: `card` uses `bg-gray-100/10 border-gray-200`.

- [ ] **Step 1: Write the failing test.** `TEAM_COLORS` equals `['green','blue','yellow','orange','purple','white']`. `teamStyle('green')` keeps today's exact class strings and `hex: '#22c55e'`. Every colour has non-empty `dot`, `card`, `board` and `hex`.
- [ ] **Step 2:** Run `npx vitest run src/lib/teamColors.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `teamColors.ts`. Replace each local map with `teamStyle(...)`. Keep markup otherwise unchanged.
- [ ] **Step 4:** Run `npx vitest run` and `npm run typecheck`. Expected: all pass, with no snapshot or class assertion changes for green, blue and yellow.
- [ ] **Step 5:** Commit: `refactor: team colours defined once, with orange, purple and white`.

### Task 3: Queue rotation

**Files:**
- Modify: `src/utils/matchRotation.ts`, `src/utils/matchRotation.test.ts`

**Interfaces:**
- Produces:
  - `type NextMatch = { team1Id: string; team2Id: string; queue: string[] }`
  - `setupFirstMatch(teams: Team[], playing?: [string, string]): NextMatch`
    - `playing` absent: a random two teams play.
    - The queue is the other teams in `TEAM_COLORS` order.
  - `resolveMatch(match: Match): NextMatch`
    - Throws without a winner.
    - `waiting = match.queue.length ? match.queue : match.waiting_team_id ? [match.waiting_team_id] : []`.
    - The winner becomes team1. Team2 is `waiting[0]`, or the loser when `waiting` is empty. The queue becomes `[...waiting.slice(1), loser]`, or `[]` when `waiting` is empty.
  - `nextMatchToStart(matches: Match[], teams: Team[], playing?: [string, string]): (NextMatch & { matchNumber: number }) | null`. Same rules as today, but any team count ≥ 2.
  - `matchRowFields(next: NextMatch): { team1_id: string; team2_id: string; queue: string[]; waiting_team_id: string | null }`
  - `decideResult` is unchanged.

- [ ] **Step 1: Write the failing tests**
  - 3 teams: for each of the existing 3-team cases, the new result equals the old `{nextTeam1Id, nextTeam2Id, nextWaitingTeamId}` mapped to `{team1Id, team2Id, queue: [waiting]}`.
  - 4 teams `g b y o`, match 1 g v b, queue `[y,o]`, g wins: next is g v y, queue `[o,b]`. Then y wins: next is y v o, queue `[b,g]`.
  - 5 teams: the queue keeps order over three matches.
  - 2 teams: g v b, b wins: next is b v g, queue `[]`. `matchRowFields` gives `waiting_team_id: null`.
  - Old match: `queue: []`, `waiting_team_id: 'y'` resolves as if `queue = ['y']`.
  - `setupFirstMatch(4 teams, ['b','o'])`: team1/team2 are b and o, queue `[g, y]`.
  - `nextMatchToStart` with 4 teams and no matches uses `playing`. After a finished 4-team match, it uses that match's queue.
  - `decideResult`: a match-1 draw with 2 teams gives `winner_team_id: null` (penalties).
- [ ] **Step 2:** Run `npx vitest run src/utils/matchRotation.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the signatures above. Remove the old `NextMatchConfig` shape. Update its callers' imports only enough to compile; Task 6 migrates them properly.
- [ ] **Step 4:** Run `npx vitest run src/utils/matchRotation.test.ts` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: winner-stays queue rotation for any number of teams`.

### Task 4: Balancing and editing N teams

**Files:**
- Modify: `src/utils/teamBalancer.ts`, `src/utils/teamEdit.ts`, and their tests

**Interfaces:**
- Produces:
  - `balanceTeams(players: Player[], teamCount: number, strength?, synergy?): { teams: Player[][]; needsGkAssignment: boolean }`
  - `type Teams = Player[][]`, replacing `ThreeTeams`.
  - `swapPlayers(teams: Teams, aId, bId): Teams`
  - `movePlayer(teams: Teams, playerId, toTeam): Teams`
  - `teamStars` is unchanged.

- [ ] **Step 1: Write the failing tests**
  - `balanceTeams(13 players with 2 GKs, 4)`: sizes are `[4,3,3,3]` in some order, each of 2 teams has one GK, and `needsGkAssignment` is true.
  - `balanceTeams(12 players with 4 GKs, 4)`: sizes are all 3, one GK each, and `needsGkAssignment` is false.
  - `balanceTeams(10, 2)`: two teams of 5.
  - The existing 3-team tests pass with `teamCount` 3.
  - `swapPlayers` and `movePlayer` work across 5 teams.
- [ ] **Step 2:** Run `npx vitest run src/utils/teamBalancer.test.ts src/utils/teamEdit.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Generalise the loops from `[0,1,2]` and `3` to `teamCount`; the algorithm is otherwise unchanged.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: balance and edit any number of teams`.

### Task 5: Team builder with N teams

**Files:**
- Modify: `src/components/TeamSwapBoard.tsx`, `src/components/FirstMatchPicker.tsx`, `src/pages/admin/TeamBuilderPage.tsx`, `src/pages/admin/TeamBuilderPage.test.tsx`, `src/components/TeamSwapBoard.test.tsx`, locales

**Interfaces:**
- Consumes: Task 2 `TEAM_COLORS` and `teamStyle`; Task 3 `setupFirstMatch` and `matchRowFields`; Task 4 `balanceTeams` and `Teams`.
- Produces:
  - `TeamSwapBoard` props: `{ teams: Teams; colors: TeamColor[]; onChange; strengthOf? }`. The grid is `grid-cols-2 sm:grid-cols-3`.
  - `FirstMatchPicker` props: `{ colors: TeamColor[]; playing: [TeamColor, TeamColor] | null; onChange(p: [TeamColor, TeamColor] | null) }`. It shows "Random" plus a pick-two control.
  - New strings `teamBuilder.firstMatchPick` ("Who plays first?") and `teamBuilder.pickTwo` ("Pick two teams"). `teamBuilder.firstMatchWaits` is removed.

- [ ] **Step 1: Write the failing tests** in `TeamBuilderPage.test.tsx`
  - A session with `team_count: 4` and 13 attending players shows 4 team columns (Green, Blue, Yellow, Orange).
  - Choosing Blue and Orange, then Confirm, creates 4 teams in colour order.
  - Match 1 is Blue v Orange with `queue` = [green id, yellow id] and `waiting_team_id` = green id.
  - The existing 3-team test passes with "Blue Team waits" replaced by picking Green and Yellow (Blue waits).
- [ ] **Step 2:** Run `npx vitest run src/pages/admin/TeamBuilderPage.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement:
  - load the session's `team_count`;
  - `colors = TEAM_COLORS.slice(0, team_count)`;
  - insert the teams;
  - build match 1 with `setupFirstMatch(created, playingIds)` and `matchRowFields`.
- [ ] **Step 4:** Run `npx vitest run src/pages/admin/TeamBuilderPage.test.tsx src/components/TeamSwapBoard.test.tsx` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: team builder makes the session's number of teams`.

### Task 6: Creating matches and showing who is next

**Files:**
- Create: `src/components/NextUp.tsx`, `src/components/NextUp.test.tsx`
- Modify: `MatchTrackerPage.tsx`, `MatchResultDialog.tsx`, `SessionDetailPage.tsx`, `LiveSessionPage.tsx`, `HomePage.tsx`, their tests, locales

**Interfaces:**
- Consumes: Task 3 `resolveMatch`, `nextMatchToStart` and `matchRowFields`.
- Produces:
  - `NextUp({ queue: string[]; teams: Team[] })`. It renders nothing for an empty queue. Otherwise it renders `match.nextUp` ("Next up: {{team}}") and, for more teams, `match.nextUpThen` ("then {{teams}}").
  - `MatchResultDialog` prop `next: { team1; team2; queue: Team[] }` replaces `waiting`.

- [ ] **Step 1: Write the failing tests**
  - `NextUp`: an empty queue renders nothing; `['o']` gives "Next up: Orange Team"; `['o','p']` gives "Next up: Orange Team, then Purple Team".
  - `MatchTrackerPage.test.tsx`: a 4-team session ends match 1 (Green 1–0 Blue, queue [ty, to]). The new match row is Green v Yellow with queue [to, tb], and the result dialog says "Next up: Orange Team".
  - `MatchTrackerPage.test.tsx`: a 2-team session ending match 2 creates the rematch with `waiting_team_id` null, and the tracker shows no "Next up".
  - `MatchTrackerPage.test.tsx`: the existing 3-team test still expects `waiting_team_id: 'tb'` (Review Focus 5).
  - `LiveSessionPage.test.tsx`: 4 teams show "Next up: Orange Team, then Blue Team".
  - `SessionDetailPage.resume.test.tsx`: a 4-team session with all matches deleted lets you pick two teams and start match 1 with the other two queued.
- [ ] **Step 2:** Run `npx vitest run src/components/NextUp.test.tsx src/pages/admin/MatchTrackerPage.test.tsx src/pages/public/LiveSessionPage.test.tsx src/pages/admin/SessionDetailPage.resume.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Replace every "Waiting:" display with `<NextUp>`. Every match insert goes through `matchRowFields(...)`. `SessionDetailPage` recovery uses `FirstMatchPicker` (Task 5 props) when match 1 is needed.
- [ ] **Step 4:** Run the same command, then the full `npx vitest run` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: matches follow the queue and screens show who is next`.

### Task 7: Standings, records and share images with more teams

**Files:**
- Modify: `src/components/SessionStandings.test.tsx`, `src/utils/records.test.ts`, `src/utils/sessionSummary.test.ts`, plus the matching source only if a test fails

- [ ] **Step 1: Write the tests**
  - Standings for a 4-team session list 4 rows, sorted as today.
  - Records' biggest win between Orange and Purple carries `winnerColor: 'orange'`.
  - The session summary text for 4 teams names all four.
- [ ] **Step 2:** Run `npx vitest run src/components/SessionStandings.test.tsx src/utils/records.test.ts src/utils/sessionSummary.test.ts`.
- [ ] **Step 3:** Fix any source that assumed three teams.
- [ ] **Step 4:** Rerun the same command. Expected: PASS.
- [ ] **Step 5:** Commit: `test: standings, records and summaries with more than three teams`.

### Task 8: New-session popup, attendance page, navigation

**Files:**
- Create:
  - `src/components/NewSessionDialog.tsx`, `src/components/NewSessionDialog.test.tsx`
  - `src/pages/admin/AttendancePage.tsx`, `src/pages/admin/AttendancePage.test.tsx`
- Modify: `src/pages/admin/HomePage.tsx` and its test, `src/layouts/AdminLayout.tsx` and its test, `src/router.tsx`, `src/utils/homeStatus.ts`, locales
- Delete: `src/pages/admin/NewSessionPage.tsx` and its test. Move `AttendancePicker` into `AttendancePage.tsx` with a `limit: number` prop.

**Interfaces:**
- Produces:
  - `NewSessionDialog({ onClose(): void })`.
    - It inserts `{ league_id, date, status: 'draft', share_token, team_count, team_size }` and navigates to `adminPath('/sessions/<id>/players')`.
    - The default numbers come from the newest session of the league (`order('created_at', { ascending: false }).limit(1)`), otherwise 3 and 5.
  - Route `sessions/:sessionId/players` loads `AttendancePage`. The route `sessions/new` renders `<Navigate to="../home?new=1" replace />`, and Home opens the dialog when `new=1`.
  - `liveState` setup case: `{ kind: 'setup'; session; hasPlayers: boolean }`. Continue goes to `/players` when `!hasPlayers`, otherwise to `/teams`.
  - Strings (en/ar):
    - `session.newTitle` "New session"
    - `session.teams` "Number of teams"
    - `session.perTeam` "Players per team"
    - `session.upTo` "Up to {{count}} players"
    - `session.create` "Create"
    - `session.setup` "{{teams}} teams × {{size}} players"
  - Remove the now-unused `nav.newSession`.

- [ ] **Step 1: Write the failing tests**
  - `NewSessionDialog`:
    - defaults to today, and to 4 × 6 when the newest session was 4 × 6;
    - the steppers stop at 2/6 and 3/11;
    - "Up to 24 players";
    - Create inserts the row and navigates to `/admin/eagles/sessions/<id>/players`;
    - Cancel inserts nothing;
    - with `db.errors.sessions` set, it shows the translated error and stays open (Review Focus 4);
    - Escape closes, and the dialog is named by its title.
  - `AttendancePage`: a 2 × 3 session allows at most 6 picks, Confirm is disabled under 2 picks, and Confirm inserts `session_players` and navigates to `/teams`.
  - `AdminLayout.test.tsx`: no "New session" link.
  - `HomePage.test.tsx`:
    - "Start new session" is a button that opens the dialog;
    - `/home?new=1` opens it on load;
    - a draft without players continues to `/players`.
  - `src/routes/routes.test.tsx`: `/admin/eagles/sessions/new` lands on Home with the dialog open.
- [ ] **Step 2:** Run `npx vitest run src/components/NewSessionDialog.test.tsx src/pages/admin/AttendancePage.test.tsx src/layouts/AdminLayout.test.tsx src/pages/admin/HomePage.test.tsx src/routes/routes.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement:
  - The dialog follows `DeleteLeagueDialog`'s accessibility pattern (labelled form, autoFocus, Escape, Tab trap, focus return), and reports errors with `serverErrorKey`.
  - Lazy-load `AttendancePage` with `lazyPage` like the other pages.
- [ ] **Step 4:** Run the same command, then `npx vitest run`, `npm run typecheck` and `npm run build`. Expected: all pass, with no build warnings.
- [ ] **Step 5:** Commit: `feat: start a session from a Home popup with team count and size`.

### Task 9: Whole-branch check and PR

- [ ] **Step 1:** Run `npx vitest run`, `npm run typecheck` and `npm run build`. Expected: all pass.
- [ ] **Step 2:** Read-only production check. `supabase db query --linked "select id, team_count, team_size, status from sessions order by created_at desc limit 3"` shows the 06 Oct session as 3 × 5 and still active.
- [ ] **Step 3:** Push the branch and open a PR whose body summarises the spec, the migration (already applied), the tests and the Review Focus items. End it with the Claude Code line. Do not merge without the user's go-ahead.
