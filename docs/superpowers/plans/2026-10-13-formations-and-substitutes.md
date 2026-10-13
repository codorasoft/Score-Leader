# Formations and Substitutes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the Coach Board the admin picks a suggested formation or builds one, the players on the pitch line up in it, and substitutes sit beside the pitch ready to swap in.

**Architecture:** Pure functions in `src/utils/formation.ts` turn a formation into spots and decide who takes which; `src/utils/board.ts` learns about the bench. Three small components (formation dialog, bench column, swap dialog) and the picker moved out of the page are wired into `LineupEditorPage`. In the editor a substitute stays in the same `board` / `guests` lists as everyone else; an ordered `bench: string[]` of ids says who is off the pitch. One additive migration stores the formation's name and each substitute's place.

**Tech Stack:** React 19 + TypeScript, Vitest + Testing Library with the in-memory Supabase fake (`src/test/fakeSupabase.ts`), i18next (`src/locales/en.json`, `ar.json`), Tailwind 4, Supabase Postgres.

**Spec:** `docs/superpowers/specs/2026-10-13-formations-and-substitutes-design.md`

## Global Constraints

- Work on branch `feat/formations` in `E:\Score-Leader\.claude\worktrees\formations`; never commit to `main`. The user has asked for the work to be pushed, merged by pull request, and released.
- Before Task 1: `npm ci`; copy the git-ignored `E:\Score-Leader\.env` into the worktree and `E:\Score-Leader\supabase\.temp` into its `supabase/`.
- The goalkeeper is never written: a formation fits *n* players on the pitch when its numbers add up to *n* − 1. One to five lines, each of one to six. Formations exist for 2 to 11 on the pitch; players and guests both count.
- The stored formation matches `^[1-6](-[1-6]){0,4}$`.
- Every new user-visible string is in both locale files with the copy in the "Copy" section; English is exact (tests assert it).
- `src/locales/en.json` and `ar.json` have CRLF endings and must not be touched with the Edit tool. Add keys with a small Python script in the job's tmp folder that reads and writes bytes and ends new lines with `\r\n`; `git diff --numstat` must then show added lines only.
- Scripts with loops, heredocs or `$(...)` go in a file in the job's tmp folder and are run as one plain command.
- Dialogs follow `src/components/TodayDialog.tsx`: `role="dialog"`, `aria-modal`, `aria-labelledby` its heading, Escape closes, a tap outside closes, Tab stays inside.
- Names of people carry `dir="auto"`.
- Each task ends green on `npx vitest run <its test files>`; Task 9 runs the whole suite and the build.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A saved formation that no longer fits** (a player was deleted from the league since, so ten are on the pitch under a saved 4-4-2): the board opens with no formation shown, not a wrong one. Pinned in Task 7.
2. **Damaged stored values:** a `formation` that is not a formation, a guest's `bench` of −1, 1.5 or `"2"`, the same bench number on a player and a guest. Each opens as a sane board. Pinned in Tasks 2 and 4.
3. **Two quick taps in the swap dialog:** the second does nothing; nobody is on the pitch and the bench at once. Pinned in Task 4.
4. **A player made inactive after being benched** still shows among the substitutes and is still written on save (a row left out of the save is deleted). Pinned in Task 7.
5. **Many substitutes:** nine in the shared image start a second column instead of running off the bottom. Pinned in Task 8.

---

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261013000003_lineup_formations.sql` | `lineups.formation`, `lineup_players.bench_order` |
| `supabase/tests/tenancy.test.sql` | the two columns' rules |
| `src/utils/formation.ts` | formations: parsing, suggestions, spots, who goes where |
| `src/utils/board.ts` | the bench: guests' `bench`, order, saving, swapping |
| `src/components/FormationDiagram.tsx` | a small pitch with a dot for each spot |
| `src/components/FormationDialog.tsx` | suggestions and the builder |
| `src/components/PlayerPicker.tsx` | the picker, moved out of the page |
| `src/components/BenchColumn.tsx` | the substitutes beside the pitch |
| `src/components/BenchSwapDialog.tsx` | swap, put on the pitch, remove |
| `src/pages/admin/LineupEditorPage.tsx` | wiring, loading, saving |
| `src/lib/shareImage.ts` | the substitutes column in `drawBoardImage` |
| `src/locales/en.json`, `src/locales/ar.json` | copy |

## Copy

Two new top-level blocks, `formation` and `bench`, placed after `lineups` in both files. Task 5 adds both blocks whole.

| Key | English | Arabic |
|---|---|---|
| `formation.button` | Formation | التشكيلة |
| `formation.buttonNamed` | Formation: {{name}} | التشكيلة: {{name}} |
| `formation.tooFew` | Add at least 2 players to choose a formation. | أضف لاعبَين على الأقل لاختيار تشكيلة. |
| `formation.tooMany` | A formation takes up to 11 players. Move the others to the substitutes. | التشكيلة تتسع لـ 11 لاعباً على الأكثر. انقل الباقين إلى البدلاء. |
| `formation.title` | Formation | التشكيلة |
| `formation.forCount` | {{players}} players: the goalkeeper and {{rest}} more. | عدد اللاعبين {{players}}: حارس المرمى و{{rest}} غيره. |
| `formation.suggested` | Suggested | مقترحة |
| `formation.custom` | Build your own | ابنِ تشكيلتك |
| `formation.fromDefence` | From the defence forward | من الدفاع إلى الهجوم |
| `formation.line` | Line {{number}} | الخط {{number}} |
| `formation.fewer` | One fewer in line {{number}} | لاعب أقل في الخط {{number}} |
| `formation.more` | One more in line {{number}} | لاعب إضافي في الخط {{number}} |
| `formation.addLine` | Add a line | أضف خطاً |
| `formation.removeLine` | Remove line {{number}} | احذف الخط {{number}} |
| `formation.left_one` | 1 player left to place | بقي لاعب واحد بلا مكان |
| `formation.left_other` | {{count}} players left to place | بقي {{count}} لاعب بلا مكان |
| `formation.left_zero` / `_two` / `_few` / `_many` (Arabic only) | | بقي {{count}} لاعب بلا مكان / بقي لاعبان بلا مكان / بقي {{count}} لاعبين بلا مكان / بقي {{count}} لاعباً بلا مكان |
| `formation.allPlaced` | All players placed | كل اللاعبين في أماكنهم |
| `formation.over_one` | 1 player too many | لاعب واحد زائد |
| `formation.over_other` | {{count}} players too many | {{count}} لاعب زائد |
| `formation.over_zero` / `_two` / `_few` / `_many` (Arabic only) | | {{count}} لاعب زائد / لاعبان زائدان / {{count}} لاعبين زائدين / {{count}} لاعباً زائداً |
| `formation.apply` | Apply | تطبيق |
| `bench.add` | Add substitutes | أضف بدلاء |
| `bench.title` | Subs | البدلاء |
| `bench.label` | Substitutes | البدلاء |
| `bench.player` | Substitute: {{name}} | بديل: {{name}} |
| `bench.toBench` | Move {{name}} to substitutes | انقل {{name}} إلى البدلاء |
| `bench.swapTitle` | Swap {{name}} | تبديل {{name}} |
| `bench.swapHint` | Choose who comes off. | اختر من يخرج. |
| `bench.nobody` | Nobody is on the pitch yet. | لا يوجد لاعبون في الملعب بعد. |
| `bench.putOn` | Put on the pitch | أنزله إلى الملعب |
| `bench.count_one` | 1 substitute | بديل واحد |
| `bench.count_other` | {{count}} substitutes | {{count}} بديل |
| `bench.count_zero` / `_two` / `_few` / `_many` (Arabic only) | | {{count}} بديل / بديلان / {{count}} بدلاء / {{count}} بديلاً |

"Remove" and "Cancel" reuse `common.remove` and `common.cancel`.

---

### Task 1: The database columns

**Files:**
- Create: `supabase/migrations/20261013000003_lineup_formations.sql`
- Modify: `supabase/tests/tenancy.test.sql` (in the "Coach board" section, after the `lineup_players` insert, while still acting as admin A)

**Interfaces:**
- Produces: `lineups.formation text NULL` and `lineup_players.bench_order smallint NULL`.

- [ ] **Step 1: Add the checks to `tenancy.test.sql`** using the file's own helpers

```sql
-- A board's formation and its substitutes
SELECT pg_temp.expect_count(
  $sql$UPDATE public.lineups SET formation = '4-3-2-1' WHERE id = 'aaaaaaaa-0000-4000-8000-000000000012'$sql$, 1);
SELECT pg_temp.expect_error(
  $sql$UPDATE public.lineups SET formation = '4-4-7' WHERE id = 'aaaaaaaa-0000-4000-8000-000000000012'$sql$, 'lineups_formation_check');
SELECT pg_temp.expect_error(
  $sql$UPDATE public.lineups SET formation = '1-1-1-1-1-1' WHERE id = 'aaaaaaaa-0000-4000-8000-000000000012'$sql$, 'lineups_formation_check');
SELECT pg_temp.expect_count(
  $sql$UPDATE public.lineup_players SET bench_order = 0 WHERE lineup_id = 'aaaaaaaa-0000-4000-8000-000000000012'$sql$, 1);
SELECT pg_temp.expect_error(
  $sql$UPDATE public.lineup_players SET bench_order = -1 WHERE lineup_id = 'aaaaaaaa-0000-4000-8000-000000000012'$sql$, 'lineup_players_bench_order_check');
```

- [ ] **Step 2: Write the migration.** Both columns with `ADD COLUMN IF NOT EXISTS`, no default, nullable. Constraints named `lineups_formation_check` (`formation ~ '^[1-6](-[1-6]){0,4}$'`) and `lineup_players_bench_order_check` (`bench_order >= 0`). A comment on each column says what empty means.

- [ ] **Step 3: Rehearse.** Run: `bash scripts/rehearse.sh` (with `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` from `E:\Score-Leader\.env.zurich.local`). Expected: `TENANCY TESTS PASSED`. Nothing is kept on the live database.

- [ ] **Step 4: Commit** — `feat: a board's formation and its substitutes' places (database)`

---

### Task 2: A formation's shape

**Files:**
- Create: `src/utils/formation.ts`
- Test: `src/utils/formation.test.ts`

**Interfaces:**
- Consumes: `BoardSpot` from `src/utils/board.ts`; `PlayerPosition` from `src/lib/types.ts`.
- Produces:
  ```ts
  export const MAX_LINES = 5
  export const MAX_IN_LINE = 6
  export const MIN_ON_PITCH = 2
  export const MAX_ON_PITCH = 11
  // "4-3-2-1" -> [4, 3, 2, 1]; null for anything that is not one to five lines of one to six
  export function parseFormation(name: unknown): number[] | null
  export function formationName(lines: number[]): string
  // Valid lines that add up to everyone on the pitch but the goalkeeper
  export function fitsPitch(lines: number[], onPitch: number): boolean
  // The table of spec section 2.2, in its order; [] outside 2..11
  export function suggestedFormations(onPitch: number): string[]
  export interface FormationSpot extends BoardSpot { role: PlayerPosition }
  // The goalkeeper first, then each line from the defence forward, each from left to right
  export function formationSpots(lines: number[]): FormationSpot[]
  ```

- [ ] **Step 1: Write the failing tests**

```ts
describe('parseFormation', () => {
  it('reads the lines from the defence forward', () => {
    expect(parseFormation('4-3-2-1')).toEqual([4, 3, 2, 1])
    expect(parseFormation('1')).toEqual([1])
    expect(formationName([4, 4, 2])).toBe('4-4-2')
  })
  it('refuses what is not a formation', () => {
    for (const bad of ['', '4-4-7', '4-0-2', '1-1-1-1-1-1', '4--2', '4-4-2-', 'abc', ' 4-4-2', '10', null, undefined, 442]) {
      expect(parseFormation(bad)).toBeNull()
    }
  })
})

describe('fitsPitch', () => {
  it('needs the lines to add up to everyone but the goalkeeper', () => {
    expect(fitsPitch([4, 4, 2], 11)).toBe(true)
    expect(fitsPitch([4, 4, 2], 10)).toBe(false)
    expect(fitsPitch([1], 2)).toBe(true)
    expect(fitsPitch([], 1)).toBe(false)
    expect(fitsPitch([6, 6], 13)).toBe(false)
  })
})

describe('suggestedFormations', () => {
  it('offers only formations that fit the number on the pitch', () => {
    for (let n = MIN_ON_PITCH; n <= MAX_ON_PITCH; n++) {
      const names = suggestedFormations(n)
      expect(names.length).toBeGreaterThan(0)
      expect(new Set(names).size).toBe(names.length)
      for (const name of names) expect(fitsPitch(parseFormation(name)!, n)).toBe(true)
    }
  })
  it('is the table of the spec', () => {
    expect(suggestedFormations(5)).toEqual(['2-2', '1-2-1', '2-1-1', '1-1-2'])
    expect(suggestedFormations(7)).toEqual(['2-3-1', '3-2-1', '3-1-2', '2-2-2'])
    expect(suggestedFormations(11)).toEqual(['4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '4-3-2-1', '5-3-2', '3-4-3', '4-1-4-1'])
  })
  it('has nothing for one player or for twelve', () => {
    expect(suggestedFormations(1)).toEqual([])
    expect(suggestedFormations(12)).toEqual([])
  })
})

describe('formationSpots', () => {
  it('puts the keeper in goal and spreads the lines up the pitch', () => {
    expect(formationSpots([4, 4, 2])).toEqual([
      { x: 0.5, y: 0.92, role: 'GK' },
      { x: 0.185, y: 0.74, role: 'DEF' }, { x: 0.395, y: 0.74, role: 'DEF' }, { x: 0.605, y: 0.74, role: 'DEF' }, { x: 0.815, y: 0.74, role: 'DEF' },
      { x: 0.185, y: 0.47, role: 'MID' }, { x: 0.395, y: 0.47, role: 'MID' }, { x: 0.605, y: 0.47, role: 'MID' }, { x: 0.815, y: 0.47, role: 'MID' },
      { x: 0.29, y: 0.2, role: 'ATT' }, { x: 0.71, y: 0.2, role: 'ATT' },
    ])
  })
  it('with two lines has a defence and an attack; with one, a midfield in the middle', () => {
    expect(formationSpots([2, 2]).map((s) => [s.y, s.role])).toEqual([[0.92, 'GK'], [0.74, 'DEF'], [0.74, 'DEF'], [0.2, 'ATT'], [0.2, 'ATT']])
    expect(formationSpots([1])).toEqual([{ x: 0.5, y: 0.92, role: 'GK' }, { x: 0.5, y: 0.47, role: 'MID' }])
  })
  it('calls every line between the first and the last midfield', () => {
    expect(formationSpots([4, 2, 3, 1]).map((s) => s.role).join(' ')).toBe('GK DEF DEF DEF DEF MID MID MID MID MID ATT')
    expect(formationSpots([4, 2, 3, 1]).filter((s) => s.role === 'MID').map((s) => s.y)).toEqual([0.56, 0.56, 0.38, 0.38, 0.38])
  })
})
```

- [ ] **Step 2: Run** `npx vitest run src/utils/formation.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 3: Implement the five functions.** Values the spec fixes: keeper at (0.5, 0.92); line *i* of *k* at y = 0.74 − *i* × 0.54 / (*k* − 1), a single line at 0.47; player *j* of *n* at x = 0.08 + 0.84 × (*j* + 0.5) / *n*; all rounded to four places. `parseFormation` tests the string against `^[1-6](-[1-6]){0,4}$`.

- [ ] **Step 4: Run** the same command — Expected: PASS.

- [ ] **Step 5: Commit** — `feat: formations as lines of players, the suggestions for each team size, and their spots`

---

### Task 3: Who takes which spot

**Files:**
- Modify: `src/utils/formation.ts`
- Test: `src/utils/formation.test.ts`

**Interfaces:**
- Consumes: `formationSpots`, `fitsPitch` (Task 2).
- Produces:
  ```ts
  // position is null for a guest; x and y are where they stand now
  export interface FormationPlayer { id: string; position: PlayerPosition | null; x: number; y: number }
  // One entry for every player, in the order of formationSpots; [] when the formation does not fit their number
  export function assignToFormation(lines: number[], players: FormationPlayer[]): { id: string; x: number; y: number }[]
  ```

- [ ] **Step 1: Write the failing tests**

```ts
describe('assignToFormation', () => {
  const p = (id: string, position: FormationPlayer['position'], x = 0.5, y = 0.5): FormationPlayer => ({ id, position, x, y })
  const where = (lines: number[], players: FormationPlayer[]) =>
    Object.fromEntries(assignToFormation(lines, players).map((a) => [a.id, [a.x, a.y]]))

  it('puts the keeper in goal and each line takes its own role', () => {
    const at = where([2, 1, 1], [p('att', 'ATT'), p('mid', 'MID'), p('d1', 'DEF', 0.2), p('gk', 'GK'), p('d2', 'DEF', 0.8)])
    expect(at).toEqual({ gk: [0.5, 0.92], d1: [0.29, 0.74], d2: [0.71, 0.74], mid: [0.5, 0.47], att: [0.5, 0.2] })
  })
  it('keeps the order players stand in from left to right inside a line', () => {
    const at = where([3], [p('gk', 'GK'), p('right', 'MID', 0.9), p('left', 'MID', 0.1), p('centre', 'MID', 0.5)])
    expect([at.left[0], at.centre[0], at.right[0]]).toEqual([0.22, 0.5, 0.78])
  })
  it('spills spare defenders into midfield before the attack', () => {
    const at = where([1, 1, 1], [p('gk', 'GK'), p('d1', 'DEF', 0.5, 0.9), p('d2', 'DEF', 0.5, 0.8), p('att', 'ATT')])
    expect(at.d1[1]).toBe(0.74)
    expect(at.d2[1]).toBe(0.47)
    expect(at.att[1]).toBe(0.2)
  })
  it('with two keepers, the one nearer the bottom goal keeps goal', () => {
    const at = where([1], [p('high', 'GK', 0.5, 0.3), p('low', 'GK', 0.5, 0.8)])
    expect(at).toEqual({ low: [0.5, 0.92], high: [0.5, 0.47] })
  })
  it('with no keeper, whoever is left over keeps goal', () => {
    const at = where([2, 2], [p('d1', 'DEF', 0.1), p('d2', 'DEF', 0.9), p('mid', 'MID'), p('a1', 'ATT', 0.1), p('a2', 'ATT', 0.9)])
    expect(at.mid).toEqual([0.5, 0.92])
  })
  it('places guests last, in what is left', () => {
    const at = where([1, 1], [p('guest', null), p('att', 'ATT'), p('gk', 'GK')])
    expect(at).toEqual({ gk: [0.5, 0.92], guest: [0.5, 0.74], att: [0.5, 0.2] })
  })
  it('gives the same answer for the same players', () => {
    const players = [p('a', 'MID', 0.3, 0.4), p('b', 'MID', 0.3, 0.4), p('c', null), p('d', 'DEF'), p('e', 'ATT')]
    expect(assignToFormation([2, 2], players)).toEqual(assignToFormation([2, 2], players))
    expect(assignToFormation([2, 2], players)).toHaveLength(5)
  })
  it('places nobody when the formation does not fit their number', () => {
    expect(assignToFormation([4, 4, 2], [p('a', 'GK'), p('b', 'DEF')])).toEqual([])
  })
})
```

- [ ] **Step 2: Run** `npx vitest run src/utils/formation.test.ts` — Expected: FAIL, `assignToFormation` is not exported.

- [ ] **Step 3: Implement `assignToFormation`** with this algorithm (the tests do not determine it alone):

  1. Return `[]` unless `fitsPitch(lines, players.length)`.
  2. Order the players from the back of the pitch forward: larger `y` first, and for the same `y` the order given. Every "first" below means first in this order.
  3. The goalkeeper's spot takes the first player whose position is `GK`.
  4. Each line, from the defence forward, takes the first unplaced players whose position is its role, until it is full.
  5. Each spot still empty, in the order of `formationSpots`, takes the unplaced player whose position is nearest its role, counting `GK` 0, `DEF` 1, `MID` 2, `ATT` 3; a guest is further than any position; equal distances go to the first.
  6. Inside each line, the players it took are handed its spots from left to right in the order of their current `x` (equal `x`, the order of step 2).

- [ ] **Step 4: Run** the same command — Expected: PASS.

- [ ] **Step 5: Commit** — `feat: players take a formation's spots by position, keeping their side of the pitch`

---

### Task 4: The bench in the board's data

**Files:**
- Modify: `src/utils/board.ts`
- Test: `src/utils/board.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Guest { id: string; name: string; x: number; y: number; bench?: number }
  // parseGuests keeps `bench` only when it is a whole number from 0; otherwise the guest is on the pitch
  // The substitutes' ids in order: by number, a player before a guest on the same number, then as given
  export function benchOrder(players: { id: string; bench: number | null }[], guests: Guest[]): string[]
  // bench_order is the player's place in `bench`, or null on the pitch
  export function lineupChanges(lineupId: string, savedPlayerIds: string[], current: BoardPlayer[], bench?: string[]):
    { remove: string[]; upsert: { lineup_id: string; player_id: string; x: number; y: number; bench_order: number | null }[] }
  // The guests as stored: `bench` set to the place in `bench`, and absent on the pitch
  export function guestsForSaving(guests: Guest[], bench: string[]): Guest[]
  export interface Placed { id: string; x: number; y: number }
  // The substitute takes the starter's spot and the starter takes the substitute's place on the bench.
  // null when the substitute is not on the bench, or the starter is on it or not on the board.
  export function swapWithSubstitute(bench: string[], everyone: Placed[], subId: string, starterId: string): { bench: string[]; move: Placed } | null
  ```

- [ ] **Step 1: Write the failing tests** (and add `bench_order: null` to both rows of the existing `lineupChanges` expectation)

```ts
describe('the bench', () => {
  it('keeps a guest on the bench, and puts one with a damaged place back on the pitch', () => {
    const raw = [
      { id: 'a', name: 'A', x: 0.1, y: 0.1, bench: 2 },
      { id: 'b', name: 'B', x: 0.1, y: 0.1, bench: -1 },
      { id: 'c', name: 'C', x: 0.1, y: 0.1, bench: 1.5 },
      { id: 'd', name: 'D', x: 0.1, y: 0.1, bench: '2' },
    ]
    expect(parseGuests(raw)).toEqual([
      { id: 'a', name: 'A', x: 0.1, y: 0.1, bench: 2 },
      { id: 'b', name: 'B', x: 0.1, y: 0.1 },
      { id: 'c', name: 'C', x: 0.1, y: 0.1 },
      { id: 'd', name: 'D', x: 0.1, y: 0.1 },
    ])
  })
  it('orders players and guests together, a player first on the same number', () => {
    const guests = [{ id: 'g0', name: 'G', x: 0, y: 0, bench: 0 }, { id: 'gp', name: 'P', x: 0, y: 0 }, { id: 'g1', name: 'H', x: 0, y: 0, bench: 1 }]
    expect(benchOrder([{ id: 'p1', bench: 1 }, { id: 'on', bench: null }, { id: 'p3', bench: 3 }], guests)).toEqual(['g0', 'p1', 'g1', 'p3'])
  })
  it('saves each player with a place on the bench, or none', () => {
    const { upsert } = lineupChanges('L1', [], [{ playerId: 'ali', x: 0.5, y: 0.5 }, { playerId: 'hadi', x: 0.2, y: 0.8 }], ['guest', 'hadi'])
    expect(upsert).toEqual([
      { lineup_id: 'L1', player_id: 'ali', x: 0.5, y: 0.5, bench_order: null },
      { lineup_id: 'L1', player_id: 'hadi', x: 0.2, y: 0.8, bench_order: 1 },
    ])
  })
  it('saves a guest with a place on the bench, and without one on the pitch', () => {
    const guests = [{ id: 'g', name: 'G', x: 0, y: 0 }, { id: 'h', name: 'H', x: 0, y: 0, bench: 4 }]
    expect(guestsForSaving(guests, ['g'])).toEqual([{ id: 'g', name: 'G', x: 0, y: 0, bench: 0 }, { id: 'h', name: 'H', x: 0, y: 0 }])
  })
  it('swaps a substitute with a starter, once', () => {
    const everyone = [{ id: 'sub', x: 0.1, y: 0.1 }, { id: 'ali', x: 0.5, y: 0.74 }, { id: 'other', x: 0.3, y: 0.3 }]
    const first = swapWithSubstitute(['other', 'sub'], everyone, 'sub', 'ali')
    expect(first).toEqual({ bench: ['other', 'ali'], move: { id: 'sub', x: 0.5, y: 0.74 } })
    // A second tap arrives after the first: the substitute is on the pitch now
    expect(swapWithSubstitute(first!.bench, everyone, 'sub', 'ali')).toBeNull()
    expect(swapWithSubstitute(['other', 'sub'], everyone, 'sub', 'other')).toBeNull()
    expect(swapWithSubstitute(['sub'], everyone, 'sub', 'nobody')).toBeNull()
  })
})
```

- [ ] **Step 2: Run** `npx vitest run src/utils/board.test.ts` — Expected: FAIL on the new tests and the changed expectation.
- [ ] **Step 3: Implement** the four additions and the two changes in `src/utils/board.ts`.
- [ ] **Step 4: Run** `npx vitest run src/utils/board.test.ts src/pages/admin/LineupEditorPage.test.tsx` — the page's first test now fails on `bench_order`; add `bench_order: null` to its two expected rows. Expected then: PASS.
- [ ] **Step 5: Commit** — `feat: a board's players and guests can have a place on the bench`

---

### Task 5: The Formation dialog

**Files:**
- Create: `src/components/FormationDiagram.tsx`, `src/components/FormationDialog.tsx`
- Modify: `src/locales/en.json`, `src/locales/ar.json` (the whole "Copy" section, by byte script)
- Test: `src/components/FormationDialog.test.tsx`

**Interfaces:**
- Consumes: Task 2's functions and constants.
- Produces:
  ```tsx
  // A small pitch with a dot for every spot; decoration only (aria-hidden). Each dot is <circle data-spot>.
  export function FormationDiagram({ lines, className }: { lines: number[]; className?: string })
  export default function FormationDialog(props: {
    onPitch: number              // 2..11
    current: string | null       // the board's formation
    onApply: (name: string) => void
    onClose: () => void
  })
  ```

One piece of state, the builder's `lines`. It starts from `current` when that fits `onPitch`, otherwise from the first suggestion. A suggestion card is a button named by its formation, `aria-pressed` when the builder holds that formation; a tap copies it into the builder. The name being built and the count are in one `<output>` (role `status`). Row *n* (1 is the defence) has buttons labelled `formation.fewer` and `formation.more`, disabled at 1 and at `MAX_IN_LINE`, and `formation.removeLine`, disabled with one line. `formation.addLine` adds a line of 1 and is disabled at `MAX_LINES`. Apply is disabled unless `fitsPitch`. Focus starts on Apply, or on Cancel when Apply is disabled.

- [ ] **Step 1: Write the failing tests**

```tsx
const open = (onPitch = 7, current: string | null = null) => {
  const onApply = vi.fn(), onClose = vi.fn()
  render(<FormationDialog onPitch={onPitch} current={current} onApply={onApply} onClose={onClose} />)
  return { onApply, onClose }
}
const button = (name: string) => screen.getByRole('button', { name })

it('offers only the formations for the number on the pitch', () => {
  open(7)
  expect(screen.getByText('7 players: the goalkeeper and 6 more.')).toBeInTheDocument()
  for (const name of ['2-3-1', '3-2-1', '3-1-2', '2-2-2']) expect(button(name)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '4-4-2' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '2-2' })).not.toBeInTheDocument()
})
it('applies the suggestion that was tapped', () => {
  const { onApply } = open(7)
  fireEvent.click(button('3-2-1'))
  expect(button('3-2-1')).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(button('Apply'))
  expect(onApply).toHaveBeenCalledWith('3-2-1')
})
it('opens on the board’s formation, or on the first suggestion when it does not fit', () => {
  open(7, '3-1-2')
  expect(button('3-1-2')).toHaveAttribute('aria-pressed', 'true')
  cleanup()
  open(7, '4-4-2')
  expect(button('2-3-1')).toHaveAttribute('aria-pressed', 'true')
})
it('counts the players left while a formation is built, and applies only one that fits', () => {
  const { onApply } = open(7, '2-3-1')
  fireEvent.click(button('One more in line 2'))
  expect(screen.getByRole('status')).toHaveTextContent('2-4-1')
  expect(screen.getByRole('status')).toHaveTextContent('1 player too many')
  expect(button('Apply')).toBeDisabled()
  fireEvent.click(button('One fewer in line 1'))
  expect(screen.getByRole('status')).toHaveTextContent('All players placed')
  fireEvent.click(button('One fewer in line 2'))
  fireEvent.click(button('One fewer in line 2'))
  expect(screen.getByRole('status')).toHaveTextContent('2 players left to place')
  fireEvent.click(button('One more in line 3'))
  fireEvent.click(button('One more in line 3'))
  fireEvent.click(button('Apply'))
  expect(onApply).toHaveBeenCalledWith('1-2-3')
})
it('adds and removes lines, within one to five lines of one to six', () => {
  open(11, '4-4-2')
  expect(button('One fewer in line 3')).toBeEnabled()
  fireEvent.click(button('Add a line'))
  fireEvent.click(button('Add a line'))
  expect(screen.getByRole('status')).toHaveTextContent('4-4-2-1-1')
  expect(button('Add a line')).toBeDisabled()
  expect(button('One fewer in line 5')).toBeDisabled()
  fireEvent.click(button('Remove line 4'))
  expect(screen.getByRole('status')).toHaveTextContent('4-4-2-1')
  for (let i = 0; i < 2; i++) fireEvent.click(button('One more in line 1'))
  expect(button('One more in line 1')).toBeDisabled()
})
it('draws a dot for every spot of the formation being built', () => {
  open(5, '2-2')
  expect(screen.getByRole('status').parentElement!.querySelectorAll('circle[data-spot]')).toHaveLength(5)
})
it('closes on Cancel, Escape and a tap outside, applying nothing', () => {
  const { onApply, onClose } = open()
  fireEvent.click(button('Cancel'))
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  fireEvent.click(screen.getByRole('dialog').parentElement!)
  expect(onClose).toHaveBeenCalledTimes(3)
  expect(onApply).not.toHaveBeenCalled()
})
it('is in Arabic when the app is', async () => {
  await inArabic(() => {
    open(7)
    expect(screen.getByRole('dialog', { name: 'التشكيلة' })).toBeInTheDocument()
    expect(button('تطبيق')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run** `npx vitest run src/components/FormationDialog.test.tsx` — Expected: FAIL, module not found.
- [ ] **Step 3: Add the copy** to both locale files with a byte script; check `git diff --numstat src/locales` shows additions only.
- [ ] **Step 4: Implement** `FormationDiagram` (SVG `viewBox="0 0 100 150"`, a green pitch, one `<circle data-spot>` per `formationSpots` entry) and `FormationDialog` as described above. The diagram of the formation being built sits in the same block as the `<output>`; each suggestion card shows its own small diagram.
- [ ] **Step 5: Run** the same command — Expected: PASS.
- [ ] **Step 6: Commit** — `feat: the Formation dialog, with suggestions for the team's size and a builder`

---

### Task 6: The picker on its own, the bench column and the swap dialog

**Files:**
- Create: `src/components/PlayerPicker.tsx`, `src/components/BenchColumn.tsx`, `src/components/BenchSwapDialog.tsx`
- Modify: `src/pages/admin/LineupEditorPage.tsx` (remove its `PlayerPicker`; import the new one and pass `title={t('lineups.addPlayers')}`)
- Test: `src/components/BenchSwapDialog.test.tsx`, `src/components/BenchColumn.test.tsx`

**Interfaces:**
- Produces:
  ```tsx
  // The page's picker, unchanged but for its heading
  export function PlayerPicker(props: { title: string; players: Player[]; onAdd: (ids: string[]) => void; onAddGuest: (name: string) => void; onClose: () => void })
  export interface BenchPerson { id: string; name: string; photo_url: string | null; guest?: boolean }
  // A list labelled "Substitutes" under the heading "Subs"; each person is a button "Substitute: <name>"
  export function BenchColumn(props: { substitutes: BenchPerson[]; onPick: (id: string) => void })
  export default function BenchSwapDialog(props: {
    substitute: BenchPerson
    onPitch: (BenchPerson & { position: PlayerPosition | null })[]
    onSwap: (starterId: string) => void
    onPutOn: () => void
    onRemove: () => void
    onClose: () => void
  })
  ```

`BenchColumn` is `w-14 shrink-0` and never makes its row taller than the pitch beside it: its list is positioned absolutely inside the column and scrolls. Each button is at least 44px tall; the name is one truncated line with the whole name in `title`. A guest keeps the dashed grey ring of the pitch. `BenchSwapDialog` is a bottom sheet like the picker; each starter is a button named by the player, showing the position at the end (nothing for a guest); with nobody on the pitch it shows `bench.nobody`. It does not close itself: the page closes it after each action.

- [ ] **Step 1: Write the failing tests**

```tsx
// BenchSwapDialog.test.tsx
const sub = { id: 'hadi', name: 'Hadi', photo_url: null }
const pitch = [
  { id: 'ali', name: 'Ali', photo_url: null, position: 'MID' as const },
  { id: 'g1', name: 'Khalil', photo_url: null, position: null, guest: true },
]
const open = (onPitch = pitch) => {
  const calls = { onSwap: vi.fn(), onPutOn: vi.fn(), onRemove: vi.fn(), onClose: vi.fn() }
  render(<BenchSwapDialog substitute={sub} onPitch={onPitch} {...calls} />)
  return calls
}
it('lists the players on the pitch and swaps with the one tapped', () => {
  const { onSwap } = open()
  const dialog = screen.getByRole('dialog', { name: 'Swap Hadi' })
  expect(within(dialog).getByText('Choose who comes off.')).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: /Khalil/ })).toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', { name: /Ali/ }))
  expect(onSwap).toHaveBeenCalledWith('ali')
})
it('can put the substitute on the pitch, or remove them', () => {
  const { onPutOn, onRemove } = open()
  fireEvent.click(screen.getByRole('button', { name: 'Put on the pitch' }))
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
  expect(onPutOn).toHaveBeenCalledTimes(1)
  expect(onRemove).toHaveBeenCalledTimes(1)
})
it('says so when nobody is on the pitch', () => {
  open([])
  expect(screen.getByText('Nobody is on the pitch yet.')).toBeInTheDocument()
})
it('closes on Cancel, Escape and a tap outside', () => {
  const { onClose, onSwap } = open()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  fireEvent.click(screen.getByRole('dialog').parentElement!)
  expect(onClose).toHaveBeenCalledTimes(3)
  expect(onSwap).not.toHaveBeenCalled()
})

// BenchColumn.test.tsx
it('shows each substitute as a button under the heading, with the whole name to hand', () => {
  const onPick = vi.fn()
  render(<BenchColumn substitutes={[{ id: 'hadi', name: 'Hadi Abdulrahman Al-Najjar', photo_url: null }, { id: 'g', name: 'Khalil', photo_url: null, guest: true }]} onPick={onPick} />)
  expect(screen.getByText('Subs')).toBeInTheDocument()
  const list = screen.getByRole('list', { name: 'Substitutes' })
  expect(within(list).getAllByRole('button')).toHaveLength(2)
  expect(within(list).getByTitle('Hadi Abdulrahman Al-Najjar')).toHaveAttribute('dir', 'auto')
  fireEvent.click(screen.getByRole('button', { name: 'Substitute: Khalil' }))
  expect(onPick).toHaveBeenCalledWith('g')
})
```

- [ ] **Step 2: Run** `npx vitest run src/components/BenchSwapDialog.test.tsx src/components/BenchColumn.test.tsx` — Expected: FAIL, modules not found.
- [ ] **Step 3: Move `PlayerPicker`** to its own file with the `title` prop, and implement the two new components.
- [ ] **Step 4: Run** `npx vitest run src/components/BenchSwapDialog.test.tsx src/components/BenchColumn.test.tsx src/pages/admin/LineupEditorPage.test.tsx` — Expected: PASS (the page's own tests prove the move changed nothing).
- [ ] **Step 5: Commit** — `feat: the substitutes column and the swap dialog; the player picker in its own file`

---

### Task 7: The editor page

**Files:**
- Modify: `src/pages/admin/LineupEditorPage.tsx`
- Test: `src/pages/admin/LineupEditorPage.formation.test.tsx` (new; uses `src/test/fakeSupabase.ts`)

**Interfaces:**
- Consumes: everything Tasks 2 to 6 produce.
- Produces (for Task 8): the page calls `drawBoardImage` with `substitutes` and `substitutesTitle`, and this subtitle:
  ```ts
  [t('lineups.playerCount', { count: onPitch }), formation, subs.length > 0 && t('bench.count', { count: subs.length })].filter(Boolean).join(' · ')
  ```

What the page does:

- **State:** `bench: string[]` and `formation: string | null`. The pitch is everyone in `board` and `guests` whose id is not in `bench`; the substitutes are those whose id is, in `bench`'s order. An id in `bench` that matches nobody is ignored.
- **Loading:** `bench = benchOrder(rows, guests)`; `formation` is the stored one only when `parseFormation` reads it and it `fitsPitch` the number on the pitch, otherwise `null`.
- **Saving:** `formation` in the insert and the update; `guestsForSaving(guests, bench)`; `lineupChanges(id, savedIds, board, bench)`.
- **Formation button** under the toolbar: `formation.button` or `formation.buttonNamed`; disabled outside 2..11 with `formation.tooFew` or `formation.tooMany` under it. Applying sets every pitch player's and guest's spot from `assignToFormation` (a guest's position is `null`), keeps the name, and marks the board unsaved.
- **The name is forgotten** whenever the number on the pitch changes: players or a guest added to the pitch, one taken off the board, one moved to the substitutes, a substitute put on the pitch. Not on a drag, not on a swap.
- **Add substitutes** beside Add players (two columns): the picker with `title={t('bench.add')}`; those chosen join `board` (or `guests`) and the end of `bench`. Both pickers offer active players who are nowhere on the board.
- **Under the pitch** each player and guest on the pitch has a `bench.toBench` button before the ✕. The list no longer shows substitutes.
- **Beside the pitch:** `PitchBoard` and, when there are substitutes, `BenchColumn` in one flex row (the pitch `flex-1 min-w-0`). A tap opens `BenchSwapDialog`: swap through `swapWithSubstitute`; put on the pitch at `spotForNewPlayer(<number on the pitch>)`; remove takes them off the board. Each closes the dialog.
- New players land at `spotForNewPlayer(<number on the pitch> + i)`.

- [ ] **Step 1: Write the failing tests.** The fixture: league `L1`; players `omar` (GK), `sami` (DEF), `ali` (ATT), `hadi` (MID), `zaid` (MID, inactive) and nine more active `MID` players `p1`…`p9` named `Extra 1`…`Extra 9`. A helper `add(names, button = /Add players/)` picks them in the picker and confirms; `token(name)` is `screen.getByRole('button', { name })` (the pitch token) and its `style.left` / `style.top` say where it stands.

  | Test | Asserts |
  |---|---|
  | no formation for fewer than two | new board with only Ali: the Formation button is disabled; "Add at least 2 players to choose a formation." |
  | applies a formation | add Omar, Sami, Ali; Formation → `1-1` → Apply: Omar at 50% / 92%, Sami at 50% / 74%, Ali at 50% / 20%; the button reads "Formation: 1-1"; Save: the `lineups` insert has `formation: '1-1'` and the upsert rows carry those spots with `bench_order: null` |
  | forgets the name when the number changes | after applying `1-1`, add Hadi: the button reads "Formation"; apply `1-1-1`, then "Take Hadi off the pitch": "Formation" again |
  | keeps the name on a drag | after applying, drag Ali: still "Formation: 1-1" |
  | no formation for more than eleven | add twelve: disabled with "A formation takes up to 11 players. Move the others to the substitutes."; "Move Extra 9 to substitutes" enables it and shows "Substitute: Extra 9" |
  | adds substitutes beside the pitch | add Omar and Ali; `add(['Hadi'], /Add substitutes/)` (the picker's heading is "Add substitutes"): "Substitute: Hadi" is in the list "Substitutes", no pitch token `Hadi`, and Hadi is offered by neither picker |
  | swaps a substitute with a starter | with `1-1` on Omar, Sami, Ali and Hadi on the bench: tap "Substitute: Hadi", then Ali in "Swap Hadi": the dialog is gone, token Hadi stands at 50% / 20%, "Substitute: Ali" is on the bench, and the button still reads "Formation: 1-1" |
  | puts a substitute on the pitch, and removes one | Put on the pitch: a pitch token and no substitute, the column gone; Remove: nowhere on the page and offered by the picker again |
  | a guest can be a substitute | add a guest through Add substitutes: "Substitute: Khalil"; Save: the stored guest has `bench: 0` |
  | loads a saved board and saves it back the same | stored: `formation: '1-1'`; Omar, Sami, Ali on the pitch; Hadi `bench_order: 1`; Zaid (inactive) `bench_order: 0`; a guest with `bench: 2`. Shows "Formation: 1-1" and the substitutes in the order Zaid, Hadi, the guest. After renaming and Save: the update has `formation: '1-1'`; Zaid and Hadi are upserted with `bench_order` 0 and 1; nothing is deleted from `lineup_players` |
  | a saved formation that no longer fits is not shown | stored `formation: '4-4-2'` with three on the pitch: the button reads "Formation" |
  | a damaged formation is not shown | stored `formation: 'abc'`: the button reads "Formation", and the board opens |
  | shares the formation and the substitutes | `vi.mock('../../lib/shareImage')`; Share: `drawBoardImage` gets `subtitle: '3 players · 1-1 · 1 substitute'`, three `players`, `substitutes: [expect.objectContaining({ name: 'Hadi' })]` and `substitutesTitle: 'Substitutes'` |
  | is in Arabic when the app is | `inArabic`: the buttons "التشكيلة" and "أضف بدلاء" |

- [ ] **Step 2: Run** `npx vitest run src/pages/admin/LineupEditorPage.formation.test.tsx` — Expected: FAIL (no Formation button).
- [ ] **Step 3: Implement** the page changes listed above.
- [ ] **Step 4: Run** `npx vitest run src/pages/admin/LineupEditorPage.formation.test.tsx src/pages/admin/LineupEditorPage.test.tsx src/pages/admin/TeamBuilderPage.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: formations and substitutes on the coach board`

---

### Task 8: The shared image

**Files:**
- Modify: `src/lib/shareImage.ts` (`drawBoardImage`)
- Test: `src/lib/shareImage.test.ts`

**Interfaces:**
- Produces: two optional fields on `drawBoardImage`'s data:
  ```ts
  substitutes?: { name: string; photo_url: string | null; guest?: boolean }[]
  substitutesTitle?: string
  ```

With substitutes, the canvas is `1080 + 220 × columns` wide and the pitch stays where it is. Eight substitutes to a column. Column *c* is centred on x = `1150 + 220 × c`; the heading (`substitutesTitle`) is written once, over column 0, at y = `PITCH_Y + 40`; substitute *i* of a column has its circle's centre at y = `PITCH_Y + 130 + 160 × i`, radius 38. The title, the line under it and the footer stay centred on the wider canvas. The circle, ring and name are drawn by the same code as a player on the pitch (pull that loop's body out into a function taking the centre and the radius). Without substitutes nothing changes.

- [ ] **Step 1: Write the failing tests** (in `describe('drawBoardImage')`, with its `fakeCanvas`)

```ts
const sub = (name: string) => ({ name, photo_url: null })

it('is as wide as ever without substitutes', async () => {
  const { restore } = fakeCanvas()
  const canvas = await drawBoardImage({ title: 'T', subtitle: 's', players: [], footer: 'ScoreLeader' })
  restore()
  expect(canvas.width).toBe(1080)
})
it('draws the substitutes in a column to the right of the pitch', async () => {
  const { written, restore } = fakeCanvas()
  const canvas = await drawBoardImage({
    title: 'Friday', subtitle: 's', players: [], footer: 'ScoreLeader',
    substitutes: [sub('Hadi'), sub('Zaid')], substitutesTitle: 'Substitutes',
  })
  restore()
  expect(canvas.width).toBe(1300)
  expect(written.find((w) => w.text === 'Substitutes')).toMatchObject({ x: 1150, y: 210 })
  const hadi = written.find((w) => w.text === 'Hadi')!, zaid = written.find((w) => w.text === 'Zaid')!
  expect(hadi.x).toBe(1150)
  expect(zaid.y - hadi.y).toBe(160)
  // The title is centred on the wider image
  expect(written.find((w) => w.text === 'Friday')!.x).toBe(650)
})
it('starts a second column after eight substitutes', async () => {
  const { written, restore } = fakeCanvas()
  const canvas = await drawBoardImage({
    title: 'T', subtitle: 's', players: [], footer: 'ScoreLeader',
    substitutes: Array.from({ length: 9 }, (_, i) => sub(`Sub${i + 1}`)), substitutesTitle: 'Substitutes',
  })
  restore()
  expect(canvas.width).toBe(1520)
  expect(written.find((w) => w.text === 'Sub9')).toMatchObject({ x: 1370, y: written.find((w) => w.text === 'Sub1')!.y })
  expect(written.filter((w) => w.text === 'Substitutes')).toHaveLength(1)
})
```

- [ ] **Step 2: Run** `npx vitest run src/lib/shareImage.test.ts` — Expected: FAIL on the three new tests.
- [ ] **Step 3: Implement** as described.
- [ ] **Step 4: Run** `npx vitest run src/lib/shareImage.test.ts src/pages/admin/LineupEditorPage.formation.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: the shared board image shows the substitutes beside the pitch`

---

### Task 9: Everything together, and the release

- [ ] **Step 1:** `npm test` — Expected: every file passes. (On a busy machine, slow tests in `NewSessionDialog.test.tsx` and `SchedulePage.test.tsx` can pass only with `npx vitest run --testTimeout=30000`.)
- [ ] **Step 2:** `npm run build` — Expected: typecheck and build succeed.
- [ ] **Step 3:** `bash scripts/rehearse.sh` — Expected: `TENANCY TESTS PASSED`.
- [ ] **Step 4:** Push the branch and open a pull request.
- [ ] **Step 5:** Apply the migration to the live database (`supabase db push`), and check `supabase migration list --linked` shows `20261013000003` on both sides. This comes before the merge: the app in use until then ignores the new columns, but the new app cannot save a board without them.
- [ ] **Step 6:** Merge the pull request; check the production deploy and that the site serves the new build.
- [ ] **Step 7:** Clean up: remove the worktree and delete the merged branch.

No server function changes in this plan, so there is none to deploy.
