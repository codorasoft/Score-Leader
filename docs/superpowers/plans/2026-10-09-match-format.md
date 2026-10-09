# Match Format Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin choose, per session, how matches are played (one period, two halves, extra time, penalties, goal limit, draw rule), and make the tracker, live page and rotation follow that choice.

**Architecture:** Six format columns on `sessions` and four on `matches` (plus `period` on events), applied by one migration with defaults that reproduce today's rules. One pure module, `src/utils/matchFormat.ts`, turns a session's format and a match's state into the next step (play, end period, start period, penalties, end match, draw); the tracker and live page only render what it returns. Delivered as three pull requests: data + settings (everything still plays as Quick), periods on the pitch, draw rule in the rotation.

**Tech Stack:** React 19 + TypeScript, Vite, Vitest + Testing Library (in-memory Supabase fake in `src/test/fakeSupabase.ts`), Supabase (Postgres, PostgREST), i18next (`src/locales/en.json`, `ar.json`).

**Spec:** `docs/superpowers/specs/2026-10-09-match-format-design.md`

## Global Constraints

- Defaults equal today's rules exactly: `period_count 1`, `period_minutes 7`, `extra_time_minutes NULL`, `penalties false`, `goal_limit 2`, `draw_rule 'stay'`; every existing match and event gets `period 1`.
- Ranges enforced by the database: `period_count IN (1,2)`, `period_minutes 1–45`, `extra_time_minutes 1–15 or NULL`, `goal_limit 1–10 or NULL`, `draw_rule IN ('stay','draw')`, `period 1–5`, `penalties_team1/2 ≥ 0 or NULL`.
- Presets: Quick = 1 × 7, no ET, no pens, limit 2, `stay`; Halves = 2 × 10, no ET, no pens, no limit, `draw`; Knockout = 2 × 10, ET 5, pens, no limit, `stay`.
- The goal limit applies in regular periods only, never in extra time.
- Every new match row and event row sent by the app carries `period` explicitly (the old-app trigger relies on it).
- Every time written for others to see uses `serverNowIso()` (`src/lib/serverClock.ts`), never `new Date()`.
- Every new user-visible string is added to both `src/locales/en.json` and `src/locales/ar.json`.
- Each pull request is green on `npm test` and `npm run build` before merging; the migration is applied to Zurich with `supabase db push --linked --dry-run` first (token from `.env.zurich.local`).
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. A goal that reaches the goal limit **during extra time** must not end the match (limit is regular-time only). Pinned in Task 2.
2. **"End half" while the clock is paused** (not running) must record the paused elapsed time and freeze the clock. Pinned in Task 5.
3. **Reloading the tracker between periods** (clock stopped, period 1 finished) must show the between-periods screen with "Start 2nd half", not a fresh "Start". Pinned in Task 7.
4. **An old single-period session opened in the new tracker** must behave exactly as before: the main button is "End match", never "End 1st half". Pinned in Task 7.
5. **A 2-team session with `draw_rule 'draw'`** ending level must create the next match with the same two teams and save a true draw. Pinned in Task 9.

---

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261009000001_match_format.sql` | columns, checks, backfill, old-app trigger |
| `src/lib/types.ts` | `Session`, `Match`, `MatchEvent` fields; `DrawRule` |
| `src/utils/matchFormat.ts` (new) | presets, period sequence, next step, labels, totals |
| `src/utils/matchClock.ts` | clock formatting takes the period length; `finishedMatchFields` records the last period |
| `src/utils/matchOutcome.ts` | outcome reasons from the format, plus `extraTime` and `draw` |
| `src/utils/matchRotation.ts` | `decideResult` with format; `resolveMatch` draw branch |
| `src/utils/pitchOps.ts` | events carry `period` |
| `src/hooks/useMatchTimer.ts` | `endPeriod`, `startPeriod` |
| `src/components/NewSessionDialog.tsx` | chips, fields, summary, remember last |
| `src/components/MatchFormatLine.tsx` (new) | one-line summary of a format |
| `src/components/MatchResultDialog.tsx` | reason text from the format |
| `src/components/SessionMatchList.tsx`, `MatchTimeline.tsx` | result labels with pens/aet/draw; period prefix |
| `src/pages/admin/MatchTrackerPage.tsx` | period label, between-periods screen, step button |
| `src/pages/admin/SessionDetailPage.tsx`, `TeamBuilderPage.tsx`, `HistoryPage.tsx` | summary line; `period` on inserts; result text |
| `src/pages/public/LiveSessionPage.tsx` | period label, half-time, pens score |
| `src/pages/admin/HomePage.tsx` | live-card clock capped by the session's period length |
| `src/test/fixtures.ts` | factories include the new fields |

---

# PR 1 — Data and settings

### Task 1: Migration, applied to Zurich

**Files:**
- Create: `supabase/migrations/20261009000001_match_format.sql`

**Interfaces:**
- Produces: the columns and checks listed in Global Constraints; `draw_resolved_by` CHECK allows `'penalties','late_team','extra_time'`; trigger `matches_period_from_old_apps` BEFORE INSERT ON `public.matches` → `public.match_period_from_old_apps()`.

- [ ] **Step 1: Write the migration**

Contents, in order:
1. `ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS` for the six columns with the defaults and CHECKs in Global Constraints (`draw_rule text NOT NULL DEFAULT 'stay' CHECK (draw_rule IN ('stay','draw'))`).
2. `ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS period smallint CHECK (period BETWEEN 1 AND 5)` (nullable for now), `period_seconds smallint[] NOT NULL DEFAULT '{}'`, `penalties_team1 smallint CHECK (penalties_team1 >= 0)`, `penalties_team2 smallint CHECK (penalties_team2 >= 0)`.
3. `UPDATE public.matches SET period = 1 WHERE period IS NULL;` then `ALTER TABLE public.matches ALTER COLUMN period SET NOT NULL;` (no default: see trigger).
4. `ALTER TABLE public.match_events ADD COLUMN IF NOT EXISTS period smallint NOT NULL DEFAULT 1 CHECK (period BETWEEN 1 AND 5);`
5. Replace the `draw_resolved_by` check: `ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_draw_resolved_by_check; ALTER TABLE public.matches ADD CONSTRAINT matches_draw_resolved_by_check CHECK (draw_resolved_by IN ('penalties','late_team','extra_time'));`
6. Function + trigger, modelled on `20261007000001_match_queue_guard.sql`:

```sql
CREATE OR REPLACE FUNCTION public.match_period_from_old_apps() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE periods smallint; et smallint;
BEGIN
  IF NEW.period IS NULL THEN
    SELECT period_count, extra_time_minutes INTO periods, et FROM public.sessions WHERE id = NEW.session_id;
    IF periods IS DISTINCT FROM 1 OR et IS NOT NULL THEN
      RAISE EXCEPTION 'This app version is out of date. Reload the page and try again.';
    END IF;
    NEW.period := 1;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS matches_period_from_old_apps ON public.matches;
CREATE TRIGGER matches_period_from_old_apps BEFORE INSERT ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.match_period_from_old_apps();
```

- [ ] **Step 2: Dry run against Zurich**

Run (Git Bash, from `E:/Score-Leader`): `export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.zurich.local | cut -d= -f2- | tr -d '\r'); export SUPABASE_DB_PASSWORD=$(grep '^ZURICH_DB_PASSWORD=' .env.zurich.local | cut -d= -f2- | tr -d '\r'); supabase db push --linked --dry-run`
Expected: "Would push these migrations: • 20261009000001_match_format.sql" and nothing else.

- [ ] **Step 3: Apply**

Run: same exports, then `supabase db push --linked --yes`
Expected: "Applying migration 20261009000001_match_format.sql..." then "Finished supabase db push."

- [ ] **Step 4: Verify through the API as the public**

Run (Node, reading `.env.production`): `GET /rest/v1/sessions?select=period_count,period_minutes,extra_time_minutes,penalties,goal_limit,draw_rule&limit=1` and `GET /rest/v1/matches?select=period,period_seconds,penalties_team1&limit=1` and `GET /rest/v1/match_events?select=period&limit=1`.
Expected: `{"period_count":1,"period_minutes":7,"extra_time_minutes":null,"penalties":false,"goal_limit":2,"draw_rule":"stay"}`, `{"period":1,"period_seconds":[],"penalties_team1":null}`, `{"period":1}`. (The schema cache may take ~10 s; retry once.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261009000001_match_format.sql
git commit -m "feat(db): per-session match format columns, match periods, saved penalties; old-app guard"
```

### Task 2: Types and the `matchFormat` module

**Files:**
- Modify: `src/lib/types.ts:21-31` (Session), `:41-62` (Match), `:64-78` (MatchEvent)
- Modify: `src/test/fixtures.ts:13-23` (`match`, `event` factories), `:35` (`session`)
- Create: `src/utils/matchFormat.ts`, `src/utils/matchFormat.test.ts`

**Interfaces:**
- Produces, in `types.ts`:
  - `export type DrawRule = 'stay' | 'draw'`
  - `Session` gains `period_count: number; period_minutes: number; extra_time_minutes: number | null; penalties: boolean; goal_limit: number | null; draw_rule: DrawRule`
  - `Match` gains `period: number; period_seconds: number[]; penalties_team1: number | null; penalties_team2: number | null`; `draw_resolved_by: 'penalties' | 'late_team' | 'extra_time' | null`
  - `MatchEvent` gains `period: number`
- Produces, in `matchFormat.ts`:
  - `export type MatchFormat = Pick<Session, 'period_count' | 'period_minutes' | 'extra_time_minutes' | 'penalties' | 'goal_limit' | 'draw_rule'>`
  - `export type PresetName = 'quick' | 'halves' | 'knockout'`
  - `export const PRESETS: Record<PresetName, MatchFormat>` (values from Global Constraints)
  - `export const DEFAULT_FORMAT: MatchFormat` (= `PRESETS.quick`)
  - `export function presetName(f: MatchFormat): PresetName | 'custom'` — all six fields equal; for Knockout `draw_rule` is ignored.
  - `export interface Period { number: number; kind: 'regular' | 'extra' | 'penalties'; minutes: number | null }` (`minutes` null for penalties)
  - `export function periodsFor(f: MatchFormat): Period[]` — regular periods, then ET1/ET2 if `extra_time_minutes`, then penalties if `penalties`. Numbers: regular 1..`period_count`; extra always 3 and 4; penalties always 5.
  - `export function periodLabelKey(period: number, f: MatchFormat): string` — `'match.period.full'` when `period_count === 1 && period === 1`; `'match.period.first'`, `'match.period.second'`, `'match.period.extra1'`, `'match.period.extra2'`, `'match.period.penalties'`.
  - `export function periodLength(period: number, f: MatchFormat): number | null` — seconds for that period (regular: `period_minutes*60`; extra: `extra_time_minutes*60`; penalties: null).
  - `export function totalSeconds(m: Pick<Match, 'period_seconds'>, currentElapsed: number): number` — sum of `period_seconds` + `currentElapsed`.
  - `export type Step = { kind: 'play' } | { kind: 'endPeriod'; period: number; timeUp: boolean } | { kind: 'startPeriod'; period: number } | { kind: 'penalties' } | { kind: 'endMatch'; reason: 'goalLimit' | 'timeUp' } | { kind: 'draw' }`
  - `export function nextStep(f: MatchFormat, m: Pick<Match, 'period' | 'team1_score' | 'team2_score' | 'timer_status' | 'status'>, elapsed: number): Step`

Rules for `nextStep`, in order:
1. `status === 'completed'` → never called; return `{ kind: 'play' }`.
2. `m.period === 5` → `{ kind: 'penalties' }`.
3. Goal limit: `f.goal_limit` set, the current period is regular, and a score `>= goal_limit` → `{ kind: 'endMatch', reason: 'goalLimit' }`.
4. Clock `stopped` and `period_seconds` shows this period already finished (caller passes `elapsed`; "finished" means `timer_status === 'stopped'` and the period has been ended, which the tracker knows because `period_seconds.length >= period`): the match is between periods → the next period from `periodsFor` after `m.period`: regular/extra → `{ kind: 'startPeriod', period }`; penalties → `{ kind: 'penalties' }`; none left → level ? `{ kind: 'draw' }` : `{ kind: 'endMatch', reason: 'timeUp' }`. To keep the signature small, `nextStep` takes `m.period_seconds` too: add `'period_seconds'` to the Pick.
5. Otherwise the period is in play → `{ kind: 'endPeriod', period: m.period, timeUp: elapsed >= periodLength(m.period, f) }` when this is the last period that could end the match and scores differ, or when more periods follow; the tracker renders "End match" instead of "End 2nd half" when the period is the last regular/extra one and scores differ (decided by `isLastPeriod(f, m, level)` below).
   - `export function periodAfter(f: MatchFormat, period: number, level: boolean): Period | null` — the next period to play given the current one just ended: after the last regular period, extra time only if `level` and `extra_time_minutes`; after ET2, penalties only if `level` and `penalties`; after regular time with no ET, penalties only if `level` and `penalties`; otherwise null.

- [ ] **Step 1: Write the failing tests** (`src/utils/matchFormat.test.ts`)

```ts
import { PRESETS, DEFAULT_FORMAT, presetName, periodsFor, periodLabelKey, periodLength, totalSeconds, periodAfter, nextStep } from './matchFormat'
const m = (o: Partial<Parameters<typeof nextStep>[1]> = {}) => ({ period: 1, period_seconds: [], team1_score: 0, team2_score: 0, timer_status: 'running' as const, status: 'active' as const, ...o })

it('DEFAULT_FORMAT is Quick: 1 × 7 min, limit 2, no extra time, no penalties, stay', () =>
  expect(DEFAULT_FORMAT).toEqual({ period_count: 1, period_minutes: 7, extra_time_minutes: null, penalties: false, goal_limit: 2, draw_rule: 'stay' }))
it('presetName recognises each preset, ignores draw_rule for knockout, else custom', () => {
  expect(presetName(PRESETS.halves)).toBe('halves')
  expect(presetName({ ...PRESETS.knockout, draw_rule: 'draw' })).toBe('knockout')
  expect(presetName({ ...PRESETS.quick, period_minutes: 8 })).toBe('custom')
})
it('periodsFor: quick = [1]; halves = [1,2]; knockout = [1,2,3,4,5] with kinds', () => {
  expect(periodsFor(PRESETS.quick).map(p => p.number)).toEqual([1])
  expect(periodsFor(PRESETS.knockout).map(p => [p.number, p.kind, p.minutes])).toEqual([[1,'regular',10],[2,'regular',10],[3,'extra',5],[4,'extra',5],[5,'penalties',null]])
})
it('periodLabelKey: single period says full match; halves and extra time named', () => {
  expect(periodLabelKey(1, PRESETS.quick)).toBe('match.period.full')
  expect(periodLabelKey(2, PRESETS.halves)).toBe('match.period.second')
  expect(periodLabelKey(4, PRESETS.knockout)).toBe('match.period.extra2')
})
it('periodLength in seconds; null for penalties', () => {
  expect(periodLength(1, PRESETS.quick)).toBe(420); expect(periodLength(3, PRESETS.knockout)).toBe(300); expect(periodLength(5, PRESETS.knockout)).toBeNull()
})
it('totalSeconds sums finished periods and the current clock', () => expect(totalSeconds({ period_seconds: [640, 600] }, 45)).toBe(1285))
describe('periodAfter', () => {
  it('halves: after period 2 nothing follows, level or not', () => { expect(periodAfter(PRESETS.halves, 2, true)).toBeNull(); expect(periodAfter(PRESETS.halves, 2, false)).toBeNull() })
  it('knockout: after period 2 extra time only when level; after ET2 penalties only when level', () => {
    expect(periodAfter(PRESETS.knockout, 2, true)?.number).toBe(3); expect(periodAfter(PRESETS.knockout, 2, false)).toBeNull()
    expect(periodAfter(PRESETS.knockout, 4, true)?.number).toBe(5); expect(periodAfter(PRESETS.knockout, 4, false)).toBeNull()
  })
  it('penalties without extra time follow regular time directly', () =>
    expect(periodAfter({ ...PRESETS.halves, penalties: true }, 2, true)?.number).toBe(5))
})
describe('nextStep', () => {
  it('quick: goal limit ends the match at once', () => expect(nextStep(PRESETS.quick, m({ team1_score: 2 }), 100)).toEqual({ kind: 'endMatch', reason: 'goalLimit' }))
  it('goal limit does not apply in extra time', () =>
    expect(nextStep({ ...PRESETS.knockout, goal_limit: 2 }, m({ period: 3, period_seconds: [600, 600], team1_score: 2 }), 30)).toEqual({ kind: 'endPeriod', period: 3, timeUp: false }))
  it('halves: in play before time → endPeriod not timeUp; after time → timeUp', () => {
    expect(nextStep(PRESETS.halves, m(), 100)).toEqual({ kind: 'endPeriod', period: 1, timeUp: false })
    expect(nextStep(PRESETS.halves, m(), 600)).toEqual({ kind: 'endPeriod', period: 1, timeUp: true })
  })
  it('halves: between periods → startPeriod 2', () =>
    expect(nextStep(PRESETS.halves, m({ period: 1, period_seconds: [612], timer_status: 'stopped' }), 612)).toEqual({ kind: 'startPeriod', period: 2 }))
  it('halves: after period 2, level → draw; leader → endMatch timeUp', () => {
    expect(nextStep(PRESETS.halves, m({ period: 2, period_seconds: [600, 600], timer_status: 'stopped' }), 600)).toEqual({ kind: 'draw' })
    expect(nextStep(PRESETS.halves, m({ period: 2, period_seconds: [600, 600], timer_status: 'stopped', team1_score: 1 }), 600)).toEqual({ kind: 'endMatch', reason: 'timeUp' })
  })
  it('knockout: level after ET2 → penalties; period 5 → penalties', () => {
    expect(nextStep(PRESETS.knockout, m({ period: 4, period_seconds: [600,600,300,300], timer_status: 'stopped' }), 300)).toEqual({ kind: 'penalties' })
    expect(nextStep(PRESETS.knockout, m({ period: 5 }), 0)).toEqual({ kind: 'penalties' })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/utils/matchFormat.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Add the type fields and update fixtures**

In `fixtures.ts`: `session` gets `...DEFAULT_FORMAT`; `match()` gets `period: 1, period_seconds: [], penalties_team1: null, penalties_team2: null`; `event()` gets `period: 1`. In `src/pages/admin/HomePage.test.tsx` the inline `session()` helper and `match()` helper are plain objects and need nothing.

- [ ] **Step 4: Implement `src/utils/matchFormat.ts`** with the signatures above.

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `npx vitest run && npx tsc -b`
Expected: all pass; typecheck clean (fix any test that builds a `Session`/`Match` literal by spreading the fixture).

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/test/fixtures.ts src/utils/matchFormat.ts src/utils/matchFormat.test.ts
git commit -m "feat: match format types, presets and period sequence"
```

### Task 3: New-session popup chooses the format

**Files:**
- Modify: `src/components/NewSessionDialog.tsx:38-70` (state, last-setup effect, insert) and the form body
- Create: `src/components/MatchFormatLine.tsx`
- Modify: `src/components/NewSessionDialog.test.tsx`
- Modify: `src/locales/en.json`, `src/locales/ar.json`

**Interfaces:**
- Consumes: `PRESETS`, `DEFAULT_FORMAT`, `presetName`, `MatchFormat` (Task 2).
- Produces: `MatchFormatLine({ format }: { format: MatchFormat })` renders one line: `t('format.line.periods', { count, minutes })` + ` · ` + (`t('format.line.extraTime', { minutes })` if any) + (`t('format.line.penalties')` if any) + (`goal_limit ? t('format.line.goalLimit', { count }) : t('format.line.noGoalLimit')`) + (when `!penalties`: `t('format.line.drawStay')` or `t('format.line.drawDraw')`).
- Locale keys (en): `format.quick "Quick"`, `format.halves "Halves"`, `format.knockout "Knockout"`, `format.custom "Custom"`, `format.periods "Periods"`, `format.minutes "Minutes per period"`, `format.extraTime "Extra time (min per half)"`, `format.off "Off"`, `format.penalties "Penalties"`, `format.goalLimit "Goal limit"`, `format.drawRule "If level"`, `format.drawStay "Team already on goes off"`, `format.drawDraw "Draw stands, both go off"`, `format.line.periods_one "{{count}} × {{minutes}} min"`, `format.line.periods_other "{{count}} × {{minutes}} min"`, `format.line.extraTime "extra time 2 × {{minutes}}"`, `format.line.penalties "penalties"`, `format.line.goalLimit "first to {{count}}"`, `format.line.noGoalLimit "no goal limit"`, `format.line.drawStay "draw: team already on goes off"`, `format.line.drawDraw "a draw stays a draw"`. Arabic equivalents in `ar.json`.

- [ ] **Step 1: Write the failing tests** (add to `NewSessionDialog.test.tsx`, using its existing render helper and fake db)

```ts
it('offers Quick, Halves and Knockout; Quick is selected by default and the line describes it', async () => {
  renderDialog()
  expect(screen.getByRole('radio', { name: 'Quick' })).toBeChecked()
  expect(screen.getByText('1 × 7 min · first to 2 · draw: team already on goes off')).toBeInTheDocument()
})
it('Halves fills the fields and the line; editing a number shows Custom', async () => {
  renderDialog()
  await user.click(screen.getByRole('radio', { name: 'Halves' }))
  expect(screen.getByText('2 × 10 min · no goal limit · a draw stays a draw')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'More minutes' }))
  expect(screen.getByRole('radio', { name: 'Custom' })).toBeChecked()
  expect(screen.getByText('2 × 11 min · no goal limit · a draw stays a draw')).toBeInTheDocument()
})
it('Knockout turns penalties on and disables the draw rule', async () => {
  renderDialog(); await user.click(screen.getByRole('radio', { name: 'Knockout' }))
  expect(screen.getByRole('switch', { name: 'Penalties' })).toBeChecked()
  expect(screen.getByRole('radio', { name: 'Draw stands, both go off' })).toBeDisabled()
})
it('saves the six format values with the session', async () => {
  renderDialog(); await user.click(screen.getByRole('radio', { name: 'Halves' })); await user.click(screen.getByRole('button', { name: 'Create session' }))
  await waitFor(() => expect(db.writes.find(w => w.table === 'sessions')?.values).toMatchObject({ period_count: 2, period_minutes: 10, extra_time_minutes: null, penalties: false, goal_limit: null, draw_rule: 'draw' }))
})
it('starts from the last session’s format', async () => {
  resetDb({ sessions: [{ ...session, ...PRESETS.knockout, created_at: '2026-10-01T00:00:00Z' }] })
  renderDialog()
  await waitFor(() => expect(screen.getByRole('radio', { name: 'Knockout' })).toBeChecked())
})
```

(Adjust the exact helper names to the file's existing ones: it already renders with `InLeague` and the fake db, and tests the team-count stepper the same way.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/NewSessionDialog.test.tsx`
Expected: FAIL, no radio named "Quick".

- [ ] **Step 3: Implement**

- State: `const [format, setFormat] = useState<MatchFormat>(DEFAULT_FORMAT)`; `const chosen = presetName(format)`; chips are a `radiogroup` of four radios (Quick, Halves, Knockout, Custom; Custom is disabled unless `chosen === 'custom'`); picking a preset sets `format = PRESETS[name]` and marks `touched`.
- Fields: `Stepper` for periods (1–2) and minutes (1–45); extra time as a Stepper 0–15 where 0 shows `format.off` and stores `null`; a `switch` button (`role="switch"`, `aria-checked`) for penalties; goal limit Stepper 0–10 where 0 = `null`; draw rule as two radios named by `format.drawStay` / `format.drawDraw`, `disabled` when `penalties`.
- Last-setup effect: select the six columns too and apply them when `!touched.current`.
- Insert: spread `...format` into the `sessions` insert at line 66.
- `<MatchFormatLine format={format} />` under the fields.

- [ ] **Step 4: Run tests, then the whole suite**

Run: `npx vitest run src/components/NewSessionDialog.test.tsx && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/NewSessionDialog.tsx src/components/NewSessionDialog.test.tsx src/components/MatchFormatLine.tsx src/locales/en.json src/locales/ar.json
git commit -m "feat: choose the match format when starting a session"
```

### Task 4: Every new match and event carries its period; summary line on Session detail

**Files:**
- Modify: `src/utils/pitchOps.ts:9-27` (`Common.match` Pick adds `'period'`; `eventRow` sets `period: p.match.period`)
- Modify: `src/pages/admin/TeamBuilderPage.tsx:142` (first match insert adds `period: 1`), `src/pages/admin/MatchTrackerPage.tsx:257` (next match insert adds `period: 1`), `src/pages/admin/SessionDetailPage.tsx:102,106,137` (goal/assist inserts add `period: match.period`; match insert adds `period: 1`)
- Modify: `src/pages/admin/SessionDetailPage.tsx` (render `<MatchFormatLine format={session} />` under the date)
- Modify tests: `src/utils/pitchOps.test.ts`, `src/pages/admin/MatchTrackerPage.test.tsx`, `src/pages/admin/TeamBuilderPage.test.tsx`, `src/pages/admin/SessionDetailPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

```ts
// pitchOps.test.ts
it('every event row carries the match period', () => {
  const ops = goalOps({ ...common, match: { ...common.match, period: 2 } })
  for (const op of ops.filter(o => o.table === 'match_events')) expect((op.values as MatchEvent).period).toBe(2)
})
// MatchTrackerPage.test.tsx — inside the existing "ends the match and creates the next one" test, add:
expect(db.writes.find(w => w.table === 'matches' && w.op === 'insert')?.values).toMatchObject({ period: 1 })
// TeamBuilderPage.test.tsx — where the first match insert is asserted, add toMatchObject({ period: 1 })
// SessionDetailPage.test.tsx
it('shows the session format under the date', async () => {
  resetDb({ ...finishedLeague(), sessions: [{ ...session, ...PRESETS.halves }] })
  renderPage()
  expect(await screen.findByText('2 × 10 min · no goal limit · a draw stays a draw')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/utils/pitchOps.test.ts src/pages/admin` → FAIL on the new assertions.

- [ ] **Step 3: Implement** the edits listed under Files.

- [ ] **Step 4: Run the whole suite and build** — `npx vitest run && npm run build` → PASS.

- [ ] **Step 5: Commit, open PR 1, merge**

```bash
git add -A src
git commit -m "feat: new matches and events record their period; session detail shows the format"
```
PR title: "feat: per-session match format (data and settings)". Body lists the migration (already applied), the popup, and that play is unchanged. After merge and deploy, open `https://score-leader-drab.vercel.app/s/<token>` in headless Chrome (script `browser.mjs` in the job tmp dir) and confirm the page text is unchanged for the 4 Oct session.

---

# PR 2 — Periods on the pitch

### Task 5: Timer can end a period and start the next

**Files:**
- Modify: `src/hooks/useMatchTimer.ts`, `src/hooks/useMatchTimer.test.ts`
- Modify: `src/utils/matchClock.ts:25-27` (`finishedMatchFields`)

**Interfaces:**
- Produces: `useMatchTimer(match)` returns additionally `endPeriod: () => Promise<void>` and `startPeriod: (period: number) => Promise<void>`.
  - `endPeriod`: `current = computeElapsed(...)`; local state → `stopped`, `startedAt null`, `baseElapsed current`; outbox update `{ timer_status: 'stopped', timer_started_at: null, timer_elapsed_seconds: current, period_seconds: [...match.period_seconds, current] }`.
  - `startPeriod(n)`: local → `running`, `startedAt serverNowIso()`, `baseElapsed 0`; outbox update `{ period: n, timer_elapsed_seconds: 0, timer_started_at: now, timer_status: 'running', status: 'active' }`.
- `finishedMatchFields(match: Pick<Match,'period_seconds'>, elapsedSeconds: number)` now also returns `period_seconds: [...match.period_seconds, elapsedSeconds]`.

- [ ] **Step 1: Write the failing tests** (`useMatchTimer.test.ts`)

```ts
it('endPeriod freezes the clock and records the period length, also when paused', async () => {
  const { result } = renderHook(() => useMatchTimer(baseMatch({ timer_status: 'paused', timer_elapsed_seconds: 612, period_seconds: [] })))
  await act(() => result.current.endPeriod())
  expect(result.current.timerStatus).toBe('stopped'); expect(result.current.elapsed).toBe(612)
  expect(outbox.runOrQueue).toHaveBeenLastCalledWith(expect.objectContaining({ values: expect.objectContaining({ timer_status: 'stopped', timer_elapsed_seconds: 612, period_seconds: [612] }) }))
})
it('startPeriod moves to the next period with a fresh running clock at server time', async () => {
  const { result } = renderHook(() => useMatchTimer(baseMatch({ timer_status: 'stopped', timer_elapsed_seconds: 612, period_seconds: [612] })))
  await act(() => result.current.startPeriod(2))
  expect(result.current.timerStatus).toBe('running'); expect(result.current.elapsed).toBe(0)
  expect(outbox.runOrQueue).toHaveBeenLastCalledWith(expect.objectContaining({ values: expect.objectContaining({ period: 2, timer_elapsed_seconds: 0, timer_status: 'running', status: 'active' }) }))
})
// matchClock.test.ts
it('finishedMatchFields records the final period length', () =>
  expect(finishedMatchFields({ period_seconds: [600] }, 587)).toEqual({ status: 'completed', timer_status: 'stopped', timer_elapsed_seconds: 587, timer_started_at: null, period_seconds: [600, 587] }))
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/hooks/useMatchTimer.test.ts src/utils/matchClock.test.ts` → FAIL (`endPeriod` undefined).
- [ ] **Step 3: Implement** the two callbacks and the new `finishedMatchFields` signature; update its one caller in `MatchTrackerPage.tsx:250` to pass `match`.
- [ ] **Step 4: Run** `npx vitest run && npx tsc -b` → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat: timer ends a period and starts the next"`

### Task 6: Clock formatting and outcomes follow the format

**Files:**
- Modify: `src/utils/matchClock.ts` (`formatMatchClock(seconds, limitSeconds = MATCH_DURATION_SECONDS)`; keep the constants exported for the Quick default), `src/utils/matchClock.test.ts`
- Modify: `src/utils/matchOutcome.ts`, `src/utils/matchOutcome.test.ts`
- Modify: `src/components/MatchResultDialog.tsx:4,54` (take `format: MatchFormat` prop; text uses `format.goal_limit` and `format.period_minutes`; new reasons)
- Modify: `src/locales/en.json`, `ar.json` (`result.extraTime "{{team}} wins after extra time"`, `result.draw "Draw — both teams go off"`, `timeline.winsAet "{{team}} wins aet"`, `timeline.pens "pens {{a}}–{{b}}"`)

**Interfaces:**
- `OutcomeReason` adds `'extraTime' | 'draw'`; `MatchOutcome.winnerTeamId: string | null` (null for a true draw).
- `describeOutcome(params & { format: MatchFormat; totalSeconds: number; penalties?: {team1,team2} })`:
  - `is_draw && draw_resolved_by === 'penalties'` → `penalties` (as today)
  - `is_draw && winner_team_id === null` → `{ isDraw: true, winnerTeamId: null, reason: 'draw' }`
  - `is_draw && draw_resolved_by === 'late_team'` → `drawPreviousWinnerLoses` (as today)
  - `!is_draw && draw_resolved_by === 'extra_time'` → `extraTime`
  - `!is_draw`: winner score `>= format.goal_limit` (when set) → `goalLimit`; `totalSeconds >= sum of periodLength over the regular periods` → `timeUp`; else `endedEarly`.

- [ ] **Step 1: Write the failing tests**

```ts
// matchClock.test.ts
it('formatMatchClock caps at the given period length', () => { expect(formatMatchClock(650, 600)).toBe('10:00 +00:50'); expect(formatMatchClock(650)).toBe('07:00 +03:50') })
// matchOutcome.test.ts
const base = { team1_id: 'a', team2_id: 'b', team1_score: 1, team2_score: 1, is_draw: false, draw_resolved_by: null as Match['draw_resolved_by'] }
it('a true draw has no winner and reason draw', () => expect(describeOutcome({ ...base, is_draw: true, winner_team_id: null, format: PRESETS.halves, totalSeconds: 1200 })).toEqual({ isDraw: true, winnerTeamId: null, reason: 'draw' }))
it('a knockout win after extra time', () => expect(describeOutcome({ ...base, team1_score: 2, draw_resolved_by: 'extra_time', winner_team_id: 'a', format: PRESETS.knockout, totalSeconds: 1800 }).reason).toBe('extraTime'))
it('halves: full time with a leader is timeUp; the Quick goal limit does not apply', () =>
  expect(describeOutcome({ ...base, team1_score: 3, winner_team_id: 'a', format: PRESETS.halves, totalSeconds: 1200 }).reason).toBe('timeUp'))
```

- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Implement**; update `MatchResultDialog` to accept `format` and render the two new reasons; update its callers (`MatchTrackerPage.tsx:476`) to pass `session` (the tracker already has `sessionData.session` from `fetchSession`; keep it in state as `session`).
- [ ] **Step 4: Run** `npx vitest run && npx tsc -b` → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat: clock and result text follow the session format"`

### Task 7: Tracker runs the period sequence

**Files:**
- Modify: `src/pages/admin/MatchTrackerPage.tsx` (state: keep `session: Session`; replace `reachedEnd/isTimeUp/shouldEndMatch/handleEndMatch/doEndMatch` with `step = nextStep(session, match, timer.elapsed)`; clock block `:299-315`; banner `:319`; main button `:425-437`; penalty block `:398`)
- Modify: `src/pages/admin/MatchTrackerPage.test.tsx`
- Modify: `src/locales/en.json`, `ar.json`: `match.period.full "Match"`, `match.period.first "1st half"`, `match.period.second "2nd half"`, `match.period.extra1 "Extra time 1"`, `match.period.extra2 "Extra time 2"`, `match.period.penalties "Penalties"`, `match.endPeriod "End {{period}}"`, `match.startPeriod "Start {{period}}"`, `match.betweenPeriods "{{period}} finished"`, `match.goToPenalties "Go to penalties"`, `match.periodTimeUp "Time's up for the {{period}}"`, `match.drawEnd "Draw — end match"`.

**Interfaces:**
- Consumes: `nextStep`, `periodLabelKey`, `periodLength`, `totalSeconds`, `periodAfter` (Task 2); `timer.endPeriod/startPeriod` (Task 5); `describeOutcome` with `format` (Task 6); `decideResult` unchanged until Task 9 (a `draw` step in PR 2 is reachable only with `draw_rule 'draw'`, which the popup can save; until Task 9 the tracker treats `{kind:'draw'}` by ending the match with `is_draw true, winner null` **and** creating the next match with `resolveMatch` — which throws without a winner. So in this task, on `draw` the tracker ends the match and navigates to the session page without creating the next match; Task 9 replaces that.)

Rendering rules:
- Above the clock: `t(periodLabelKey(match.period, session))`; when `step.kind === 'startPeriod' | 'penalties' (from between periods) | 'draw' | 'endMatch'` after a finished period, show the between-periods card: score, `t('match.betweenPeriods', { period })`, and one button for the step.
- Clock cap: `formatMatchClock(Math.min(timer.elapsed, len), len)` with `len = periodLength(match.period, session) ?? 0`.
- Banner: `step.kind === 'endPeriod' && step.timeUp` → `t('match.periodTimeUp')` for a non-final period, today's `match.timeUp` for the final one; `endMatch goalLimit` → today's `match.goalLimitReached`.
- Main red button: `step.kind === 'endPeriod'` → when `periodAfter(session, step.period, level) === null && !level` → `t('match.endMatch')` (ends the match); otherwise `t('match.endPeriod', { period })` (calls `timer.endPeriod()`; early = `!step.timeUp` → existing confirm dialog, whose confirm action now runs the current step). Between periods: `startPeriod` → `t('match.startPeriod', { period })` → `timer.startPeriod(n)`; `penalties` → `t('match.goToPenalties')` → `setPenaltyMode(true)`; `endMatch` → `t('match.endMatch')`; `draw` → `t('match.drawEnd')`.
- `handlePenaltyDecide` saves `penalties_team1/2` in the update.
- `finishMatch` passes `totalSeconds(match, timer.elapsed)` and `session` to `describeOutcome`.

- [ ] **Step 1: Write the failing tests** (`MatchTrackerPage.test.tsx`; its `beforeEach` seeds a Quick session; add a helper `seed(format)` that resets the db with `{ ...session, status: 'active', ...format }`)

```ts
it('a single-period session still shows End match, never End 1st half', async () => {
  renderPage(); await screen.findByText('Green Team')
  expect(screen.getByRole('button', { name: 'End match' })).toBeInTheDocument()
  expect(screen.queryByText(/half/)).toBeNull()
})
it('halves: End 1st half freezes the clock, shows the break, Start 2nd half resumes at 00:00', async () => {
  seed(PRESETS.halves); renderPage()
  await user.click(await screen.findByRole('button', { name: '▶ Start' }))
  await user.click(screen.getByRole('button', { name: 'End 1st half' }))
  await user.click(screen.getByRole('button', { name: 'Confirm' }))        // early end confirmation
  expect(await screen.findByText('1st half finished')).toBeInTheDocument()
  expect(m1()).toMatchObject({ timer_status: 'stopped', period_seconds: [expect.any(Number)] })
  await user.click(screen.getByRole('button', { name: 'Start 2nd half' }))
  await waitFor(() => expect(m1()).toMatchObject({ period: 2, timer_status: 'running', timer_elapsed_seconds: 0 }))
  expect(screen.getByText('2nd half')).toBeInTheDocument()
})
it('reloading between periods shows the break screen, not a fresh start', async () => {
  seed(PRESETS.halves); rows('matches')[0] = match('m1', { period: 1, period_seconds: [600], timer_status: 'stopped', timer_elapsed_seconds: 600, status: 'active' })
  renderPage()
  expect(await screen.findByRole('button', { name: 'Start 2nd half' })).toBeInTheDocument()
})
it('knockout: level after 2nd half offers extra time; level after ET2 goes to penalties and saves the score', async () => {
  seed(PRESETS.knockout); rows('matches')[0] = match('m1', { period: 2, period_seconds: [600, 600], timer_status: 'stopped', status: 'active' })
  renderPage()
  await user.click(await screen.findByRole('button', { name: 'Start Extra time 1' }))
  // … end ET1, start ET2, end ET2 via the same buttons, then:
  await user.click(screen.getByRole('button', { name: 'Go to penalties' }))
  await user.click(screen.getAllByRole('button', { name: '+' })[0]); await user.click(screen.getByRole('button', { name: /Confirm penalties/ }))
  await waitFor(() => expect(m1()).toMatchObject({ status: 'completed', draw_resolved_by: 'penalties', penalties_team1: 1, penalties_team2: 0 }))
})
it('knockout: a leader after extra time ends the match as extra_time', async () => {
  seed(PRESETS.knockout); rows('matches')[0] = match('m1', { period: 4, period_seconds: [600,600,300], timer_status: 'running', team1_score: 1, status: 'active' })
  renderPage(); await user.click(await screen.findByRole('button', { name: 'End match' })); await user.click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(m1()).toMatchObject({ status: 'completed', is_draw: false, draw_resolved_by: 'extra_time', winner_team_id: 'tg' }))
})
```

(Button names come from the locale strings above; `'▶ Start'`, `'Confirm'` and the penalty confirm label already exist in the file's tests — reuse their exact text.)

- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Implement** per the rendering rules.
- [ ] **Step 4: Run** `npx vitest run && npm run build` → PASS (all pre-existing tracker tests must still pass unchanged: Quick behaviour).
- [ ] **Step 5: Commit** — `git commit -am "feat: match tracker plays halves, extra time and penalties"`

### Task 8: Live page, match lists and Home show periods and shoot-outs

**Files:**
- Modify: `src/pages/public/LiveSessionPage.tsx:56-67,88-101` (cap by `periodLength(match.period, session)`; under the clock: `t(periodLabelKey(...))`, and `t('live.halfTime')` when `timer_status === 'stopped' && period_seconds.length >= period && status !== 'completed'`)
- Modify: `src/components/SessionMatchList.tsx:32-37` (`resultLabel`: pens → `timeline.winsPens` + ` · ` + `t('timeline.pens', { a: m.penalties_team1, b: m.penalties_team2 })` when scores saved; `extra_time` → `timeline.winsAet`; true draw → `timeline.draw`)
- Modify: `src/components/MatchTimeline.tsx` (new optional prop `periods?: boolean`; when true, prefix each entry with `t('timeline.periodShort.' + e.period)` → keys `1 "1H"`, `2 "2H"`, `3 "ET1"`, `4 "ET2"`, `5 "P"`); `SessionMatchList` and `LiveSessionPage` pass `periods={session.period_count > 1 || !!session.extra_time_minutes}`
- Modify: `src/pages/admin/HomePage.tsx:206` (`formatMatchClock(matchElapsed(match, now), periodLength(match.period, session) ?? MATCH_DURATION_SECONDS)`; the Home query already returns the open sessions' columns via `select('id, status, matches(*), teams(*), session_players(count)')` — add the six format columns to that select)
- Locale: `live.halfTime "Half-time"`, `timeline.periodShort.*`
- Tests: `LiveSessionPage.test.tsx`, `SessionMatchList.test.tsx`, `HomePage.test.tsx`

- [ ] **Step 1: Write the failing tests**

```ts
// LiveSessionPage.test.tsx
it('shows the period under the clock and Half-time between periods', async () => {
  const league = finishedLeague()
  resetDb({ ...league, sessions: [{ ...session, status: 'active', ...PRESETS.halves }], matches: [...league.matches, match('m3', { match_number: 3, status: 'active', period: 1, period_seconds: [600], timer_status: 'stopped', timer_elapsed_seconds: 600 })] })
  renderPage()
  expect(await screen.findByText('Half-time')).toBeInTheDocument()
})
it('a finished shoot-out shows the penalty score', async () => {
  const league = finishedLeague()
  resetDb({ ...league, matches: [match('m1', { status: 'completed', is_draw: true, draw_resolved_by: 'penalties', winner_team_id: 'tg', penalties_team1: 4, penalties_team2: 3 })] })
  renderPage()
  expect(await screen.findByText(/pens 4–3/)).toBeInTheDocument()
})
// SessionMatchList.test.tsx
it('labels: aet win, penalties with score, true draw', () => { /* three matches → 'Green Team wins aet', /wins on penalties · pens 4–3/, 'Draw' */ })
// HomePage.test.tsx — in 'a running match: score, clock and resume', give the session PRESETS.halves and timer_elapsed_seconds 650 → expect '10:00' and '+00:50'
```

- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run && npm run build` → PASS.
- [ ] **Step 5: Commit, open PR 2, merge**

```bash
git commit -am "feat: live page, match lists and Home show periods, half-time and shoot-out scores"
```
PR title: "feat: periods, extra time and penalties on the pitch". After deploy: headless Chrome on the 4 Oct live link → page text identical to before (it is a Quick session).

---

# PR 3 — Draw rule in the rotation

### Task 9: `decideResult` and `resolveMatch` know the draw rule

**Files:**
- Modify: `src/utils/matchRotation.ts:18-25,35-43,62-70`, `src/utils/matchRotation.test.ts`
- Modify: `src/pages/admin/MatchTrackerPage.tsx` (`draw` step → `finishMatch(decideResult(match, session))`, which now returns the true-draw fields; `finishMatch` no longer requires a winner; `resolveMatch(completedMatch)` handles the draw)
- Modify: `src/components/MatchResultDialog.tsx` (true draw: title `t('result.draw')`, next teams from `next`)
- Modify: `src/utils/sessionSummary.ts:37-60` (match lines use the same labels as `SessionMatchList`: "2–2 (draw)", "1–1, pens 4–3", "2–1 aet" via `t('summary.pens')`, `t('summary.aet')`, `t('summary.draw')`)
- Modify: `src/pages/admin/HistoryPage.tsx` / `SessionDetailPage.tsx:346` if they print results (use the same helper: extract `resultLabel(m, teamName, t)` from `SessionMatchList` into `src/utils/resultLabel.ts` and use it in all three)

**Interfaces:**
- `decideResult(params: Pick<Match,'team1_score'|'team2_score'|'match_number'|'team1_id'|'team2_id'>, format: Pick<MatchFormat,'penalties'|'draw_rule'>)`:
  - scores differ → as today.
  - level and `format.penalties` → `{ is_draw: true, draw_resolved_by: null, winner_team_id: null }` (the tracker goes to the shoot-out; it already does for match 1 — generalise: the tracker enters penalty mode whenever `decideResult` returns a draw with no winner **and** `format.penalties`, or `draw_rule === 'stay' && match_number === 1`).
  - level, no penalties, `draw_rule 'stay'`: match 1 → draw with no winner (shoot-out, as today); later → `late_team` (as today).
  - level, no penalties, `draw_rule 'draw'` → `{ is_draw: true, draw_resolved_by: null, winner_team_id: null }` and the tracker ends the match as a draw (no shoot-out).
  - To let the tracker tell "shoot-out" from "draw stands", add `export function drawGoesToPenalties(format, matchNumber): boolean` = `format.penalties || (format.draw_rule === 'stay' && matchNumber === 1)`.
- `resolveMatch(match)`: when `is_draw && winner_team_id === null` (true draw): `waiting = waitingQueue(match)`; if `waiting.length === 0` → same two teams, queue `[]`; if `waiting.length === 1` → `{ team1Id: waiting[0], team2Id: match.team1_id, queue: [match.team2_id] }` (one comes on, the other draws' team waits); else → `{ team1Id: waiting[0], team2Id: waiting[1], queue: [...waiting.slice(2), match.team1_id, match.team2_id] }`. No longer throws.

- [ ] **Step 1: Write the failing tests** (`matchRotation.test.ts`)

```ts
const level = { team1_score: 1, team2_score: 1, team1_id: 'a', team2_id: 'b' }
it('stay, match 1, no penalties → shoot-out (no winner yet)', () => expect(decideResult({ ...level, match_number: 1 }, { penalties: false, draw_rule: 'stay' })).toEqual({ is_draw: true, draw_resolved_by: null, winner_team_id: null }))
it('stay, later match → team already on loses', () => expect(decideResult({ ...level, match_number: 3 }, { penalties: false, draw_rule: 'stay' })).toEqual({ is_draw: true, draw_resolved_by: 'late_team', winner_team_id: 'b' }))
it('draw rule → a true draw, any match number', () => expect(decideResult({ ...level, match_number: 3 }, { penalties: false, draw_rule: 'draw' })).toEqual({ is_draw: true, draw_resolved_by: null, winner_team_id: null }))
it('penalties on → shoot-out, whatever the draw rule', () => expect(drawGoesToPenalties({ penalties: true, draw_rule: 'draw' }, 4)).toBe(true))
it('draw rule without penalties never goes to a shoot-out', () => expect(drawGoesToPenalties({ penalties: false, draw_rule: 'draw' }, 1)).toBe(false))
describe('resolveMatch after a true draw', () => {
  const drawn = (queue: string[]) => ({ ...match('m', { team1_id: 'a', team2_id: 'b', queue, waiting_team_id: queue[0] ?? null, is_draw: true, winner_team_id: null }) })
  it('2 teams: the same two play again', () => expect(resolveMatch(drawn([]))).toEqual({ team1Id: 'a', team2Id: 'b', queue: [] }))
  it('3 teams: the waiting team comes on against team1; team2 waits', () => expect(resolveMatch(drawn(['c']))).toEqual({ team1Id: 'c', team2Id: 'a', queue: ['b'] }))
  it('4+ teams: the next two come on; both drawn teams join the back in order', () => expect(resolveMatch(drawn(['c', 'd']))).toEqual({ team1Id: 'c', team2Id: 'd', queue: ['a', 'b'] }))
})
```

(With exactly 3 teams "both go off" is impossible, so the spec's rule degrades to: the waiting team comes on, and the team that was on longer, `team1`, stays — matching the `stay` spirit; record this in the test name and the code comment.)

- [ ] **Step 2: Run to verify failure** → FAIL (`decideResult` ignores the second argument; `resolveMatch` throws).
- [ ] **Step 3: Implement** the rotation changes, the tracker's `draw` handling (penalty mode only when `drawGoesToPenalties`), the result dialog's draw title, the shared `resultLabel`, and the summary text.
- [ ] **Step 4: Tracker tests** — add to `MatchTrackerPage.test.tsx`:

```ts
it('halves with 2 teams: a level match ends as a draw and the same two play again', async () => {
  seed({ ...PRESETS.halves, team_count: 2 }); rows('teams').splice(2); rows('matches')[0] = match('m1', { period: 2, period_seconds: [600, 600], timer_status: 'stopped', status: 'active', queue: [], waiting_team_id: null })
  renderPage(); await user.click(await screen.findByRole('button', { name: 'Draw — end match' }))
  await waitFor(() => expect(m1()).toMatchObject({ status: 'completed', is_draw: true, winner_team_id: null }))
  expect(db.writes.find(w => w.table === 'matches' && w.op === 'insert')?.values).toMatchObject({ team1_id: 'tg', team2_id: 'tb', match_number: 2, period: 1 })
})
```

- [ ] **Step 5: Run** `npx vitest run && npm run build` → PASS.
- [ ] **Step 6: Commit, open PR 3, merge**

```bash
git add -A src
git commit -m "feat: a draw can stand — rotation, result dialog and summaries follow the draw rule"
```
PR title: "feat: draw rule in the rotation". After deploy: repeat the headless-Chrome check on the 4 Oct live link (text unchanged) and run the leaderboard/records comparison (`measure-league.mjs` row counts unchanged).

---

## Self-review notes

- Spec §2 → Tasks 1–2 (columns, defaults, trigger, types). §3 → Tasks 2, 5, 6, 7. §4 → Task 9. §5 → Tasks 3, 4, 7, 8, 9. §6 → each task's Step 1. §7 → the three PR boundaries.
- Names used across tasks: `nextStep`, `periodAfter`, `periodLength`, `periodLabelKey`, `totalSeconds`, `PRESETS`, `DEFAULT_FORMAT`, `presetName`, `MatchFormat` (Task 2) are the ones Tasks 3–9 consume; `endPeriod`/`startPeriod` (Task 5) in Task 7; `drawGoesToPenalties` (Task 9) in Task 9 only.
- Spec gap closed here: with exactly three teams a true draw cannot send both teams off; the plan defines the fallback (waiting team comes on against team1) and pins it with a test. If the admin prefers "team2 stays" instead, it is a one-line change in `resolveMatch`.
