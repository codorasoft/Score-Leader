# Today in the App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A coach with the `schedule` feature is shown today's calendar items in a popup the first time he opens the app each day, and in a Today card on Home for the rest of the day.

**Architecture:** One pure function turns today's schedule items, match sessions and training plans into an ordered list of rows; one data function reads them for a league and a day. A small device-storage module remembers which day was handled for which league. A list component is shared by a popup (shown by a once-a-day check in the admin layout) and by a card on Home. No database change, no server function, no new feature key, no new dependency.

**Tech Stack:** React 19 + TypeScript, react-router-dom 7, Vitest + Testing Library with the in-memory Supabase fake (`src/test/fakeSupabase.ts`), i18next (`src/locales/en.json`, `ar.json`), Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-10-13-today-in-app-design.md`

## Global Constraints

- Work on branch `feat/today-in-app` in `E:\Score-Leader\.claude\worktrees\today-in-app`; never commit to `main`. Nothing is pushed and no pull request is opened without the user's go-ahead (merging to `main` deploys production).
- "Today" is always `localToday()` from `src/utils/trainingDays.ts` (the device's local date), never a UTC date.
- The storage key is exactly `scoreleader.todaySeen`; its value is JSON `{ "<league id>": "YYYY-MM-DD" }`.
- Everything is behind `useFeature('schedule')`; training plans also need `useFeature('training')`.
- Colours come from `DOT_COLOR` and the long date from `longDay`, both in `src/components/MonthCalendar.tsx`. Existing wording is reused: `schedule.allDay` ("All day"), `schedule.session` ("Match session"), `schedule.plan` ("Training plan").
- Every new user-visible string is added to both locale files with the copy in the "Copy" section; English is exact (tests assert it).
- `src/locales/en.json` and `ar.json` are stored with CRLF line endings. After editing one, run `git diff --numstat` on it: if the whole file shows as changed, restore the CRLF endings before staging and stage with `git -c core.autocrlf=false add`.
- Admin links are built with `useAdminPath()`; the league comes from `useLeague()`.
- Tests that depend on the date fake only the clock: `vi.useFakeTimers({ toFake: ['Date'] })`, `vi.setSystemTime(new Date(2026, 9, 12, 10, 0))` (Monday 12 October 2026), and `vi.useRealTimers()` afterwards, as in `src/pages/admin/SchedulePage.test.tsx`.
- Each task ends green on `npx vitest run <its test files>`; Task 6 runs the whole suite and the build.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Half past midnight.** A coach who opens the app at 00:30 is on the new day: the check and the card must ask for the device's local date. Pinned in Task 4.
2. **A damaged value under `scoreleader.todaySeen`** (not JSON, a list, `null`, a number for a league) must count as "nothing handled" and be replaced on the next write, never crash the admin layout. Pinned in Task 2.
3. **Storage that can be read but not written** (full, or private mode) must still show the popup only once: the in-memory copy answers. Pinned in Task 2.
4. **React StrictMode runs effects twice** in development: the popup must still open, once, and the day must not be marked by the run that was thrown away. Pinned in Task 4.
5. **A training plan with no title, and an Arabic title in the English app:** the plan row shows "Training plan" alone with no empty line, and every title carries `dir="auto"`. Pinned in Task 3.

---

## File structure

| File | Responsibility |
|---|---|
| `src/utils/schedule.ts` | `TodayRow`, `todayRows`: today's ordered rows, pure |
| `src/lib/scheduleApi.ts` | `fetchToday`: reads one day for a league and returns its rows |
| `src/lib/todaySeen.ts` | the handled day per league, on the device, with a memory fallback |
| `src/components/TodayList.tsx` | the rows as links; shared by the popup and the card |
| `src/components/TodayDialog.tsx` | the popup |
| `src/components/TodayReminder.tsx` | the once-a-day check; shows `TodayDialog` |
| `src/layouts/AdminLayout.tsx` | renders `TodayReminder` |
| `src/pages/admin/HomePage.tsx` | the Today card (`TodayBlock`) |
| `src/locales/en.json`, `src/locales/ar.json` | copy |

## Copy

A new top-level block `today`, placed after `schedule`, in both files.

| Key | English | Arabic |
|---|---|---|
| `today.title` | Today | اليوم |
| `today.openSchedule` | Open schedule | فتح الجدول |
| `today.gotIt` | Got it | حسناً |
| `today.count_one` | 1 item | عنصر واحد |
| `today.count_other` | {{count}} items | {{count}} عنصر |
| `today.count_zero` (Arabic only) | | {{count}} عنصر |
| `today.count_two` (Arabic only) | | عنصران |
| `today.count_few` (Arabic only) | | {{count}} عناصر |
| `today.count_many` (Arabic only) | | {{count}} عنصراً |

Task 3 adds `title`, `openSchedule` and `gotIt`; Task 5 adds the `count` forms.

---

### Task 1: Today's rows

**Files:**
- Modify: `src/utils/schedule.ts` (add after `dotsFor`)
- Modify: `src/lib/scheduleApi.ts` (add after `fetchScheduleExtras`)
- Test: `src/utils/schedule.test.ts`, `src/lib/scheduleApi.test.ts`

**Interfaces:**
- Consumes: `itemsOn`, `isDone`, `timeLabel`, `DotKind`, `ScheduleItem`, `ScheduleExtras` (all in `src/utils/schedule.ts`); `fetchScheduleItems`, `fetchScheduleExtras`.
- Produces:
  ```ts
  // src/utils/schedule.ts
  export interface TodayRow {
    kind: 'item' | 'session' | 'plan'
    id: string
    dot: DotKind
    // An item's time label; null for all day, and always null for sessions and plans
    time: string | null
    // An item's title, a plan's title (may be null); always null for a session
    title: string | null
  }
  export function todayRows(items: ScheduleItem[], extras: ScheduleExtras, date: string): TodayRow[]

  // src/lib/scheduleApi.ts — throws when a request fails
  export async function fetchToday(leagueId: string, date: string, withPlans: boolean): Promise<TodayRow[]>
  ```

- [ ] **Step 1: Write the failing tests for `todayRows`** in `src/utils/schedule.test.ts` (it already has the `item()` builder; import `todayRows`)

```ts
describe('todayRows', () => {
  const extras = {
    sessions: [{ id: 's1', date: '2026-10-12' }, { id: 's0', date: '2026-10-11' }],
    plans: [{ id: 'p1', training_date: '2026-10-12', title: 'Passing day' }, { id: 'p0', training_date: '2026-10-13', title: 'Later' }],
  }
  const none = { sessions: [], plans: [] }

  it('lists timed items by start, then all-day items by name, then sessions, then plans', () => {
    const items = [
      item({ id: 'b', title: 'Book the pitch' }),
      item({ id: 'late', kind: 'match', title: 'Cup final', start_time: '20:00:00' }),
      item({ id: 'early', kind: 'training', title: 'Gym', start_time: '08:00:00', end_time: '09:30:00' }),
      item({ id: 'a', kind: 'other', title: 'Answer the league' }),
    ]
    expect(todayRows(items, extras, '2026-10-12')).toEqual([
      { kind: 'item', id: 'early', dot: 'training', time: '08:00 – 09:30', title: 'Gym' },
      { kind: 'item', id: 'late', dot: 'match', time: '20:00', title: 'Cup final' },
      { kind: 'item', id: 'a', dot: 'other', time: null, title: 'Answer the league' },
      { kind: 'item', id: 'b', dot: 'task', time: null, title: 'Book the pitch' },
      { kind: 'session', id: 's1', dot: 'session', time: null, title: null },
      { kind: 'plan', id: 'p1', dot: 'plan', time: null, title: 'Passing day' },
    ])
  })

  it('takes a repeating item only on its days, and not on a skipped one', () => {
    // 12 October 2026 is a Monday (weekday 1)
    const weekly = item({ id: 'w', item_date: '2026-10-05', repeat_days: [1] })
    expect(todayRows([weekly], none, '2026-10-12').map((r) => r.id)).toEqual(['w'])
    expect(todayRows([weekly], none, '2026-10-13')).toEqual([])
    expect(todayRows([{ ...weekly, skipped_dates: ['2026-10-12'] }], none, '2026-10-12')).toEqual([])
  })

  it('leaves out a task ticked as done today, and keeps the others', () => {
    const items = [
      item({ id: 'done', title: 'A', done_dates: ['2026-10-12'] }),
      item({ id: 'open', title: 'B' }),
      item({ id: 'done-before', title: 'C', item_date: '2026-10-05', repeat_days: [1], done_dates: ['2026-10-05'] }),
      // Only tasks can be ticked; a stray date on another kind hides nothing
      item({ id: 'training', kind: 'training', title: 'D', done_dates: ['2026-10-12'] }),
    ]
    expect(todayRows(items, none, '2026-10-12').map((r) => r.id)).toEqual(['open', 'done-before', 'training'])
  })

  it('is empty on a day with nothing', () => {
    expect(todayRows([item({ item_date: '2026-10-11' })], none, '2026-10-12')).toEqual([])
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/utils/schedule.test.ts`
Expected: FAIL, `todayRows` is not exported.

- [ ] **Step 3: Implement `TodayRow` and `todayRows` in `src/utils/schedule.ts`**

Items come from `itemsOn(items, date)` (it already orders them), minus those with `kind === 'task' && isDone(item, date)`; then the sessions and plans of that date in the order given.

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/utils/schedule.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing tests for `fetchToday`** in `src/lib/scheduleApi.test.ts` (it already has the `row()` builder and the fake; import `fetchToday`)

```ts
describe('fetchToday', () => {
  const seed = () => resetDb({
    schedule_items: [
      row({ id: 'gym', title: 'Gym', start_time: '08:00:00' }),
      row({ id: 'weekly', title: 'Team training', kind: 'training', item_date: '2026-10-05', repeat_days: [1] }),
      row({ id: 'done', title: 'Done already', done_dates: ['2026-10-12'] }),
      row({ id: 'tomorrow', item_date: '2026-10-13' }),
      row({ id: 'theirs', league_id: 'L2' }),
    ],
    sessions: [{ id: 's1', league_id: 'L1', date: '2026-10-12' }, { id: 's2', league_id: 'L2', date: '2026-10-12' }],
    trainings: [{ id: 'p1', league_id: 'L1', training_date: '2026-10-12', title: 'Passing day' }],
  })

  it("reads one league's day as rows", async () => {
    seed()
    const rows = await fetchToday('L1', '2026-10-12', true)
    expect(rows.map((r) => `${r.kind}:${r.id}`)).toEqual(['item:gym', 'item:weekly', 'session:s1', 'plan:p1'])
  })

  it('does not ask for training plans without the training feature', async () => {
    seed()
    db.errors.trainings = { message: 'must not be read' }
    const rows = await fetchToday('L1', '2026-10-12', false)
    expect(rows.map((r) => r.kind)).toEqual(['item', 'item', 'session'])
  })

  it('throws when a read fails', async () => {
    seed()
    db.errors.schedule_items = { message: 'down' }
    await expect(fetchToday('L1', '2026-10-12', true)).rejects.toThrow()
  })
})
```

- [ ] **Step 6: Run them to see them fail**

Run: `npx vitest run src/lib/scheduleApi.test.ts`
Expected: FAIL, `fetchToday` is not exported.

- [ ] **Step 7: Implement `fetchToday` in `src/lib/scheduleApi.ts`**

Both existing reads at once with `date` as both ends of the range, then `todayRows`.

- [ ] **Step 8: Run both files**

Run: `npx vitest run src/utils/schedule.test.ts src/lib/scheduleApi.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/utils/schedule.ts src/utils/schedule.test.ts src/lib/scheduleApi.ts src/lib/scheduleApi.test.ts
git commit -m "feat: today's rows from the coach's schedule, and the read for one day"
```

---

### Task 2: The handled day, remembered on the device

**Files:**
- Create: `src/lib/todaySeen.ts`
- Test: `src/lib/todaySeen.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function isHandled(leagueId: string, date: string): boolean
  export function markHandled(leagueId: string, date: string): void
  // Forgets the in-memory copy only; for tests that stand for a page reload
  export function resetTodaySeen(): void
  ```

- [ ] **Step 1: Write the failing tests** in `src/lib/todaySeen.test.ts`

```ts
import { vi } from 'vitest'
import { isHandled, markHandled, resetTodaySeen } from './todaySeen'

const KEY = 'scoreleader.todaySeen'

beforeEach(() => { localStorage.clear(); resetTodaySeen() })
afterEach(() => vi.restoreAllMocks())

it('remembers the handled day for each league', () => {
  expect(isHandled('L1', '2026-10-13')).toBe(false)
  markHandled('L1', '2026-10-13')
  expect(isHandled('L1', '2026-10-13')).toBe(true)
  expect(isHandled('L2', '2026-10-13')).toBe(false)
  expect(isHandled('L1', '2026-10-14')).toBe(false)
  markHandled('L2', '2026-10-13')
  expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ L1: '2026-10-13', L2: '2026-10-13' })
})

it('still knows after a reload', () => {
  markHandled('L1', '2026-10-13')
  resetTodaySeen()
  expect(isHandled('L1', '2026-10-13')).toBe(true)
})

it('falls back to memory when storage is blocked', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
  expect(isHandled('L1', '2026-10-13')).toBe(false)
  expect(() => markHandled('L1', '2026-10-13')).not.toThrow()
  expect(isHandled('L1', '2026-10-13')).toBe(true)
})

it('falls back to memory when storage can be read but not written', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full') })
  markHandled('L1', '2026-10-13')
  expect(isHandled('L1', '2026-10-13')).toBe(true)
})

it.each(['not json', '[]', 'null', '"text"', '{"L1":5}'])('treats a damaged value (%s) as nothing handled, and replaces it', (damaged) => {
  localStorage.setItem(KEY, damaged)
  expect(isHandled('L1', '2026-10-13')).toBe(false)
  markHandled('L1', '2026-10-13')
  expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ L1: '2026-10-13' })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/todaySeen.test.ts`
Expected: FAIL, the module does not exist.

- [ ] **Step 3: Implement `src/lib/todaySeen.ts`**

A module-level `Map<string, string>` is written on every `markHandled` and consulted first by `isHandled`; storage is read and written inside `try`/`catch`. A stored value is used only when it parses to a plain object, and only its string entries are kept.

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/lib/todaySeen.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/todaySeen.ts src/lib/todaySeen.test.ts
git commit -m "feat: the device remembers which day's items were shown for a league"
```

---

### Task 3: The list and the popup

**Files:**
- Create: `src/components/TodayList.tsx`, `src/components/TodayDialog.tsx`
- Modify: `src/locales/en.json`, `src/locales/ar.json` (`today.title`, `today.openSchedule`, `today.gotIt`)
- Test: `src/components/TodayDialog.test.tsx`

**Interfaces:**
- Consumes: `TodayRow` (Task 1); `DOT_COLOR`, `longDay`; `useAdminPath`.
- Produces:
  ```tsx
  // src/components/TodayList.tsx — default export; a <ul aria-label={label}> with one link per row
  function TodayList(props: { rows: TodayRow[]; label: string; onNavigate?: () => void })
  // src/components/TodayDialog.tsx — default export
  function TodayDialog(props: { date: string; rows: TodayRow[]; onClose: () => void })
  ```

**Markup the tests rely on.** Each row is `<li><a>` holding, in this order: the colour dot (`aria-hidden`), a small line, a main line.

| Row kind | Link | Small line | Main line |
|---|---|---|---|
| `item` | `adminPath('/schedule')` | `row.time`, or `schedule.allDay` | `row.title` |
| `session` | `adminPath('/sessions/<id>')` | `schedule.allDay` | `schedule.session` |
| `plan` | `adminPath('/trainings/<id>')` | `schedule.plan` | `row.title`; no element at all when it is null |

A title (item or plan) is rendered with `dir="auto"` and `break-words`; a time with `dir="ltr"`. A tap on a link calls `onNavigate`.

The dialog follows `src/components/ConfirmDialog.tsx` (backdrop `fixed inset-0 z-50`, a tap on the backdrop closes) and the key handling of `src/components/NewSessionDialog.tsx` (Escape closes; Tab and Shift+Tab wrap inside, over its links and buttons). It is `role="dialog"`, `aria-modal="true"`, named by its `today.title` heading, with `longDay(date, i18n.language)` under the heading, then `TodayList` inside a box that scrolls (`max-h-[50vh] overflow-y-auto`), then the **Open schedule** link and the **Got it** button. Focus moves to Got it when it opens.

- [ ] **Step 1: Write the failing tests** in `src/components/TodayDialog.test.tsx`

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../test/league'
import { inArabic } from '../test/arabic'
import type { TodayRow } from '../utils/schedule'
import TodayDialog from './TodayDialog'

const rows: TodayRow[] = [
  { kind: 'item', id: 'gym', dot: 'training', time: '08:00 – 09:30', title: 'Gym' },
  { kind: 'item', id: 'pitch', dot: 'task', time: null, title: 'حجز الملعب' },
  { kind: 'session', id: 's1', dot: 'session', time: null, title: null },
  { kind: 'plan', id: 'p1', dot: 'plan', time: null, title: 'Passing day' },
  { kind: 'plan', id: 'p2', dot: 'plan', time: null, title: null },
]
const onClose = vi.fn()
const open = () => {
  onClose.mockClear()
  render(<MemoryRouter><InLeague><TodayDialog date="2026-10-13" rows={rows} onClose={onClose} /></InLeague></MemoryRouter>)
  return screen.getByRole('dialog', { name: 'Today' })
}
const links = (dialog: HTMLElement) => within(within(dialog).getByRole('list')).getAllByRole('link')

it('names the day and lists the rows as links to their pages', () => {
  const dialog = open()
  expect(dialog).toHaveAttribute('aria-modal', 'true')
  expect(within(dialog).getByText('Tuesday, October 13, 2026')).toBeInTheDocument()
  expect(links(dialog).map((l) => l.getAttribute('href'))).toEqual([
    '/admin/eagles/schedule', '/admin/eagles/schedule', '/admin/eagles/sessions/s1', '/admin/eagles/trainings/p1', '/admin/eagles/trainings/p2',
  ])
  expect(links(dialog).map((l) => l.textContent)).toEqual([
    '08:00 – 09:30Gym', 'All dayحجز الملعب', 'All dayMatch session', 'Training planPassing day', 'Training plan',
  ])
  expect(within(dialog).getByRole('link', { name: 'Open schedule' })).toHaveAttribute('href', '/admin/eagles/schedule')
})

it('a title follows its own writing direction', () => {
  const dialog = open()
  expect(within(dialog).getByText('حجز الملعب')).toHaveAttribute('dir', 'auto')
  expect(within(dialog).getByText('Passing day')).toHaveAttribute('dir', 'auto')
})

it('starts on Got it, and Tab stays inside', () => {
  const dialog = open()
  const gotIt = within(dialog).getByRole('button', { name: 'Got it' })
  expect(gotIt).toHaveFocus()
  fireEvent.keyDown(gotIt, { key: 'Tab' })
  expect(links(dialog)[0]).toHaveFocus()
  fireEvent.keyDown(links(dialog)[0], { key: 'Tab', shiftKey: true })
  expect(gotIt).toHaveFocus()
})

it.each([
  ['Got it', (d: HTMLElement) => fireEvent.click(within(d).getByRole('button', { name: 'Got it' }))],
  ['Escape', (d: HTMLElement) => fireEvent.keyDown(d, { key: 'Escape' })],
  ['a tap outside', (d: HTMLElement) => fireEvent.click(d.parentElement!)],
  ['Open schedule', (d: HTMLElement) => fireEvent.click(within(d).getByRole('link', { name: 'Open schedule' }))],
  ['a row', (d: HTMLElement) => fireEvent.click(links(d)[2])],
])('%s closes it', (_name, close) => {
  close(open())
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('a tap inside does not close it', () => {
  fireEvent.click(within(open()).getByText('Tuesday, October 13, 2026'))
  expect(onClose).not.toHaveBeenCalled()
})

it('speaks Arabic', async () => {
  await inArabic(() => {
    render(<MemoryRouter><InLeague><TodayDialog date="2026-10-13" rows={rows} onClose={onClose} /></InLeague></MemoryRouter>)
    const dialog = screen.getByRole('dialog', { name: 'اليوم' })
    expect(within(dialog).getByRole('button', { name: 'حسناً' })).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'فتح الجدول' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/TodayDialog.test.tsx`
Expected: FAIL, the component does not exist.

- [ ] **Step 3: Add `today.title`, `today.openSchedule`, `today.gotIt` to both locale files** (copy in the "Copy" section; check the line endings as the Global Constraints say)

- [ ] **Step 4: Implement `src/components/TodayList.tsx`** to the markup table above

- [ ] **Step 5: Implement `src/components/TodayDialog.tsx`** as described above

- [ ] **Step 6: Run them to see them pass**

Run: `npx vitest run src/components/TodayDialog.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git diff --numstat src/locales/
git add src/components/TodayList.tsx src/components/TodayDialog.tsx src/components/TodayDialog.test.tsx
git -c core.autocrlf=false add src/locales/en.json src/locales/ar.json
git commit -m "feat: a popup that lists today's items, each a link to its page"
```

---

### Task 4: The once-a-day check

**Files:**
- Create: `src/components/TodayReminder.tsx`
- Modify: `src/layouts/AdminLayout.tsx` (render `<TodayReminder />` after `</main>`)
- Test: `src/components/TodayReminder.test.tsx`, `src/layouts/AdminLayout.test.tsx`

**Interfaces:**
- Consumes: `fetchToday(leagueId, date, withPlans): Promise<TodayRow[]>` (Task 1); `isHandled`, `markHandled` (Task 2); `TodayDialog` (Task 3); `localToday`; `withNetworkToastsMuted` from `src/lib/toast.ts`; `useLeague`, `useFeature`; `useLocation`.
- Produces: `TodayReminder`, the default export of `src/components/TodayReminder.tsx`, a component with no props.

**Behaviour to implement:**

- One effect, keyed on the league id, the two features, today's date, whether the page is the match tracker, and a counter that goes up each time the document becomes visible. It does nothing without `schedule`, on the match tracker, or when `isHandled(league.id, today)`.
- The match tracker is any path matching `/\/sessions\/[^/]+\/match\//`.
- Otherwise it calls `withNetworkToastsMuted(() => fetchToday(league.id, today, withPlans))`. When the answer arrives and the effect has not been cleaned up: `markHandled(league.id, today)`, and with at least one row the popup opens with those rows and that date. A failed read is swallowed: nothing shown, nothing marked.
- A `visibilitychange` listener, when the document is visible, sets today to `localToday()` and raises the counter.
- The popup is rendered only while the league it was read for is still the current one.

- [ ] **Step 1: Write the failing tests** in `src/components/TodayReminder.test.tsx`

```tsx
import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Link, MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { LeagueProvider } from '../contexts/LeagueContext'
import { testLeague } from '../test/league'
import { db, resetDb } from '../test/fakeSupabase'
import { FEATURES, type FeatureKey } from '../lib/features'
import { isHandled, resetTodaySeen } from '../lib/todaySeen'
import * as toast from '../lib/toast'

vi.mock('../lib/supabase', async () => (await import('../test/fakeSupabase')).supabaseModule)

import TodayReminder from './TodayReminder'

const item = (over: Record<string, unknown>) => ({
  league_id: 'L1', kind: 'task', title: 'Item', item_date: '2026-10-12', start_time: null, end_time: null, note: null,
  repeat_days: [], repeat_until: null, skipped_dates: [], done_dates: [], ...over,
})
const monday = () => ({ schedule_items: [item({ id: 'gym', title: 'Gym' }), item({ id: 'cup', league_id: 'L2', title: 'Cup final' })] })

const tree = (path: string, features: readonly FeatureKey[] = FEATURES, league = {}) => (
  <MemoryRouter initialEntries={[path]}>
    <LeagueProvider league={{ ...testLeague(features), ...league }}>
      <Link to="/admin/eagles/home">leave</Link>
      <TodayReminder />
    </LeagueProvider>
  </MemoryRouter>
)
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
const comeBack = () => act(() => {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
})

beforeEach(() => {
  localStorage.clear()
  resetTodaySeen()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

it("opens with today's items and remembers the day", async () => {
  resetDb(monday())
  render(tree('/admin/eagles/home'))
  const dialog = await screen.findByRole('dialog', { name: 'Today' })
  expect(dialog).toHaveTextContent('Monday, October 12, 2026')
  expect(dialog).toHaveTextContent('Gym')
  expect(dialog).not.toHaveTextContent('Cup final')
  expect(isHandled('L1', '2026-10-12')).toBe(true)
})

it('stays closed on a day with nothing, and remembers the day all the same', async () => {
  resetDb({})
  render(tree('/admin/eagles/home'))
  await waitFor(() => expect(isHandled('L1', '2026-10-12')).toBe(true))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('does not open a second time on the same day', async () => {
  resetDb(monday())
  const first = render(tree('/admin/eagles/home'))
  fireEvent.click(await screen.findByRole('button', { name: 'Got it' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  first.unmount()
  const reads = db.reads
  render(tree('/admin/eagles/players'))
  await settle()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(db.reads).toBe(reads)
})

it('opens again for another league', async () => {
  resetDb(monday())
  const view = render(tree('/admin/eagles/home'))
  fireEvent.click(await screen.findByRole('button', { name: 'Got it' }))
  view.rerender(tree('/admin/eagles/home', FEATURES, { id: 'L2', slug: 'lions' }))
  expect(await screen.findByRole('dialog')).toHaveTextContent('Cup final')
})

it('drops an answer for a league that was left, without remembering its day', async () => {
  resetDb(monday())
  let answer = () => {}
  db.holds.schedule_items = new Promise<void>((r) => { answer = r })
  const view = render(tree('/admin/eagles/home'))
  view.rerender(tree('/admin/eagles/home', FEATURES, { id: 'L3', slug: 'owls' }))
  answer()
  await waitFor(() => expect(isHandled('L3', '2026-10-12')).toBe(true))
  expect(isHandled('L1', '2026-10-12')).toBe(false)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('does nothing without the schedule feature', async () => {
  resetDb(monday())
  render(tree('/admin/eagles/home', FEATURES.filter((f) => f !== 'schedule')))
  await settle()
  expect(db.reads).toBe(0)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('waits while a match is being tracked, and runs on leaving it', async () => {
  resetDb(monday())
  render(tree('/admin/eagles/sessions/s1/match/m1'))
  await settle()
  expect(db.reads).toBe(0)
  fireEvent.click(screen.getByRole('link', { name: 'leave' }))
  expect(await screen.findByRole('dialog', { name: 'Today' })).toBeInTheDocument()
})

it('a failed read shows nothing and is tried again when the app comes back to the front', async () => {
  resetDb(monday())
  db.errors.schedule_items = { message: 'down' }
  const muted = vi.spyOn(toast, 'withNetworkToastsMuted')
  render(tree('/admin/eagles/home'))
  await settle()
  expect(muted).toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(isHandled('L1', '2026-10-12')).toBe(false)
  db.errors = {}
  comeBack()
  expect(await screen.findByRole('dialog', { name: 'Today' })).toBeInTheDocument()
})

it('an app left open past midnight shows the new day on coming back', async () => {
  resetDb({ schedule_items: [item({ id: 'gym', title: 'Gym' }), item({ id: 'tue', title: 'Call the referee', item_date: '2026-10-13' })] })
  vi.setSystemTime(new Date(2026, 9, 12, 23, 30))
  render(tree('/admin/eagles/home'))
  fireEvent.click(await screen.findByRole('button', { name: 'Got it' }))
  vi.setSystemTime(new Date(2026, 9, 13, 0, 30))
  comeBack()
  const dialog = await screen.findByRole('dialog', { name: 'Today' })
  expect(dialog).toHaveTextContent('Tuesday, October 13, 2026')
  expect(dialog).toHaveTextContent('Call the referee')
  expect(dialog).not.toHaveTextContent('Gym')
})

it('opens once under StrictMode', async () => {
  resetDb(monday())
  render(<StrictMode>{tree('/admin/eagles/home')}</StrictMode>)
  expect(await screen.findAllByRole('dialog')).toHaveLength(1)
  expect(isHandled('L1', '2026-10-12')).toBe(true)
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/TodayReminder.test.tsx`
Expected: FAIL, the component does not exist.

- [ ] **Step 3: Implement `src/components/TodayReminder.tsx`** to "Behaviour to implement" above

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/components/TodayReminder.test.tsx`
Expected: PASS (10 tests).

- [ ] **Step 5: Write the failing layout test** in `src/layouts/AdminLayout.test.tsx`: add the mock beside the file's other `vi.mock` calls, and the test

```tsx
vi.mock('../components/TodayReminder', () => ({ default: () => <div data-testid="today-reminder" /> }))

it("carries the once-a-day check for today's items", () => {
  renderAt('/admin/eagles/players')
  expect(screen.getByTestId('today-reminder')).toBeInTheDocument()
})
```

- [ ] **Step 6: Run it to see it fail**

Run: `npx vitest run src/layouts/AdminLayout.test.tsx`
Expected: FAIL on the new test only.

- [ ] **Step 7: Render `<TodayReminder />` in `src/layouts/AdminLayout.tsx`**, after `</main>` inside the layout's root element

- [ ] **Step 8: Run both files**

Run: `npx vitest run src/components/TodayReminder.test.tsx src/layouts/AdminLayout.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/TodayReminder.tsx src/components/TodayReminder.test.tsx src/layouts/AdminLayout.tsx src/layouts/AdminLayout.test.tsx
git commit -m "feat: the first open of the day shows today's items once per league"
```

---

### Task 5: The Today card on Home

**Files:**
- Modify: `src/pages/admin/HomePage.tsx`
- Modify: `src/locales/en.json`, `src/locales/ar.json` (the `today.count` forms)
- Test: `src/pages/admin/HomePage.test.tsx`

**Interfaces:**
- Consumes: `fetchToday` (Task 1); `TodayList` (Task 3); `TodayRow`; `localToday`.
- Produces: nothing used elsewhere.

**Behaviour to implement:**

- `HomePage` reads `useFeature('schedule')` and `useFeature('training')`, and adds one more request to its existing `Promise.all`: `fetchToday(forLeague, localToday(), training)` with a failure turned into an empty list, or an empty list at once without `schedule`. Both features join the effect's dependencies. `HomeData` gains `today: TodayRow[]`.
- A `TodayBlock` in the same file, written like `TodoBlock`, is rendered between `LiveBlock` and `TodoBlock` only when there are rows: a `<section aria-label={t('today.title')}>` with the card's classes; an `<h2>` holding a link to `adminPath('/schedule')` with the text `today.title`; beside it `t('today.count', { count: rows.length })` in small grey text; then `<TodayList rows={rows} label={t('today.title')} />`.

- [ ] **Step 1: Write the failing tests** in `src/pages/admin/HomePage.test.tsx` (it has `h.rows` and `renderHome`; add `within` to the Testing Library import, and import `localToday` from `../../utils/trainingDays` and `inArabic` from `../../test/arabic`)

```tsx
describe('the Today card', () => {
  const day = localToday()
  const item = (over: Record<string, unknown>) => ({
    league_id: 'L1', kind: 'task', title: 'Item', item_date: day, start_time: null, end_time: null, note: null,
    repeat_days: [], repeat_until: null, skipped_dates: [], done_dates: [], ...over,
  })
  const seed = () => {
    h.rows.schedule_items = [
      item({ id: 'gym', kind: 'training', title: 'Gym', start_time: '08:00:00' }),
      item({ id: 'done', title: 'Done already', done_dates: [day] }),
      item({ id: 'old', title: 'Yesterday', item_date: '2020-01-01' }),
    ]
    h.rows.trainings = [{ id: 'p1', league_id: 'L1', training_date: day, title: 'Passing day' }]
  }
  const card = () => screen.findByRole('region', { name: 'Today' })

  it("lists today's items above To do, each a link, with their number", async () => {
    seed()
    renderHome()
    const region = await card()
    expect(within(region).getByRole('link', { name: 'Today' })).toHaveAttribute('href', '/admin/eagles/schedule')
    expect(within(region).getByText('2 items')).toBeInTheDocument()
    const links = within(within(region).getByRole('list')).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['08:00Gym', 'Training planPassing day'])
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/admin/eagles/schedule', '/admin/eagles/trainings/p1'])
    const todo = screen.getByRole('heading', { name: 'To do' })
    expect(region.compareDocumentPosition(todo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('says "1 item" for one', async () => {
    h.rows.schedule_items = [item({ id: 'gym', title: 'Gym' })]
    renderHome()
    expect(within(await card()).getByText('1 item')).toBeInTheDocument()
  })

  it('is left out on a day with nothing', async () => {
    h.rows.schedule_items = [item({ id: 'old', item_date: '2020-01-01' })]
    renderHome()
    await screen.findByRole('heading', { name: 'To do' })
    expect(screen.queryByRole('region', { name: 'Today' })).not.toBeInTheDocument()
  })

  it('is left out, and nothing is asked, without the schedule feature', async () => {
    seed()
    renderHome(FEATURES.filter((f) => f !== 'schedule'))
    // A read of the schedule would never be answered, and Home would never finish loading
    db.holds.schedule_items = new Promise(() => {})
    await screen.findByRole('heading', { name: 'To do' })
    expect(screen.queryByRole('region', { name: 'Today' })).not.toBeInTheDocument()
  })

  it('shows training plans only with the training feature', async () => {
    seed()
    renderHome(FEATURES.filter((f) => f !== 'training'))
    const region = await card()
    expect(within(region).getByText('1 item')).toBeInTheDocument()
    expect(region).not.toHaveTextContent('Passing day')
  })

  it('is left out when the schedule cannot be read, and the rest of Home still shows', async () => {
    seed()
    renderHome()
    db.errors.schedule_items = { message: 'down' }
    expect(await screen.findByRole('heading', { name: 'To do' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Today' })).not.toBeInTheDocument()
  })

  it('speaks Arabic', async () => {
    h.rows.schedule_items = [item({ id: 'gym', title: 'Gym' })]
    await inArabic(async () => {
      renderHome()
      const region = await screen.findByRole('region', { name: 'اليوم' })
      expect(within(region).getByText('عنصر واحد')).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/pages/admin/HomePage.test.tsx`
Expected: the new tests that look for the card FAIL (no region named Today).

- [ ] **Step 3: Add the `today.count` forms to both locale files** (copy in the "Copy" section; Arabic has six forms; check the line endings)

- [ ] **Step 4: Implement the request and `TodayBlock` in `src/pages/admin/HomePage.tsx`** to "Behaviour to implement" above

- [ ] **Step 5: Update the read counts in the existing test** `asks all its questions at once instead of waiting for the session list first`

With every feature on, Home now makes four more reads: two on `schedule_items` and one on `trainings` before the held `sessions` answer, and one more on `sessions` after. The two expectations become `expect(db.reads).toBe(6)` and `expect(db.reads).toBe(9)`. Extend the comment above the first to name the schedule and training plans.

- [ ] **Step 6: Run the file**

Run: `npx vitest run src/pages/admin/HomePage.test.tsx`
Expected: PASS, the new tests and every existing one.

- [ ] **Step 7: Commit**

```bash
git diff --numstat src/locales/
git add src/pages/admin/HomePage.tsx src/pages/admin/HomePage.test.tsx
git -c core.autocrlf=false add src/locales/en.json src/locales/ar.json
git commit -m "feat: a Today card on Home with today's items"
```

---

### Task 6: The whole suite and the build

**Files:** none, unless a failure needs a fix.

- [ ] **Step 1: Run every test**

Run: `npm test`
Expected: every file passes; the baseline before this work was 123 files and 973 tests, so both numbers are higher and nothing fails.

- [ ] **Step 2: Type-check and build**

Run: `npm run build`
Expected: finishes without errors.

- [ ] **Step 3: Check the locale files' line endings one last time**

Run: `git diff --numstat origin/main -- src/locales/`
Expected: about ten lines per file (the `today` block and one changed comma), not the whole file.

- [ ] **Step 4: Report and stop**

Report the test and build results. Do not push, open a pull request or merge: ask the user first.
