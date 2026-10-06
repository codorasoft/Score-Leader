# Multi-Tenant Score-Leader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Score-Leader into a multi-tenant app — leagues owned by admins, a superadmin who manages admins, their features and league limits — without losing any existing data.

**Architecture:** One Supabase database; every row carries `league_id`; Row Level Security separates leagues and enforces the superadmin/admin roles, the league limit and the database-enforced features. The React app gets a league context (`/admin/:slug/...`, `/l/:slug/...`) that scopes every query and hides disabled features. Three Edge Functions hold the service-role key for account creation, password resets and league deletion.

**Tech Stack:** React 19 + react-router-dom 7, Vite 8, TypeScript, Tailwind 4, i18next (en/ar), Vitest + Testing Library, Supabase (Postgres, RLS, Storage, Edge Functions on Deno), Supabase CLI 2.119 (linked to project `tunwvypccjsbzlclmxrk`), Node 24 (runs `.ts` scripts directly).

**Spec:** `docs/superpowers/specs/2026-10-06-multi-tenant-design.md`

## Global Constraints

- Work on branch `feature/multi-tenant`. Pushing to `main` deploys to Vercel — only Task 16 merges.
- Never change or delete live data outside Task 16. Rehearsals run inside `BEGIN … ROLLBACK`.
- Migrations only add; no table is dropped or recreated. Supabase wraps each migration file in a transaction — do not write `BEGIN`/`COMMIT` in migration files.
- Feature keys, exactly: `cards, swaps, smart_balancing, awards, voting, leaderboard, potm, profiles, badges, records, player_cards, photos, summary_share, coach_board`. Dependencies: `voting → awards`, `potm → leaderboard`, `badges → profiles`.
- Slug: `^[a-z0-9]+(-[a-z0-9]+)*$`, 3–40 chars, not in `leagues, players, history, sessions, lineups, settings, new, super`; immutable.
- League and display names: 1–80 chars after trim.
- Existing account `info@codorasoft.com` → `admin`, all 14 features, `max_leagues = 1`, owns league **Eagles** (`eagles`, no logo). Superadmin is `admin@codorasoft.com`.
- Storage paths: `player-photos/<league_id>/players/<player_id>-<ts>.jpg`, `league-logos/<league_id>/logo-<ts>.jpg`. `league-logos`: public, 2 MB, jpeg/png/webp.
- Every user-visible string goes through i18next with keys in both `src/locales/en.json` and `src/locales/ar.json`.
- The service-role key is read from the `SUPABASE_SERVICE_ROLE_KEY` environment variable and never written to a file in the repo or printed. Fetch it with `supabase projects api-keys --project-ref tunwvypccjsbzlclmxrk -o json` into a shell variable.
- The offline outbox (`src/lib/outbox.ts`, `src/lib/pitchOutbox.ts`) is not modified. Child-table inserts never send `league_id`.
- `localStorage` access is wrapped in try/catch (existing pattern).
- Follow existing code style: small components, Tailwind classes as in neighbouring files, comments only where the code does not explain itself.

## Review Focus

1. **Old app during the gap between Migration 1 and the new deploy** — players keep recording matches and seeing public pages; only photo upload from the old app fails (new storage rules). Task 3 tests that an admin-role session with *no* `league_id` in a `players`/`sessions`/`lineups` insert lands in Eagles; Task 16 deploys the app right after the photo move.
2. **Offline outbox ops queued before the update** (inserts into `match_events`/`matches` with no `league_id`) — must still sync. Task 2 tests child inserts without `league_id` inherit the parent's league.
3. **Anonymous voter on a league whose owner is disabled or has `voting` off** — the vote must be refused by the database, not just hidden. Task 3 tests both.
4. **Admin opens an old bookmark (`/admin/history`, `/admin/sessions/<id>`, `/leaderboard`, `/players/<id>`)** — lands on the same page in the right league, never a blank screen. Task 9 tests each redirect.
5. **Admin switches league while inside a session page** — must land on that league's history, not a session id from another league. Task 8 tests `switchLeaguePath` on session paths.

---

## File Structure

**Database & server**
- `supabase/migrations/20261006000001_tenancy_schema.sql` — tables, functions, triggers, view, backfill, temporary defaults (Task 2)
- `supabase/migrations/20261006000002_tenancy_policies.sql` — RLS + storage policies, `league-logos` bucket (Task 3)
- `supabase/migrations/20261006000003_drop_temporary_league_defaults.sql` — Migration 2 (Task 16)
- `supabase/tests/tenancy.test.sql` — database rules tests (Tasks 2–3)
- `scripts/rehearse.sh` — runs migrations + tests in one rolled-back transaction (Task 2)
- `scripts/backup.ts` — JSON + photo backup (Task 4)
- `scripts/photoMoves.ts` + `scripts/photoMoves.test.ts` — pure planning for the photo move (Task 6)
- `scripts/move-photos.ts` — runs the move (Task 6)
- `scripts/create-superadmin.ts` — one-off (Task 16)
- `supabase/functions/_shared/features.ts` (+ `.test.ts`) — feature keys, dependencies (Task 1)
- `supabase/functions/_shared/slug.ts` (+ `.test.ts`) — slug rules (Task 1)
- `supabase/functions/_shared/validate.ts` (+ `.test.ts`) — Edge Function input validation (Task 5)
- `supabase/functions/_shared/superadmin.ts` — caller check + service client (Task 5)
- `supabase/functions/create-admin/index.ts`, `reset-admin-password/index.ts`, `delete-league/index.ts` (Task 5)

**App foundation**
- `src/lib/features.ts` — re-exports `_shared/features.ts` (Task 1)
- `src/lib/slug.ts` — re-exports `_shared/slug.ts` (Task 1)
- `src/lib/tenancy.ts` — types + Supabase calls for profiles and leagues (Task 7)
- `src/lib/adminApi.ts` — Edge Function calls (Task 7)
- `src/lib/leaguePaths.ts` (+ test) — path helpers, legacy constant, last-used league (Task 8)
- `src/components/LeagueLogo.tsx` — logo with default shield (Task 7)
- `src/contexts/LeagueContext.tsx` (+ test) — `LeagueProvider`, `useLeague`, `useFeature`, `Feature` (Task 8)
- `src/hooks/useProfile.ts` — current account's `admin_profiles` row (Task 8)
- `src/components/RequireRole.tsx` — replaces `AuthGuard` (Task 9)
- `src/routes/AdminHome.tsx`, `AdminLeagueRoute.tsx`, `PublicLeagueRoute.tsx`, `SessionLeagueRoute.tsx`, `LegacyRedirects.tsx` (+ test) (Task 9)

**Admin, public, superadmin pages** — listed per task (Tasks 10–15).

---

### Task 1: Shared feature and slug rules

**Files:**
- Create: `supabase/functions/_shared/features.ts`, `supabase/functions/_shared/features.test.ts`
- Create: `supabase/functions/_shared/slug.ts`, `supabase/functions/_shared/slug.test.ts`
- Create: `src/lib/features.ts`, `src/lib/slug.ts` (one-line re-exports: `export * from '../../supabase/functions/_shared/features.ts'`)

**Interfaces:**
- Produces:
  - `FEATURES: readonly FeatureKey[]` (the 14 keys in the spec's table order)
  - `type FeatureKey`
  - `FEATURE_NEEDS: Partial<Record<FeatureKey, FeatureKey>>` = `{ voting: 'awards', potm: 'leaderboard', badges: 'profiles' }`
  - `setFeature(list: FeatureKey[], key: FeatureKey, on: boolean): FeatureKey[]` — turning on adds the needed feature; turning off removes dependents; result in `FEATURES` order, no duplicates
  - `isValidFeatureList(list: unknown): list is FeatureKey[]` — array of known keys, no duplicates, dependencies satisfied
  - `RESERVED_SLUGS: readonly string[]` = `['leagues','players','history','sessions','lineups','settings','new','super']`
  - `slugError(slug: string): 'format' | 'length' | 'reserved' | null`
  - `suggestSlug(name: string): string` — lowercase Latin letters/digits, other runs → `-`, trimmed of `-`, cut to 40; returns `''` when nothing Latin remains (Arabic names)

- [ ] **Step 1: Create branch** — `git checkout -b feature/multi-tenant`
- [ ] **Step 2: Write failing tests**

```ts
// features.test.ts
it('turning voting on also turns awards on', () => expect(setFeature([], 'voting', true)).toEqual(['awards', 'voting']))
it('turning awards off also turns voting off', () => expect(setFeature(['awards', 'voting', 'records'], 'awards', false)).toEqual(['records']))
it('turning badges on adds profiles; potm on adds leaderboard', () => {
  expect(setFeature([], 'badges', true)).toEqual(['profiles', 'badges'])
  expect(setFeature([], 'potm', true)).toEqual(['leaderboard', 'potm'])
})
it('accepts all 14 keys', () => expect(isValidFeatureList([...FEATURES])).toBe(true))
it('rejects unknown keys, duplicates and broken dependencies', () => {
  expect(isValidFeatureList(['cards', 'nope'])).toBe(false)
  expect(isValidFeatureList(['cards', 'cards'])).toBe(false)
  expect(isValidFeatureList(['voting'])).toBe(false)
  expect(isValidFeatureList('cards')).toBe(false)
})
// slug.test.ts
it.each([['eagles', null], ['tigers-fc-2', null], ['ab', 'length'], ['a'.repeat(41), 'length'],
  ['Eagles', 'format'], ['-eagles', 'format'], ['eagles--fc', 'format'], ['النسور', 'format'], ['players', 'reserved'], ['super', 'reserved']])(
  'slugError(%s) = %s', (s, e) => expect(slugError(s)).toBe(e))
it('suggests from Latin names', () => expect(suggestSlug('  Tigers F.C. 2026 ')).toBe('tigers-f-c-2026'))
it('suggests nothing for Arabic names', () => expect(suggestSlug('دوري النمور')).toBe(''))
```

- [ ] **Step 3: Run** `npx vitest run supabase/functions/_shared` — Expected: FAIL (modules missing)
- [ ] **Step 4: Implement** `features.ts` and `slug.ts` with the signatures above. Use only standard TS (no Deno or Node APIs) so Deno and Vite can both import them. Add the two re-export files in `src/lib/`.
- [ ] **Step 5: Run** `npx vitest run supabase/functions/_shared` — Expected: PASS. Run `npx tsc -b` — Expected: no errors.
- [ ] **Step 6: Commit** — `git add supabase/functions/_shared src/lib/features.ts src/lib/slug.ts && git commit -m "feat: shared feature and slug rules"`

---

### Task 2: Migration 1a — tenancy schema, backfill, rehearsal harness

**Files:**
- Create: `supabase/migrations/20261006000001_tenancy_schema.sql`
- Create: `supabase/tests/tenancy.test.sql`
- Create: `scripts/rehearse.sh`
- Modify: `.gitignore` (add `.rehearsal.sql`)

**Interfaces:**
- Consumes: feature keys and slug rules from Task 1 (copied as SQL literals).
- Produces (SQL, all in `public`, functions `SECURITY DEFINER`, `SET search_path = ''`, `STABLE` where read-only):
  - `admin_profiles(user_id uuid PK → auth.users ON DELETE CASCADE, role text CHECK in ('superadmin','admin'), email text NOT NULL, display_name text CHECK 1–80 trimmed, max_leagues int NOT NULL DEFAULT 1 CHECK >= 0, features text[] NOT NULL DEFAULT '{}', is_disabled bool NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now())` with CHECK `public.valid_features(features)`
  - `valid_features(text[]) returns boolean IMMUTABLE` — all keys known, no duplicates, the three dependencies
  - `leagues(id uuid PK DEFAULT gen_random_uuid(), owner_id uuid NOT NULL → admin_profiles(user_id), name text CHECK 1–80 trimmed, slug text UNIQUE NOT NULL CHECK format + length + NOT IN reserved, logo_url text, created_at timestamptz NOT NULL DEFAULT now())`
  - Trigger `leagues_before_insert` → `enforce_league_limit()`: `SELECT … FROM admin_profiles WHERE user_id = NEW.owner_id FOR UPDATE`; raise `'league owner must be an enabled admin'` or `'league limit reached'` (count of the owner's leagues `>= max_leagues`)
  - Trigger `leagues_before_update` → `keep_league_identity()`: raise `'slug and owner cannot change'` when either differs
  - `is_superadmin() returns boolean`, `owns_league(uuid) returns boolean`, `league_has_feature(uuid, text) returns boolean`, `league_is_available(uuid) returns boolean` — exactly as spec Section 5
  - `set_league_from_parent()` trigger function, arguments `(parent_table, parent_fk_column, player_column...)`: reads the parent's `league_id` with `EXECUTE format('SELECT league_id FROM public.%I WHERE id = $1', TG_ARGV[0]) USING (to_jsonb(NEW) ->> TG_ARGV[1])::uuid`; sets `NEW.league_id` when NULL; raises `'league mismatch'` when given and different; for each player column that is not NULL, raises `'player belongs to another league'` when `players.league_id` differs
  - View `league_directory (id, slug, name, logo_url, features, is_available)` joining `leagues` and `admin_profiles` (owner); `GRANT SELECT TO anon, authenticated`
  - `league_id` on all 13 tables, NOT NULL, FK `→ leagues(id) ON DELETE CASCADE`, index `<table>_league_id_idx`

Child triggers (`BEFORE INSERT`, named `<table>_set_league`):

| Table | Arguments |
|---|---|
| `session_players` | `'sessions','session_id','player_id'` |
| `teams` | `'sessions','session_id'` |
| `team_players` | `'teams','team_id','player_id'` |
| `matches` | `'sessions','session_id'` |
| `match_events` | `'matches','match_id','player_id'` |
| `award_votes` | `'sessions','session_id','winner_player_id'` |
| `award_vote_nominations` | `'award_votes','award_vote_id','player_id'` |
| `award_vote_entries` | `'award_votes','award_vote_id','player_id'` |
| `session_awards` | `'sessions','session_id','winner_player_id'` |
| `lineup_players` | `'lineups','lineup_id','player_id'` |

Migration order inside the file:
1. Tables, functions, triggers on `leagues`, view (no child triggers yet).
2. `DO` block: look up `auth.users` by email `info@codorasoft.com` (raise `'existing admin info@codorasoft.com not found'` if missing); insert its `admin_profiles` row (`role 'admin'`, its email, `display_name 'Eagles admin'`, all 14 features, `max_leagues 1`); insert league `('Eagles','eagles', NULL)`; add nullable `league_id` to the 13 tables; `UPDATE … SET league_id = <eagles id>` on each; then `SET NOT NULL`, FK, index; `ALTER TABLE players|sessions|lineups ALTER COLUMN league_id SET DEFAULT '<eagles id>'` via `EXECUTE format`.
3. Child triggers (after the backfill, so the backfill is not affected).

- [ ] **Step 1: Write `scripts/rehearse.sh`** — builds `$CLAUDE_JOB_DIR/tmp/rehearsal.sql` (fallback `./.rehearsal.sql`, git-ignored) from: `BEGIN;` + a `CREATE TEMP TABLE _before AS` row count per table + every `supabase/migrations/20261006*.sql` except Migration 2 in name order + `supabase/tests/tenancy.test.sql` + a row-count comparison that raises on any difference + `ROLLBACK;`. Runs `supabase db query --linked -f <file>`. Exits non-zero on error. Prints the last result row.
- [ ] **Step 2: Write the schema tests** in `supabase/tests/tenancy.test.sql`. Pattern: a `pg_temp.expect_error(sql text, needle text)` helper (executes, raises `'expected error containing %'` unless an error containing `needle` occurs) and `pg_temp.expect_count(sql text, n int)` (executes a DML statement, raises unless `ROW_COUNT = n`). Fixture: insert four `auth.users` rows (`id, email` only) — admin A (`max_leagues 2`, all features), admin B (all features), superadmin S, disabled admin D — with their `admin_profiles`; league `a-league` for A, `b-league` for B. To act as a user: `SET LOCAL role authenticated; SELECT set_config('request.jwt.claims', json_build_object('sub', '<uuid>', 'role', 'authenticated')::text, true);` and `RESET role` afterwards. Tests in this task:
  - Every one of the 13 tables has zero rows with `league_id IS NULL`; every pre-existing row is in Eagles.
  - `info@codorasoft.com` profile: role `admin`, 14 features, `max_leagues 1`.
  - `valid_features` rejects `'{voting}'`, `'{cards,cards}'`, `'{nope}'`.
  - Slug CHECK rejects `'Eagles'`, `'ab'`, `'players'`; unique rejects a second `'eagles'`.
  - A's third league → `'league limit reached'`; a league for D → `'enabled admin'`; a league for S → `'enabled admin'`.
  - Updating a league's slug → `'slug and owner cannot change'`.
  - Insert into `matches` and `match_events` without `league_id` (as postgres, on fixture session/match of `a-league`) → row gets `a-league`'s id.
  - `match_events` insert whose `player_id` is a `b-league` player on an `a-league` match → `'player belongs to another league'`.
  - `league_directory` for `eagles` returns 14 features and `is_available = true`.
  - Last statement: `SELECT 'TENANCY TESTS PASSED' AS result;`
- [ ] **Step 3: Run** `bash scripts/rehearse.sh` — Expected: FAIL (migration file missing / functions missing)
- [ ] **Step 4: Write** `20261006000001_tenancy_schema.sql` as specified above.
- [ ] **Step 5: Run** `bash scripts/rehearse.sh` — Expected: `TENANCY TESTS PASSED`. Then `supabase db query --linked "select to_regclass('public.leagues')"` — Expected: `null` (nothing kept).
- [ ] **Step 6: Commit** — `git add supabase/migrations/20261006000001_tenancy_schema.sql supabase/tests scripts/rehearse.sh .gitignore && git commit -m "feat(db): tenancy schema and backfill, with rehearsal harness"`

---

### Task 3: Migration 1b — security rules and storage

**Files:**
- Create: `supabase/migrations/20261006000002_tenancy_policies.sql`
- Modify: `supabase/tests/tenancy.test.sql` (append)

**Interfaces:**
- Consumes: helper functions from Task 2.
- Produces: the policies below; bucket `league-logos`.

Drop: `"public read"`, `"admin write"` on the 11 original tables; `"admin all"` on `lineups`, `lineup_players`; `"public vote"` on `award_vote_entries`; the three `"player photos admin …"` storage policies.

Create (policy names as given):

| Table(s) | Policy | Rule |
|---|---|---|
| 11 original tables | `"league read"` FOR SELECT TO anon, authenticated | `league_is_available(league_id) OR owns_league(league_id) OR is_superadmin()` |
| 11 original tables except `award_votes` | `"owner write"` FOR ALL TO authenticated | USING and WITH CHECK `owns_league(league_id)` |
| `award_votes` | `"owner write"` FOR ALL TO authenticated | USING `owns_league(league_id)`; WITH CHECK `owns_league(league_id) AND league_has_feature(league_id,'voting')` |
| `award_vote_entries` | `"public vote"` FOR INSERT TO anon | today's open-vote + nominee conditions AND `league_has_feature(league_id,'voting') AND league_is_available(league_id)` — `league_id` is set by the BEFORE trigger, so the check sees it |
| `lineups`, `lineup_players` | `"owner coach board"` FOR ALL TO authenticated | USING and WITH CHECK `owns_league(league_id) AND league_has_feature(league_id,'coach_board')` |
| `admin_profiles` | `"self or superadmin read"` SELECT TO authenticated | `user_id = auth.uid() OR is_superadmin()` |
| `admin_profiles` | `"superadmin update"` UPDATE TO authenticated | USING/WITH CHECK `is_superadmin()` (no INSERT/DELETE policy: done by Edge Functions) |
| `leagues` | `"owner or superadmin read"` SELECT TO authenticated | `owner_id = auth.uid() OR is_superadmin()` |
| `leagues` | `"owner insert"` INSERT TO authenticated | `owner_id = auth.uid()` (limit by trigger) |
| `leagues` | `"owner update"` UPDATE TO authenticated | `owns_league(id)` |
| storage `player-photos` | `"league photos write"` INSERT/UPDATE/DELETE TO authenticated (three policies) | `bucket_id = 'player-photos' AND owns_league(((storage.foldername(name))[1])::uuid) AND league_has_feature(((storage.foldername(name))[1])::uuid, 'photos')` — guard the cast: `(storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'` first |
| storage `league-logos` | `"league logos write"` INSERT/UPDATE/DELETE TO authenticated | same shape without the feature check |

No DELETE policy on `leagues` for anyone: deletion goes through `delete-league` (service role).

- [ ] **Step 1: Append failing tests** to `tenancy.test.sql` (before the final PASSED line), acting as each fixture user:
  - A inserts a player in `b-league` → error; A updates B's player → `expect_count(…, 0)`.
  - A inserts a player with no `league_id` (the temporary default puts it in Eagles, which A does not own) → error; the same insert acting as the `info@codorasoft.com` user → succeeds and the row is in Eagles (Review Focus 1, the old app's behaviour).
  - A updates own `admin_profiles.max_leagues` → `expect_count(…, 0)`; S does the same → `expect_count(…, 1)`.
  - D (disabled) owns league `d-league` (created before disabling, as postgres): D inserts a player there → error; anon `SELECT count(*) FROM players WHERE league_id = <d-league>` → 0.
  - Remove `voting` and `awards` from B (as postgres); anon vote insert on an open `b-league` vote → error (Review Focus 3); anon vote on an open `a-league` vote for a nominee → succeeds.
  - Remove `coach_board` from B; B inserts a lineup → error.
  - anon reads `lineups` → 0 rows.
  - A deletes own league → `expect_count(…, 0)`.
  - Storage: A inserts into `storage.objects (bucket_id, name)` with `('player-photos', '<a-league id>/players/x.jpg')` → succeeds; with `'<b-league id>/players/x.jpg'` → error; `'players/x.jpg'` → error.
- [ ] **Step 2: Run** `bash scripts/rehearse.sh` — Expected: FAIL at the first new test.
- [ ] **Step 3: Write** `20261006000002_tenancy_policies.sql`; bucket insert copies the `player-photos` statement shape from `20261005000002_player_photos_bucket.sql`.
- [ ] **Step 4: Run** `bash scripts/rehearse.sh` — Expected: `TENANCY TESTS PASSED`.
- [ ] **Step 5: Commit** — `git commit -am "feat(db): league security rules and storage policies"` (add the new migration file).

---

### Task 4: Backup script

**Files:**
- Create: `scripts/backup.ts`

**Interfaces:**
- Produces: `node scripts/backup.ts` → folder `E:\Score-Leader-backups\<YYYY-MM-DDTHH-mm>\` containing `<table>.json` for each `public` table (paged 1000 rows), `auth-users.json` (`id, email, created_at` only, via `supabase.auth.admin.listUsers`), `storage/player-photos/<path>` for every object (recursive `list`, then `download`), and `manifest.json` (`{ table: rowCount }`, photo count, total bytes). Reads `VITE_SUPABASE_URL` from `.env` and `SUPABASE_SERVICE_ROLE_KEY` from the environment; exits 1 if either is missing.

- [ ] **Step 1: Implement** `scripts/backup.ts` with `@supabase/supabase-js` (`createClient(url, serviceKey, { auth: { persistSession: false } })`). Table list = the 13 tables plus `admin_profiles`, `leagues` when they exist (skip a table whose select returns error code `42P01`).
- [ ] **Step 2: Run against the live project** (read-only): `SUPABASE_SERVICE_ROLE_KEY=$KEY node scripts/backup.ts` — Expected: manifest printed; compare its counts with `supabase db query --linked "select (select count(*) from players) p, (select count(*) from match_events) e"` — equal.
- [ ] **Step 3: Commit** — `git add scripts/backup.ts && git commit -m "chore: backup script for tables and photos"`

---

### Task 5: Edge Functions

**Files:**
- Create: `supabase/functions/_shared/validate.ts`, `supabase/functions/_shared/validate.test.ts`
- Create: `supabase/functions/_shared/superadmin.ts`
- Create: `supabase/functions/create-admin/index.ts`, `supabase/functions/reset-admin-password/index.ts`, `supabase/functions/delete-league/index.ts`

**Interfaces:**
- Consumes: `isValidFeatureList` (Task 1).
- Produces:
  - `validateCreateAdmin(body: unknown): { ok: true, value: { email: string, password: string, display_name: string, max_leagues: number, features: FeatureKey[] } } | { ok: false, error: string }` — email trimmed + lowercased and matches `^[^\s@]+@[^\s@]+\.[^\s@]+$`; password ≥ 8; display_name 1–80 trimmed; `max_leagues` integer 0–100; features valid
  - `validateResetPassword(body: unknown)` → `{ user_id: string (uuid), password: string (≥ 8) }` or error
  - `validateDeleteLeague(body: unknown)` → `{ league_id: string (uuid), confirm_name: string }` or error
  - `requireSuperadmin(req: Request): Promise<{ admin: SupabaseClient, callerId: string } | Response>` in `superadmin.ts` — builds a client with the caller's `Authorization` header, calls `rpc('is_superadmin')`, returns a 403 `Response` when false; `admin` is a service-role client from `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`
  - HTTP contract for all three: `POST` JSON; CORS for `OPTIONS` (`Access-Control-Allow-Origin: *`, headers `authorization, x-client-info, apikey, content-type`); `200 { ok: true, ... }`, `400 { error }`, `403 { error: 'forbidden' }`, `500 { error }`
  - `create-admin` → `auth.admin.createUser({ email, password, email_confirm: true })`, then insert `admin_profiles` (`role 'admin'`, email, display_name, max_leagues, features); on profile failure `auth.admin.deleteUser(id)` then 500. Returns `{ ok: true, user_id }`.
  - `reset-admin-password` → 400 `'cannot reset superadmin'` when the target profile's role is `superadmin`; otherwise `auth.admin.updateUserById(user_id, { password })`.
  - `delete-league` → load league (404 if missing); 400 `'name does not match'` unless `confirm_name === name`; for `player-photos` and `league-logos`, repeatedly `list('<league_id>', { limit: 1000 })` recursively and `remove(paths)` until empty (500 and stop on any error); then `delete()` the `leagues` row.

- [ ] **Step 1: Write failing tests** in `validate.test.ts`: valid create body passes and lowercases email; each of: bad email, 7-char password, empty name, `max_leagues: 1.5`, `max_leagues: -1`, features `['voting']` → `ok: false`; reset with non-uuid id → false; delete with missing `confirm_name` → false.
- [ ] **Step 2: Run** `npx vitest run supabase/functions/_shared/validate.test.ts` — Expected: FAIL
- [ ] **Step 3: Implement** `validate.ts` (plain TS), then `superadmin.ts` and the three `index.ts` files with `Deno.serve`, importing `npm:@supabase/supabase-js@2` and `../_shared/*.ts`.
- [ ] **Step 4: Run** `npx vitest run supabase/functions/_shared` — Expected: PASS
- [ ] **Step 5: Commit** — `git add supabase/functions && git commit -m "feat: superadmin Edge Functions"` (deployment happens in Task 16)

---

### Task 6: Photo move script

**Files:**
- Create: `scripts/photoMoves.ts`, `scripts/photoMoves.test.ts`, `scripts/move-photos.ts`

**Interfaces:**
- Produces:
  - `planPhotoMoves(players: { id: string, league_id: string, photo_url: string | null }[], publicPrefix: string): PhotoMove[]` where `PhotoMove = { playerId: string, from: string, to: string }`; `publicPrefix` is `<url>/storage/v1/object/public/player-photos/`. A player is included only when `photo_url` starts with `publicPrefix` and its path's first folder is not a UUID. `to = '<league_id>/' + from`. Decodes URI components like `storagePathFromUrl` in `src/lib/playerPhoto.ts`.
  - `strayObjects(allPaths: string[], referenced: Set<string>): string[]` — paths outside any UUID folder that no player references.
  - `node scripts/move-photos.ts [--dry-run]` — for each move: `storage.copy(from, to)` (an "already exists" error counts as copied); `players.update({ photo_url: getPublicUrl(to) }).eq('id', playerId)`; only then `storage.remove([from])`. After the loop: every player `photo_url` fetched with `HEAD` → must be 200; list the bucket root → report stray objects (not deleted). Prints `{ moved, alreadyDone, failed: [...], broken: [...], stray: [...] }` and exits 1 if `failed` or `broken` is non-empty.

- [ ] **Step 1: Write failing tests**:

```ts
const P = 'https://x.supabase.co/storage/v1/object/public/player-photos/'
const L = '11111111-1111-1111-1111-111111111111'
it('moves legacy photos into the league folder', () =>
  expect(planPhotoMoves([{ id: 'p1', league_id: L, photo_url: P + 'players/p1-1.jpg' }], P))
    .toEqual([{ playerId: 'p1', from: 'players/p1-1.jpg', to: `${L}/players/p1-1.jpg` }]))
it('skips photos already in a league folder, external links and empty photos (safe to re-run)', () =>
  expect(planPhotoMoves([
    { id: 'a', league_id: L, photo_url: `${P}${L}/players/a.jpg` },
    { id: 'b', league_id: L, photo_url: 'https://elsewhere.com/b.jpg' },
    { id: 'c', league_id: L, photo_url: null },
  ], P)).toEqual([]))
it('lists unreferenced legacy objects', () =>
  expect(strayObjects(['players/a.jpg', 'players/b.jpg', `${L}/players/c.jpg`], new Set(['players/a.jpg']))).toEqual(['players/b.jpg']))
```

- [ ] **Step 2: Run** `npx vitest run scripts` — Expected: FAIL
- [ ] **Step 3: Implement** `photoMoves.ts`, then `move-photos.ts` (same env handling as `backup.ts`; `--dry-run` prints the plan and the stray list without changing anything).
- [ ] **Step 4: Run** `npx vitest run scripts` — Expected: PASS. Run `SUPABASE_SERVICE_ROLE_KEY=$KEY node scripts/move-photos.ts --dry-run` against the live project — Expected (before Migration 1, `players.league_id` does not exist yet): exits 1 with the message `run after Migration 1`. The script must check for the column and print exactly that.
- [ ] **Step 5: Commit** — `git add scripts && git commit -m "chore: photo move script"`

---

### Task 7: Tenancy data layer and league logo

**Files:**
- Create: `src/lib/tenancy.ts`, `src/lib/tenancy.test.ts`, `src/lib/adminApi.ts`, `src/components/LeagueLogo.tsx`, `src/components/LeagueLogo.test.tsx`
- Create: `src/lib/leagueLogo.ts` (upload/remove, mirrors `playerPhoto.ts`)
- Modify: `src/lib/types.ts` — add `league_id: string` to `Player`, `Session`, `Team`, `Match`, `MatchEvent`, `AwardVote`, `SessionAward`, and any other row types for the 13 tables
- Modify: `src/lib/playerPhoto.ts` — `photoPath(leagueId: string, playerId: string, now = Date.now())` → `` `${leagueId}/players/${playerId}-${now}.jpg` ``; `uploadPlayerPhoto(leagueId: string, playerId: string, photo: Blob)`; update `src/lib/playerPhoto.test.ts`

**Interfaces:**
- Produces (`tenancy.ts`):
  - `type Role = 'superadmin' | 'admin'`
  - `interface AdminProfile { user_id: string; role: Role; email: string; display_name: string; max_leagues: number; features: FeatureKey[]; is_disabled: boolean; created_at: string }`
  - `interface League { id: string; owner_id: string; name: string; slug: string; logo_url: string | null; created_at: string }`
  - `interface LeagueInfo { id: string; slug: string; name: string; logo_url: string | null; features: FeatureKey[]; is_available: boolean }`
  - `fetchMyProfile(userId: string): Promise<AdminProfile | null>`
  - `fetchMyLeagues(): Promise<League[]>` (ordered by `created_at`)
  - `fetchLeagueInfoBySlug(slug: string): Promise<LeagueInfo | null>` and `fetchLeagueInfoById(id: string): Promise<LeagueInfo | null>` (from `league_directory`)
  - `isSlugTaken(slug: string): Promise<boolean>` (from `league_directory`)
  - `createLeague(input: { owner_id: string; name: string; slug: string }): Promise<{ league: League } | { error: 'limit' | 'taken' | 'other' }>` — maps Postgres messages: contains `league limit reached` → `'limit'`, code `23505` → `'taken'`
  - `updateLeague(id: string, values: { name?: string; logo_url?: string | null }): Promise<boolean>`
  - Superadmin reads: `fetchAdmins(): Promise<AdminProfile[]>` (role `admin`, by `created_at`), `fetchAllLeagues(): Promise<(League & { session_count: number })[]>` via `select('*, sessions(count)')`, `updateAdmin(userId: string, values: Partial<Pick<AdminProfile, 'features' | 'max_leagues' | 'is_disabled' | 'display_name'>>): Promise<boolean>`
- Produces (`adminApi.ts`): `createAdmin(input)`, `resetAdminPassword(userId, password)`, `deleteLeague(leagueId, confirmName)` — each `supabase.functions.invoke('<name>', { body })`, returning `{ ok: true } | { error: string }` (the function's `error` text, or `'network'`)
- Produces (`leagueLogo.ts`): `LOGO_BUCKET = 'league-logos'`, `logoPath(leagueId, now = Date.now())`, `uploadLeagueLogo(leagueId: string, image: Blob): Promise<string | null>`, `deleteLeagueLogo(url: string | null | undefined): Promise<void>`
- Produces (`LeagueLogo.tsx`): `LeagueLogo({ league: Pick<LeagueInfo, 'name' | 'logo_url'>, size?: 'sm' | 'md' | 'lg' })` — `<img>` with `alt=""` when `logo_url`, else an inline SVG grey shield (`role="img"`, `aria-label` = `t('league.noLogo')`), sizes 28/40/96 px, round

- [ ] **Step 1: Write failing tests**: `createLeague` maps a mocked `{ error: { message: 'league limit reached' } }` to `{ error: 'limit' }` and `{ error: { code: '23505' } }` to `{ error: 'taken' }`; `LeagueLogo` renders an `img` when `logo_url` is set and the shield (`getByRole('img', { name: 'No logo' })`) when null; `photoPath('L', 'p1', 5)` → `'L/players/p1-5.jpg'`.
- [ ] **Step 2: Run** `npx vitest run src/lib/tenancy.test.ts src/components/LeagueLogo.test.tsx src/lib/playerPhoto.test.ts` — Expected: FAIL
- [ ] **Step 3: Implement** the files above; add i18n key `league.noLogo` ("No logo" / "بدون شعار").
- [ ] **Step 4: Run** the same tests — Expected: PASS. `npx tsc -b` — errors only at the `uploadPlayerPhoto` call site in `PlayersPage.tsx` (fixed in Task 11); leave it.
- [ ] **Step 5: Commit** — `git commit -m "feat: tenancy data layer and league logo"` (add new files)

---

### Task 8: League context, feature gating, path helpers, profile hook

**Files:**
- Create: `src/contexts/LeagueContext.tsx`, `src/contexts/LeagueContext.test.tsx`
- Create: `src/lib/leaguePaths.ts`, `src/lib/leaguePaths.test.ts`
- Create: `src/hooks/useProfile.ts`

**Interfaces:**
- Consumes: `LeagueInfo`, `fetchMyProfile` (Task 7), `FeatureKey` (Task 1).
- Produces:
  - `LeagueProvider({ league: LeagueInfo, children })`
  - `useLeague(): LeagueInfo` — throws `'useLeague outside LeagueProvider'` without a provider
  - `useFeature(key: FeatureKey): boolean` — `true` when there is no provider (keeps shared components and existing tests working), otherwise `league.features.includes(key)`
  - `Feature({ name: FeatureKey, children })` — renders children only when `useFeature(name)`
  - `useAdminPath(): (rest?: string) => string` — `` `/admin/${slug}${rest ?? ''}` `` for the current league
  - `usePublicPath(): (rest?: string) => string` — `` `/l/${slug}${rest ?? ''}` ``
  - `leaguePaths.ts`: `LEGACY_SLUG = 'eagles'`; `switchLeaguePath(pathname: string, newSlug: string): string` — keeps `players`, `history`, `lineups`, `settings`, `sessions/new`; anything else (including `sessions/<id>/…`, `lineups/<id>`) → `/admin/<newSlug>/history`; `readLastLeague(): string | null`, `writeLastLeague(slug: string): void` (localStorage key `scoreleader.lastLeague`, try/catch)
  - `useProfile(): { profile: AdminProfile | null; loading: boolean }` — uses `useAuth().user`, refetches when the user changes

- [ ] **Step 1: Write failing tests**:
  - `switchLeaguePath('/admin/eagles/players', 'tigers')` → `'/admin/tigers/players'`; `'/admin/eagles/sessions/new'` → `'/admin/tigers/sessions/new'`; `'/admin/eagles/sessions/abc/match/def'` → `'/admin/tigers/history'` (Review Focus 5); `'/admin/eagles/lineups/xyz'` → `'/admin/tigers/history'`; `'/admin/eagles/settings'` → `'/admin/tigers/settings'`.
  - `readLastLeague()` returns `null` when `localStorage.getItem` throws.
  - `<Feature name="cards">` renders its child inside a provider whose features include `cards`, renders nothing when they do not, and renders the child with no provider.
  - `useAdminPath()('/players')` inside a provider for slug `eagles` → `'/admin/eagles/players'`.
- [ ] **Step 2: Run** `npx vitest run src/contexts src/lib/leaguePaths.test.ts` — Expected: FAIL
- [ ] **Step 3: Implement** the files.
- [ ] **Step 4: Run** — Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "feat: league context, feature gating and path helpers"`

---

### Task 9: Routing, guards and redirects

**Files:**
- Create: `src/contexts/MyLeaguesContext.tsx`, `src/routes/FeatureRoute.tsx`
- Create: `src/components/RequireRole.tsx`, `src/routes/AdminHome.tsx`, `src/routes/AdminLeagueRoute.tsx`, `src/routes/PublicLeagueRoute.tsx`, `src/routes/SessionLeagueRoute.tsx`, `src/routes/LegacyRedirects.tsx`, `src/routes/routes.test.tsx`
- Create: `src/pages/NotAvailablePage.tsx` (props `kind: 'league' | 'page' | 'disabled'`)
- Modify: `src/router.tsx`, `src/pages/LoginPage.tsx`
- Delete: `src/components/AuthGuard.tsx` (replaced), unused `src/pages/admin/AdminLayout.tsx` and `src/pages/admin/Dashboard.tsx` (not routed; confirm with `grep -rn "pages/admin/AdminLayout\|Dashboard" src` before deleting)

**Interfaces:**
- Consumes: Tasks 7–8.
- Produces:
  - `RequireRole({ role: Role })` — loading screen while auth/profile load; no user → `/login`; no profile → `NotAvailablePage kind="disabled"` + `signOut()`; `is_disabled` → same; role mismatch → `/admin` for admins, `/super` for superadmin; else `<Outlet />`
  - `AdminHome` (`/admin` index): superadmin → `/super`; admin with leagues → `/admin/<last-used if still owned, else first>/history`; no leagues → `/admin/leagues/new`
  - `MyLeaguesProvider` + `useMyLeagues(): { leagues: League[]; profile: AdminProfile; refresh: () => Promise<void> }` in `MyLeaguesContext.tsx` — wraps everything under `/admin` (inside `RequireRole role="admin"`), loads `fetchMyLeagues()` once
  - `AdminLeagueRoute` (`/admin/:slug`): finds `slug` in `useMyLeagues().leagues`; not found → `/admin`; builds `LeagueInfo` from the league + `profile.features` (`is_available: true`); `writeLastLeague(slug)`; renders `<LeagueProvider><AdminLayout/></LeagueProvider>`
  - `PublicLeagueRoute` (`/l/:slug`): `fetchLeagueInfoBySlug`; null or `!is_available` → `NotAvailablePage kind="league"`; else `<LeagueProvider><PublicLayout/></LeagueProvider>`
  - `SessionLeagueRoute`: for `/s/:token` reads `sessions.select('league_id').eq('share_token', token)`; for `/s/vote/:voteToken` reads `award_votes.select('league_id').eq('vote_token', …)`; then as `PublicLeagueRoute` by id
  - `FeatureRoute({ name: FeatureKey, fallback: 'notFound' | 'history' })` — children when on; else `NotAvailablePage kind="page"` (public) or `Navigate` to the admin history (admin)
  - `LegacyRedirects`: `LegacyPublicRedirect` → `/l/eagles/<same rest>`; `LegacyAdminRedirect` → `/admin/<readLastLeague() ?? first owned>/<same rest>`

Route table (replace the current `router` array):

```
/login, /                       LoginPage
/super                          RequireRole superadmin → SuperLayout (Task 15) → AdminsPage | admins/new | admins/:userId | leagues
/admin                          RequireRole admin →
   index                        AdminHome
   leagues/new                  NewLeaguePage (Task 10)
   players|history|lineups/*|sessions/*   LegacyAdminRedirect
   :slug                        AdminLeagueRoute →
      index → Navigate history; history; players; sessions/new; sessions/:sessionId; …/teams; …/match/:matchId;
      …/awards (FeatureRoute awards, fallback history); lineups, lineups/new, lineups/:lineupId (FeatureRoute coach_board); settings
/l/:slug                        PublicLeagueRoute →
      index LeagueHomePage (Task 13); leaderboard (FeatureRoute leaderboard); records (records); cards (player_cards); players/:playerId (profiles)
/s/:token, /s/vote/:voteToken   SessionLeagueRoute → existing pages
/leaderboard, /records, /cards, /players/:playerId   LegacyPublicRedirect
```

- [ ] **Step 1: Write failing tests** in `routes.test.tsx` (mock `../lib/tenancy` and `../hooks/useAuth`/`useProfile`; render with `createMemoryRouter`):
  - `/leaderboard` → URL becomes `/l/eagles/leaderboard`; `/players/p1` → `/l/eagles/players/p1` (Review Focus 4)
  - admin with leagues `[eagles, tigers]`, last league `tigers`: `/admin` → `/admin/tigers/history`; `/admin/history` → `/admin/tigers/history`; `/admin/sessions/s1` → `/admin/tigers/sessions/s1`
  - admin with no leagues: `/admin` → `/admin/leagues/new`
  - superadmin at `/admin` → `/super`; admin at `/super` → `/admin`
  - disabled profile → text "Your account is disabled" and `signOut` called
  - `/admin/other-league/history` for a slug not owned → `/admin`
  - public league with `records` off: `/l/eagles/records` → "Page not found"
  - unknown slug `/l/nope` → "League not available"
- [ ] **Step 2: Run** `npx vitest run src/routes` — Expected: FAIL
- [ ] **Step 3: Implement**; `LoginPage` navigates to `/admin` after sign-in (unchanged URL; `AdminHome` decides). Add i18n keys `notAvailable.league`, `notAvailable.page` ("Page not found"), `notAvailable.disabled` ("Your account is disabled"). Pages that are not yet league-aware still render; their scoping happens in Tasks 11–13.
- [ ] **Step 4: Run** `npx vitest run` — Expected: all pass. `npx tsc -b` — only the Task 7 `PlayersPage` error remains.
- [ ] **Step 5: Commit** — `git commit -am "feat: league routes, role guards and legacy redirects"` (add new files)

---

### Task 10: Admin layout, league switcher, new league and settings

**Files:**
- Modify: `src/layouts/AdminLayout.tsx`
- Create: `src/components/LeagueSwitcher.tsx`, `src/components/LeagueSwitcher.test.tsx`
- Create: `src/pages/admin/NewLeaguePage.tsx`, `src/pages/admin/NewLeaguePage.test.tsx`, `src/pages/admin/LeagueSettingsPage.tsx`
- Modify: `src/components/PhotoCropper.tsx` only if it needs a prop to reuse for logos (keep behaviour for photos)

**Interfaces:**
- Consumes: `useMyLeagues` (Task 9), `useLeague`, `useAdminPath`, `switchLeaguePath`, `createLeague`, `updateLeague`, `isSlugTaken`, `slugError`, `suggestSlug`, `uploadLeagueLogo`, `deleteLeagueLogo`, `LeagueLogo`, `shareToMessenger`-style helper from `src/lib/messengerShare.ts`.
- Produces: `LeagueSwitcher({ current: League, leagues: League[], maxLeagues: number })`.

Behaviour:
- Header: `LeagueLogo size="sm"` + league name button opening the switcher menu (replaces the "ScoreLeader" home link; the link target is `useAdminPath()('/history')`).
- Nav items use `useAdminPath()`; the Coach Board item renders only when `useFeature('coach_board')`; mobile grid uses `grid-cols-3` when it is hidden. `activeTab` matches on the segment after the slug.
- Switcher menu: owned leagues (check mark on current) → `navigate(switchLeaguePath(location.pathname, slug))`; "+ New league (used/max)" → `/admin/leagues/new`, rendered disabled with text `league.limitReached` ("League limit reached ({{used}}/{{max}})") when `leagues.length >= maxLeagues`; "League settings" → `useAdminPath()('/settings')`.
- `NewLeaguePage` (outside any league, so no `AdminLayout`: a minimal shell with the ScoreLeader title, a back link to `/admin` when the admin already has leagues, language toggle and sign out; uses `useMyLeagues`): name; slug input pre-filled with `suggestSlug(name)` until the user edits it; live error text for `slugError` and (debounced 400 ms) `isSlugTaken`; preview `` `${location.origin}/l/${slug}` ``; optional logo via `PhotoCropper` → `uploadLeagueLogo(newLeague.id, blob)` after the league is created, then `updateLeague(id, { logo_url })`; on `'limit'` shows `league.limitReached`; on `'taken'` shows `league.slugTaken`; on success `refresh()` and navigate to `/admin/<slug>/players`. Page title `league.createFirst` ("Create your first league") when the admin has no leagues, else `league.new`.
- `LeagueSettingsPage`: rename (1–80), change logo (upload → update → delete old), remove logo (`deleteLeagueLogo` → `logo_url: null`), read-only slug, public link with Copy and Messenger share.

- [ ] **Step 1: Write failing tests**:
  - `LeagueSwitcher` with 2 leagues and `maxLeagues` 2 → "League limit reached (2/2)" shown and the new-league control is disabled; with `maxLeagues` 3 → enabled link to `/admin/leagues/new`.
  - `NewLeaguePage`: typing name "Tigers FC" fills slug `tigers-fc`; typing name "دوري النمور" leaves slug empty and Create disabled; slug `players` shows the reserved message; mocked `createLeague` returning `{ error: 'limit' }` shows the limit message.
- [ ] **Step 2: Run** `npx vitest run src/components/LeagueSwitcher.test.tsx src/pages/admin/NewLeaguePage.test.tsx` — Expected: FAIL
- [ ] **Step 3: Implement**; add i18n keys under `league.*` (en + ar).
- [ ] **Step 4: Run** `npx vitest run` — Expected: PASS
- [ ] **Step 5: Commit** — `git commit -am "feat: league switcher, new league and league settings"` (add new files)

---

### Task 11: Scope players, sessions, history and team builder to the league

**Files:**
- Modify: `src/pages/admin/PlayersPage.tsx` (+ its tests), `NewSessionPage.tsx` (+ test), `HistoryPage.tsx`, `TeamBuilderPage.tsx`, `src/components/PlayerAvatar.tsx`

**Interfaces:**
- Consumes: `useLeague`, `useFeature`, `useAdminPath`, `usePublicPath`, `uploadPlayerPhoto(leagueId, playerId, blob)`.

Changes (every root-table read filters `.eq('league_id', league.id)`; every root-table insert includes `league_id: league.id`; every `'/admin/...'` literal becomes `adminPath('...')`):
- `PlayersPage`: players query + insert; photo picker/cropper only when `useFeature('photos')`; upload uses `league.id`; player name link → `publicPath('/players/<id>')` only when `useFeature('profiles')`, else plain text.
- `PlayerAvatar`: when `!useFeature('photos')` render the initials branch even if `photo_url` is set.
- `NewSessionPage`: players query, session insert (`league_id`), navigation.
- `HistoryPage`: sessions query, links.
- `TeamBuilderPage`: `selectAll` sessions and matches add `.eq('league_id', league.id)`; when `!useFeature('smart_balancing')`: do not load form/pairs data, do not render the "balance by" section, use `formPercent = 0` and `synergy = () => 0`; navigation.

- [ ] **Step 1: Write failing tests** (extend existing test files' supabase mocks to record calls; wrap renders in `LeagueProvider` with `league = { id: 'L1', slug: 'eagles', name: 'Eagles', logo_url: null, features: [...FEATURES], is_available: true }`):
  - `PlayersPage` insert payload contains `league_id: 'L1'`; with `photos` removed the photo button is absent.
  - `NewSessionPage` session insert contains `league_id: 'L1'` and navigates to `/admin/eagles/sessions/<id>/teams`.
  - `PlayerAvatar` inside a provider without `photos` and a `photo_url` renders no `img`.
- [ ] **Step 2: Run** `npx vitest run src/pages/admin src/components/PlayerAvatar` — Expected: FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc -b` — Expected: PASS, no type errors
- [ ] **Step 5: Commit** — `git commit -am "feat: scope players, sessions, history and team builder to the league"`

---

### Task 12: Scope match tracker, awards, session detail and coach board; hide match features

**Files:**
- Modify: `src/pages/admin/MatchTrackerPage.tsx`, `AwardsPage.tsx`, `SessionDetailPage.tsx`, `LineupsPage.tsx`, `LineupEditorPage.tsx` (+ test), `src/components/MatchTimeline.tsx`, `src/components/SessionVotes.tsx`

Changes:
- `MatchTrackerPage`: card button + `CardDialog` + `SuspensionCountdown` only with `cards`; swap button + `SwapDialog` + undo-swap only with `swaps`; after the last match navigate to `adminPath('/sessions/<id>/awards')` with `awards`, else mark the session `completed` (same update `AwardsPage` uses) and navigate to `adminPath('/sessions/<id>')`.
- `AwardsPage`: "Open vote" tab only with `voting` (default tab `admin_direct`); navigation via `adminPath`.
- `SessionDetailPage`: `SessionSummaryShare` only with `summary_share`; `SessionVotes` only with `voting`; awards block only with `awards`; back link via `adminPath`.
- `MatchTimeline`: filter out `yellow_card`/`red_card` events when `!useFeature('cards')` and `swap` events when `!useFeature('swaps')` (works for admin and public because it uses the context).
- `LineupsPage` / `LineupEditorPage`: lineups query filtered by `league_id`, insert includes `league_id`, players query filtered by `league_id`, links via `adminPath`.

- [ ] **Step 1: Write failing tests**:
  - `MatchTimeline` with a goal, a yellow card and a swap, inside a provider without `cards` and `swaps` → only the goal is rendered.
  - `LineupEditorPage` (existing test, wrapped in a provider) → insert payload includes `league_id: 'L1'`.
  - `AwardsPage` without `voting` → no "Open vote" tab (mock data like other page tests).
- [ ] **Step 2: Run** `npx vitest run src/components/MatchTimeline src/pages/admin` — Expected: FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc -b` — Expected: PASS
- [ ] **Step 5: Commit** — `git commit -am "feat: scope match, awards and coach board to the league; hide disabled match features"`

---

### Task 13: Public pages per league

**Files:**
- Modify: `src/layouts/PublicLayout.tsx`, `src/lib/league.ts`, `src/pages/public/LeaderboardPage.tsx`, `RecordsPage.tsx`, `CardsPage.tsx`, `PlayerProfilePage.tsx`, `LiveSessionPage.tsx`, `VotePage.tsx`
- Create: `src/pages/public/LeagueHomePage.tsx`, `src/pages/public/LeagueHomePage.test.tsx`, `src/layouts/PublicLayout.test.tsx`

Changes:
- `loadLeague(leagueId: string): Promise<FullLeague>` — every `selectAll` adds `.eq('league_id', leagueId)`; callers pass `useLeague().id`.
- `LeaderboardPage`: all five loads filter by `league_id`; POTM block only with `potm`; player links only with `profiles`; photos via `PlayerAvatar`.
- `RecordsPage`, `CardsPage`: `loadLeague(league.id)`; links only with `profiles`.
- `PlayerProfilePage`: player must have `league_id === league.id` (else "Page not found"); `PlayerBadges` only with `badges`; card view + share only with `player_cards`; back link → `publicPath('/leaderboard')` with `leaderboard`, else `publicPath()`.
- `LiveSessionPage`, `VotePage`: unchanged queries (tokens are global); `VotePage` shows `vote.closed` ("Voting is closed") when `!useFeature('voting')`.
- `PublicLayout`: header shows `LeagueLogo size="sm"` + league name linking to `publicPath()`; NAV items built from `publicPath()` and filtered: leaderboard→`leaderboard`, records→`records`, cards→`player_cards`; mobile grid columns = number of items (hide the bar when 0).
- `LeagueHomePage`: `LeagueLogo size="lg"`, name; active session (`sessions` `status = 'active'`, this league) → card linking `/s/<share_token>`; last 10 `completed` sessions → links `/s/<share_token>` with formatted date (`date-fns`, as `HistoryPage`); links to enabled pages.

- [ ] **Step 1: Write failing tests**:
  - `PublicLayout` with features `['records']` → only a "Records" nav link, href `/l/eagles/records`.
  - `LeagueHomePage` with mocked sessions (one active, two completed) → active card and two history links with `/s/<token>` hrefs; renders with features `[]`.
  - `loadLeague('L1')` calls `.eq('league_id', 'L1')` for all seven tables (mock records calls).
- [ ] **Step 2: Run** `npx vitest run src/layouts src/pages/public src/lib` — Expected: FAIL
- [ ] **Step 3: Implement**; add i18n keys `leagueHome.*`, `vote.closed`.
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc -b` — Expected: PASS
- [ ] **Step 5: Commit** — `git commit -am "feat: public league pages, league home and feature-aware navigation"` (add new files)

---

### Task 14: Superadmin — admins list and new admin

**Files:**
- Create: `src/layouts/SuperLayout.tsx`, `src/pages/super/AdminsPage.tsx`, `src/pages/super/NewAdminPage.tsx`, `src/pages/super/NewAdminPage.test.tsx`, `src/components/FeatureChecklist.tsx`, `src/components/FeatureChecklist.test.tsx`

**Interfaces:**
- Consumes: `fetchAdmins`, `fetchAllLeagues`, `createAdmin`, `setFeature`, `FEATURES`.
- Produces: `FeatureChecklist({ value: FeatureKey[], onChange: (v: FeatureKey[]) => void })` — one checkbox per feature with label `features.<key>` and the dependency hint `features.needs` ("Needs {{feature}}") for dependent ones; "Select all" / "None" buttons; every toggle goes through `setFeature`.

Behaviour:
- `SuperLayout`: header "ScoreLeader · Superadmin", tabs Admins (`/super`) / Leagues (`/super/leagues`), language toggle, sign out — same styles as `AdminLayout`.
- `AdminsPage`: rows with display name, email, `leagues used/max` (count from `fetchAllLeagues` grouped by `owner_id`), `n features`, Active/Disabled badge; row links to `/super/admins/<user_id>`; "+ New" → `/super/admins/new`.
- `NewAdminPage`: name, email, password (show/hide), max leagues (number, default 1), `FeatureChecklist` (default all on); client checks reuse `validateCreateAdmin`; submit → `createAdmin`; on success navigate to `/super/admins/<user_id>`; on error show the returned text.

- [ ] **Step 1: Write failing tests**:
  - `FeatureChecklist`: ticking "Award voting" from `[]` calls `onChange(['awards','voting'])`; "None" calls `onChange([])`.
  - `NewAdminPage`: a 7-char password shows the error and does not call `createAdmin`; a valid form calls `createAdmin` with lowercased email and the chosen features.
- [ ] **Step 2: Run** `npx vitest run src/components/FeatureChecklist.test.tsx src/pages/super` — Expected: FAIL
- [ ] **Step 3: Implement**; i18n keys `super.*` and `features.<key>` (names from the spec table) in en + ar.
- [ ] **Step 4: Run** `npx vitest run` — Expected: PASS
- [ ] **Step 5: Commit** — `git commit -am "feat: superadmin admins list and new admin"` (add new files)

---

### Task 15: Superadmin — admin details and all leagues

**Files:**
- Create: `src/pages/super/AdminDetailPage.tsx`, `src/pages/super/AdminDetailPage.test.tsx`, `src/pages/super/LeaguesPage.tsx`, `src/components/DeleteLeagueDialog.tsx`

Behaviour:
- `AdminDetailPage`: loads the profile (from `fetchAdmins`) and its leagues (from `fetchAllLeagues`); edit display name, max leagues, `FeatureChecklist` → Save (`updateAdmin`), success toast via `showToast`; Disable/Enable toggles `is_disabled`; Reset password (input ≥ 8 → `resetAdminPassword`); leagues list (`LeagueLogo`, name, `/l/<slug>` link opening in a new tab, session count) each with Delete.
- `DeleteLeagueDialog({ league, onDeleted })`: explains that all its players, sessions, photos and logo are deleted permanently; Delete button enabled only when the typed text equals `league.name` exactly; calls `deleteLeague(id, typed)`; shows returned error.
- `LeaguesPage`: all leagues — logo, name, owner email, created date, session count, public link.

- [ ] **Step 1: Write failing tests**:
  - `DeleteLeagueDialog`: button disabled until "Eagles" typed exactly ("eagles" keeps it disabled); confirm calls `deleteLeague('L1', 'Eagles')`.
  - `AdminDetailPage`: Save with changed max leagues calls `updateAdmin(userId, expect.objectContaining({ max_leagues: 3 }))`.
- [ ] **Step 2: Run** `npx vitest run src/pages/super src/components/DeleteLeagueDialog` — Expected: FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npx vitest run`, `npx tsc -b`, `npm run build` — Expected: all pass, build succeeds
- [ ] **Step 5: Commit** — `git commit -am "feat: superadmin admin details and leagues list"` (add new files)

---

### Task 16: Rollout to the live project

Every step here touches the live project; stop and report on any unexpected output. Get the service key into `$KEY` first (Global Constraints).

- [ ] **Step 1: Final rehearsal** — `bash scripts/rehearse.sh` → `TENANCY TESTS PASSED`.
- [ ] **Step 2: Backup** — `SUPABASE_SERVICE_ROLE_KEY=$KEY node scripts/backup.ts` → manifest; record the folder path for the report.
- [ ] **Step 3: Apply Migration 1** — `supabase db push --linked --dry-run` (lists exactly `20261006000001`, `20261006000002`), then `supabase db push --linked --yes`. Verify: `supabase db query --linked "select slug, (select count(*) from players where league_id = l.id) from leagues l"` → `eagles` with the full player count; the old app on the production URL still loads `/leaderboard`.
- [ ] **Step 4: Move photos** — `node scripts/move-photos.ts --dry-run` (review), then `node scripts/move-photos.ts` → `failed: []`, `broken: []`; report `stray` to the user without deleting.
- [ ] **Step 5: Deploy Edge Functions** — `supabase functions deploy create-admin reset-admin-password delete-league --use-api --project-ref tunwvypccjsbzlclmxrk`. Smoke test each function: `curl -X POST https://tunwvypccjsbzlclmxrk.supabase.co/functions/v1/<name> -H "Authorization: Bearer <anon key>" -H "Content-Type: application/json" -d '{}'` → `403` (the anon caller is not a superadmin). Success paths are checked in Step 7.
- [ ] **Step 6: Create the superadmin** — ask the user for the password for `admin@codorasoft.com`; write `scripts/create-superadmin.ts` (reads `SUPERADMIN_PASSWORD` from env; `auth.admin.createUser({ email: 'admin@codorasoft.com', password, email_confirm: true })`; inserts `admin_profiles` `role 'superadmin'`, `display_name 'Superadmin'`, `max_leagues 0`, `features '{}'`); run it; verify sign-in works with `signInWithPassword`.
- [ ] **Step 7: Browser check (local dev against live DB)** — `npm run dev`; as superadmin create two test admins `test-full@codorasoft.test` (all features, max 2) and `test-few@codorasoft.test` (only `leaderboard`, max 1); as each, create a league, add a player with a photo (full only), run a short session; confirm every row of spec Sections 9–10 tables (hidden menus/buttons, public pages, "Page not found", vote closed) and the limit message; as `info@codorasoft.com` confirm Eagles shows all existing data and photos. Then, as superadmin, delete both test leagues (`delete-league`) and delete both test auth users via the Admin API; confirm `select count(*) from leagues` = 1.
- [ ] **Step 8: Deploy the app** — push the branch, open a PR to `main`, merge (Vercel deploys `main`). Confirm the production URL serves `/l/eagles` and `/leaderboard` redirects there.
- [ ] **Step 9: Migration 2** — create `supabase/migrations/20261006000003_drop_temporary_league_defaults.sql` (`ALTER TABLE public.players|sessions|lineups ALTER COLUMN league_id DROP DEFAULT`), commit to `main`, `supabase db push --linked --yes`; verify `select column_default from information_schema.columns where column_name = 'league_id' and table_name in ('players','sessions','lineups')` → all null.
- [ ] **Step 10: Report** — backup folder, stray photo list, superadmin and admin logins, links.
