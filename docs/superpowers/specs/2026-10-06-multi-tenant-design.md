# Score-Leader Multi-Tenant — Design Spec

**Date:** 2026-10-06
**Author:** codorasoft
**Status:** Draft for review

---

## 1. Overview

Score-Leader today serves one group: every signed-in user can change every row, and the public pages add up every row in the database. This change turns it into a multi-tenant app where many **leagues** live in one database, each managed by one **admin**, and a **superadmin** controls who the admins are, which features each admin may use, and how many leagues each admin may create.

**Success criteria:**
- No existing data is lost; everything in the database today becomes one league owned by the current account
- One admin can never change another admin's league, even by calling the API directly
- The superadmin can create admin accounts, choose their features and league limit, disable them, and delete leagues
- An admin can create leagues (name + logo) up to their limit and switch between them
- A feature the superadmin turns off disappears for that admin and for the public pages of all that admin's leagues
- Offline match recording (the outbox) keeps working through and after the migration

---

## 2. Roles

| Role | Who | Can do |
|---|---|---|
| **Superadmin** | One new account (created during rollout) | Create admin accounts; set each admin's features and league limit; disable/enable admins; reset admin passwords; see all admins and leagues; delete a league. Does not own leagues and does not edit league data. |
| **Admin** | Accounts created by the superadmin, plus the current existing account | Create leagues up to their limit; rename a league and change its logo; manage players, sessions, matches and the enabled features — only in leagues they own. Cannot change their own features or limit. |
| **Disabled admin** | An admin the superadmin switched off | Cannot sign in to the admin area and cannot write. Their leagues' public pages show "League not available". |
| **Public** | Anyone with a link, no login | Read league pages for the features that league's owner has; vote when voting is enabled. |

Rules fixed by the user:
- Only the superadmin creates admin accounts. Admins create their own leagues.
- **One admin per league**: only the admin who created a league manages it.
- **Permissions belong to the admin**, not to each league: they apply to all of that admin's leagues.
- Turning a feature off **hides** it; it never deletes data. Turning it back on shows everything again.
- Lowering an admin's limit below their current league count keeps their leagues but blocks creating new ones.
- Deleting a league is superadmin-only. There is no "delete admin" — only disable.
- The current existing account stays an **admin** (not superadmin), owns the league holding all existing data, with all features on and a limit of 1.

---

## 3. Features and permissions

**Always on (no switch):** players list (name, position, skill rating); sessions — create, team builder with manual picking and simple random split, match tracking (goals, assists, score, clock), results, history; the public live session page `/s/:token`; the league home page.

**Switchable features** — stored as keys in `admin_profiles.features`:

| Key | Feature | Admin side | Public side | Needs |
|---|---|---|---|---|
| `cards` | Cards & suspensions | Yellow/red card button, suspension countdown | Cards on live timeline | — |
| `swaps` | In-session player swaps | Swap button and undo in match tracker | Swaps on live timeline | — |
| `smart_balancing` | Smart team balancing | Balance by skill + recent form, split winning duos | — | — |
| `awards` | Session awards | Awards step when finishing a session | Awards on summary and profiles | — |
| `voting` | Award voting | "Open vote" option, vote links | Vote page `/s/vote/:token` | `awards` |
| `leaderboard` | Leaderboard | — | Leaderboard page (all-time/season/month) | — |
| `potm` | Player of the Month | — | POTM on leaderboard | `leaderboard` |
| `profiles` | Player profiles | — | Player page: stats, form chart, partnerships | — |
| `badges` | Badges | — | Badges on profiles | `profiles` |
| `records` | Records | — | Records page | — |
| `player_cards` | Player cards | — | Cards page, card on profile, share card image | — |
| `photos` | Player photos | Upload/crop player photos | Photos shown (initials when off) | — |
| `summary_share` | Session summary sharing | Share summary image / Messenger on session page | — | — |
| `coach_board` | Coach Board | Boards, arrows/zones, guest players | — | — |

**Dependencies:** a feature listed under "Needs" is only usable when the needed feature is also on. The superadmin form ticks the needed feature automatically and unticks dependents automatically; the database rejects a feature list that breaks a dependency.

**Enforcement (option C — hybrid):**
- **Database-enforced:** league separation for all writes; superadmin-only management of admins, features and limits; the league limit; Coach Board tables (`coach_board`); creating votes and casting public votes (`voting`); photo uploads (`photos`); logo uploads (league owner only).
- **App-only (hidden in the UI):** `cards`, `swaps`, `smart_balancing`, `awards`, `leaderboard`, `potm`, `profiles`, `badges`, `records`, `player_cards`, `summary_share`. These live inside match/session data written by the offline outbox, so they are not checked by the database. Worst case: a technical admin calling the API directly adds such data to **their own** league.

---

## 4. Data model

### New: `admin_profiles`
| Column | Type | Notes |
|---|---|---|
| user_id | uuid PK | → `auth.users(id)` ON DELETE CASCADE |
| role | text | `'superadmin'` or `'admin'` |
| display_name | text | 1–80 chars |
| max_leagues | int | ≥ 0; superadmin row uses 0 |
| features | text[] | Subset of the 14 keys; CHECK enforces known keys and the three dependencies |
| is_disabled | bool | default false |
| created_at | timestamptz | |

Accounts with no `admin_profiles` row have no access to anything beyond public reads.

### New: `leagues`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| owner_id | uuid | → `admin_profiles(user_id)`; cannot change after insert |
| name | text | 1–80 chars, any language |
| slug | text UNIQUE | `^[a-z0-9]+(-[a-z0-9]+)*$`, 3–40 chars; cannot change after insert |
| logo_url | text | nullable |
| created_at | timestamptz | |

A BEFORE INSERT trigger on `leagues` rejects the insert when the owner is not an enabled `admin` or already owns `max_leagues` leagues (locks the owner's profile row to avoid races). A BEFORE UPDATE trigger rejects changes to `slug` and `owner_id`.

### New: `league_directory` (view, public)
Exposes what public pages need without exposing `admin_profiles`: `id, slug, name, logo_url, features` (the owner's), `is_available` (owner enabled). Readable by `anon` and `authenticated`.

### Changed: every existing table gets `league_id`
`league_id uuid NOT NULL REFERENCES leagues(id) ON DELETE CASCADE`, with an index, on all 13 tables.

- **Root tables — the app sets it:** `players`, `sessions`, `lineups`.
- **Child tables — a BEFORE INSERT trigger copies it from the parent** (the app does not send it, so offline outbox inserts queued in the old format still work):

| Table | Copied from |
|---|---|
| `session_players`, `teams`, `matches`, `award_votes`, `session_awards` | `sessions` via `session_id` |
| `team_players` | `teams` via `team_id` |
| `match_events` | `matches` via `match_id` |
| `award_vote_nominations`, `award_vote_entries` | `award_votes` via `award_vote_id` |
| `lineup_players` | `lineups` via `lineup_id` |

- The same triggers reject a row whose referenced player (`player_id`, `winner_player_id`) belongs to a different league.
- Deleting a league cascades to all its rows.

### Storage
One bucket per file type; every file lives under a folder named after its league's id (a folder is just a path prefix — nothing is created in advance).

- `player-photos` (existing bucket): `<league_id>/players/<player_id>-<ts>.jpg`. Existing photos at `players/...` are moved into the legacy league's folder during rollout (Section 11), so no file is left outside a league folder.
- `league-logos` (new public bucket, 2 MB, jpeg/png/webp): `<league_id>/logo-<ts>.jpg`.

---

## 5. Database rules (RLS)

Helper functions (SECURITY DEFINER, stable):
- `is_superadmin()` — caller has an enabled `superadmin` profile.
- `owns_league(league_id)` — league's owner is the caller and the caller is an enabled `admin`.
- `league_has_feature(league_id, key)` — the league's owner has `key` in `features`.
- `league_is_available(league_id)` — the league's owner is enabled.

| Table | Read | Write |
|---|---|---|
| `admin_profiles` | Own row; superadmin all | Superadmin only (insert done by Edge Function) |
| `leagues` | Owner; superadmin | Insert/update: owner (limit + immutability by trigger). Delete: superadmin only, done through the `delete-league` Edge Function |
| League data tables (all except lineups) | `anon`/`authenticated`: `league_is_available(league_id)`; owner and superadmin always | Owner only (`owns_league`) |
| `lineups`, `lineup_players` | Owner only | Owner only, and `league_has_feature(league_id,'coach_board')` |
| `award_votes` | As league data | Owner, and `league_has_feature(league_id,'voting')` for insert |
| `award_vote_entries` | As league data | Owner; `anon` insert keeps today's rule (open vote, nominated player) **plus** `league_has_feature(league_id,'voting')` and `league_is_available(league_id)` |

The old policies (`"public read"`, `"admin write"`, `"admin all"`, `"public vote"`) are dropped and replaced.

**Storage rules:**
- `player-photos` insert/update/delete: first folder is a league the caller owns and that league has `photos`. No exception for files outside league folders — after the move there are none.
- `league-logos` insert/update/delete: first folder is a league the caller owns. Reads stay public.

**Realtime:** the live page's subscriptions to `matches` and `match_events` go through the same read rules.

---

## 6. Edge Functions

Three Supabase Edge Functions hold the service-role key server-side. Each verifies the caller's JWT, checks `is_superadmin()`, validates input, then acts:

- `create-admin` — input: `email, password (≥ 8), display_name, max_leagues, features`. Creates the auth user with email confirmed, then inserts the `admin_profiles` row; deletes the auth user again if the profile insert fails.
- `reset-admin-password` — input: `user_id, password`. Refuses to reset the superadmin's own password through this path.
- `delete-league` — input: `league_id, confirm_name` (must equal the league's name). Deletes every file under `<league_id>/` in `player-photos` and `league-logos` (listing page by page until empty), then deletes the `leagues` row, which cascades to all its database rows. If a file deletion fails, the row is not deleted and the call can be retried.

Disable/enable, features and limit are plain updates to `admin_profiles` from the superadmin dashboard (allowed by RLS).

---

## 7. Routes

| Path | Who | Page |
|---|---|---|
| `/login`, `/` | Everyone | Login (as today) |
| `/super` | Superadmin | Admins list |
| `/super/admins/new` | Superadmin | New admin |
| `/super/admins/:userId` | Superadmin | Admin details |
| `/super/leagues` | Superadmin | All leagues |
| `/admin` | Admin | Redirect to last-used league (localStorage), else first league, else create-first-league |
| `/admin/leagues/new` | Admin | New league |
| `/admin/:slug/...` | Admin (owner) | Today's admin pages, scoped to the league, plus `settings` |
| `/l/:slug` | Public | League home |
| `/l/:slug/leaderboard`, `/records`, `/cards`, `/players/:playerId` | Public | Today's public pages, scoped to the league |
| `/s/:token`, `/s/vote/:voteToken` | Public | Unchanged URLs; header shows the session's league |
| `/leaderboard`, `/records`, `/cards`, `/players/:playerId` | Public | Redirect to the same page in the legacy league (its slug is a constant in the app) |
| `/admin/players`, `/admin/history`, `/admin/sessions/...`, `/admin/lineups/...` | Admin | Redirect to the same page in the last-used league |

After login: superadmin → `/super`; admin → `/admin`; disabled admin or no profile → message, then signed out.

---

## 8. Superadmin dashboard

Mobile-first, Arabic/English, same look as the admin area.

- **Admins list** (`/super`): each admin's name, email, `leagues used / max`, feature count, Active/Disabled. "+ New" button. Tabs: Admins / Leagues.
- **New admin**: name, email, password, max leagues, feature checklist with Select all / none and automatic dependency ticking. On success the account can sign in immediately; the superadmin hands over the credentials.
- **Admin details**: edit features and max leagues (Save); Disable/Enable; Reset password; list of their leagues (logo, name, public link, session count) with **Delete league** requiring the league name to be typed to confirm (calls `delete-league`, which removes the league's files and data).
- **All leagues** (`/super/leagues`): logo, name, owner, created date, session count, public link.

---

## 9. Admin area

- **No leagues yet:** single "Create your first league" screen.
- **New league:** name; address (slug) suggested from Latin names, typed for Arabic names, validated live (format + uniqueness), shown as the full public URL, cannot be changed later; optional logo cropped to a circle with the existing photo cropper and resized before upload. Disabled with "League limit reached (n/n)" at the limit.
- **Header league switcher:** current league logo (first letter when none) and name; menu lists the admin's leagues, "+ New league (used/max)", and "League settings". Switching keeps the current section (players → players).
- **League settings** (`/admin/:slug/settings`): rename, change/remove logo, copy public link, share public link to Messenger.
- **Hidden features:** menu items and buttons for disabled features are not rendered — no "locked" messages:

| Off | Admin effect |
|---|---|
| `coach_board` | Coach Board tab gone; its routes redirect to history |
| `cards` | No card button; no suspension countdown |
| `swaps` | No swap button or undo |
| `smart_balancing` | Team builder shows manual picking and simple random split only |
| `awards` | "Finish session" ends the session directly |
| `voting` | Awards offer "Admin picks" only; no vote section on session page |
| `photos` | No photo upload; players show initials |
| `summary_share` | No share button on the session page |

- Every query on a root table filters by the current league; every insert into a root table sends `league_id`. Child-table queries keep filtering by their parent id. `loadLeague()` takes the league id and filters every table by `league_id`.
- Match tracking, the outbox and the clock are unchanged.
- A disabled admin who is already signed in is signed out on next load.

---

## 10. Public pages

- **League home** (`/l/:slug`): logo, name, a live session if one is running, recent completed sessions linking to `/s/:token`, and links to the enabled pages. Works with every optional feature off.
- **Header:** league logo and name; menu shows only enabled pages (`leaderboard`, `records`, `player_cards`).
- **When off:**

| Off | Public effect |
|---|---|
| `leaderboard` / `records` / `player_cards` | Menu item gone; URL shows "Page not found" |
| `profiles` | Player names not clickable; profile URL shows "Page not found" |
| `badges`, `potm`, `photos` | That part is not rendered |
| `voting` | Vote page shows "Voting is closed"; database refuses votes |
| `cards`, `swaps` | Not shown on the live timeline |

- **Unknown slug or disabled owner:** "League not available".
- Shared images (player cards, session summary) are unchanged.

---

## 11. Migration and rollout

Each migration is a separate SQL file in `supabase/migrations/`, run in a transaction, and only adds.

**Migration 1: tenancy (additive + backfill)**
1. Create `admin_profiles`, `leagues`, the helper functions, triggers and `league_directory`.
2. Require exactly one existing auth user (stop with an error otherwise); insert its profile as `admin`, all 14 features, `max_leagues = 1`.
3. Insert the legacy league (name and slug from Section 12) owned by that user.
4. Add `league_id` (nullable) to all 13 tables, backfill every row with the legacy league, then set `NOT NULL`, the foreign key and an index.
5. Set the column default on the three root tables to the legacy league id, so the currently deployed app keeps working until the new app is live.
6. Replace the RLS and storage policies; create the `league-logos` bucket.

**Migration 2: remove the temporary defaults** on `players`, `sessions` and `lineups` — run after the new app is live.

**Photo move script** (one-off Node script in `scripts/`, uses the service-role key from the environment, never committed). For each player whose `photo_url` points at a `player-photos` object outside a league folder:
1. **Copy** the object to `<player's league_id>/players/<same file name>` (server-side copy, no re-upload; an existing target is treated as already copied).
2. **Update** the player's `photo_url` to the new public URL.
3. **Delete** the old object — only after steps 1 and 2 succeeded.

It is safe to stop and run again at any point: until step 2, the player still uses the old file. At the end it prints a report and checks that every player's `photo_url` returns HTTP 200 and that no object remains outside a league folder. Old-path objects no player points at are listed in the report and left untouched for the user to decide.

**Rollout order** — Claude runs every step, including the backup, migrations, Edge Function deploys and the photo move:
1. Full backup of the live database: `supabase db dump` (schema) and `supabase db dump --data-only` (data), plus a download of every `player-photos` object, saved outside the repo.
2. Rehearse on a local Supabase loaded with the backup: run Migration 1; compare the row count of every table before and after; check that no `league_id` is NULL.
3. Apply Migration 1 to the live database via the linked CLI.
4. Run the photo move script against the live project and check its report.
5. Deploy the Edge Functions; create the superadmin account (one-off, via the Auth admin API) and insert its `superadmin` profile.
6. Deploy the new app to Vercel.
7. Apply Migration 2.

**Rollback:** before step 6 the old app still works against the migrated database (it shows photos from whatever `photo_url` says, old or new). If Migration 1 itself fails, its transaction rolls back with no change. The database and photo backups from step 1 are the last resort.

---

## 12. Inputs needed before implementation

- Superadmin email (the user chooses its password).
- Legacy league name, slug, and optional logo file.

---

## 13. Testing

1. **Database rules** (SQL run against local Supabase, switching JWT claims per role):
   - Admin A cannot insert/update/delete rows of admin B's league; can in their own.
   - League insert over `max_leagues` fails; slug and owner updates fail.
   - An admin cannot update their own `admin_profiles` row; the superadmin can.
   - A disabled admin cannot write; their league is unreadable to `anon`.
   - Feature-list CHECK rejects broken dependencies and unknown keys.
   - Lineup writes fail without `coach_board`; vote creation and `anon` votes fail without `voting`.
   - Child-table inserts without `league_id` get the parent's league; a cross-league `player_id` is rejected.
2. **Migration rehearsal:** per-table row counts identical before/after; zero NULL `league_id`.
3. **App tests** (vitest, alongside existing tests): feature dependency helper; slug validation and suggestion; `useFeature` gating of admin menu, match tracker buttons and public menu; league switcher limit state; redirects from old URLs; `loadLeague` filters by league.
4. **Edge Functions:** non-superadmin caller is refused by all three; create-admin cleans up the auth user when the profile insert fails; delete-league refuses a wrong `confirm_name` and, on a test league, leaves no rows and no files under its folder.
5. **Photo move script** (on the local rehearsal copy first): every moved photo URL returns 200; running it a second time changes nothing; a run interrupted after the copy step completes correctly on re-run.
6. **Browser check** with three accounts — superadmin, an admin with all features, an admin with few features — through every screen in Sections 8–10.

---

## 14. Out of scope

- More than one admin per league (helpers).
- Superadmin editing a league's players, sessions or matches.
- Deleting admin accounts.
- Subdomains or custom domains per league (the slug is enough to add them later).
- League branding on shared images.
- Self-service sign-up.
