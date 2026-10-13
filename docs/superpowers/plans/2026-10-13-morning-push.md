# Morning Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A coach with the `schedule` feature gets one notification each morning, at the hour he chose on that device, listing what is on that day across his leagues, with the app closed.

**Architecture:** Web Push end to end. The device's push address is saved in a new table through one database function. A `pg_cron` job calls an edge function every 15 minutes; the function's decisions (who is due, what the text says, what to do with each answer) are pure TypeScript in the folder the app and the functions already share, tested with Vitest, and the function itself is a thin shell around them and the `web-push` library. In the app: a push handler file loaded by the generated service worker, one module for everything push-related on the device, a dialog on the schedule page, and real icon files drawn by a script.

**Tech Stack:** React 19 + TypeScript, Vite + vite-plugin-pwa (Workbox `generateSW`), Vitest + Testing Library with the in-memory Supabase fake, Supabase (Postgres 17 with `pg_cron`, `pg_net`, Vault; Edge Functions on Deno 2), `npm:web-push@3`, Node 24 for scripts.

**Spec:** `docs/superpowers/specs/2026-10-13-morning-push-design.md`

## Global Constraints

- Work on branch `feat/morning-push` in `E:\Score-Leader\.claude\worktrees\morning-push`; never commit to `main`.
- **The live system.** Tasks 1–10 change nothing live. Task 3 rehearses the migration on the live database with `bash scripts/rehearse.sh`, inside one transaction that always rolls back, as earlier work did; it needs `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` (the latter from `ZURICH_DB_PASSWORD`) out of `E:\Score-Leader\.env.zurich.local`. Everything in "Rollout" at the end waits for the user's go-ahead: applying the migration, secrets, Vault values, deploying the function, pushing, merging.
- Files under `supabase/functions/_shared/` run both in Deno and in the app: relative imports only, each ending in `.ts`; no `npm:` or `node:` imports; no DOM; `Intl` and `Date` are fine.
- The storage keys are exactly `scoreleader.push` (this device's chosen hour, JSON `{ "hour": 7 }`) on the device, and the Vault names `morning_push_url` and `morning_push_secret`.
- The function's secrets are exactly `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `MORNING_PUSH_SECRET`; the app's public key is `VITE_VAPID_PUBLIC_KEY`.
- Icon colours: tile `#111827`, mark `#FFFFFF`, line `#22C55E`.
- Every new user-visible string goes into both locale files with the copy in "Copy"; English is exact. The locale files keep their line endings: they are changed only by a script that reads and writes bytes and adds lines ending in CRLF, never with an editor; `git diff --numstat` must show added lines only, and they are staged with `git -c core.autocrlf=false add`.
- Admin links use `useAdminPath()`; the league comes from `useLeague()`; features from `useFeature()`.
- Tests that depend on the date fake only the clock (`vi.useFakeTimers({ toFake: ['Date'] })`).
- Each task ends green on `npx vitest run <its test files>`. If the machine is busy and unrelated slow tests hit the 5 s limit, `--testTimeout=30000` settles whether it is load.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A time zone the server cannot read** (junk, or a name the browser knows and Deno does not): that device is skipped, and the round goes on for everyone else. Pinned in Task 4.
2. **A message too big for the push services** (they refuse above about 4 KB): five long titles with emoji and long league names must still fit, so every line is cut at 80 characters. Pinned in Task 4.
3. **The permission question dismissed without an answer** (permission stays `default`, not `denied`): the dialog goes back to Off, not to Blocked. Pinned in Tasks 7 and 8.
4. **A function deployed without its job secret** (an empty or missing `MORNING_PUSH_SECRET`): a caller sending `Bearer ` and nothing else must not be taken for the job. Pinned in Task 5.
5. **Signing out with no connection:** giving the address back must not keep the coach signed in; sign-out finishes within two seconds whatever the network does. Pinned in Task 9.

---

## File structure

| File | Responsibility |
|---|---|
| `supabase/functions/_shared/scheduleDay.ts` | the day logic, moved from `src/utils/schedule.ts` |
| `src/utils/schedule.ts` | re-exports it; keeps the calendar grids, the form and the layout |
| `scripts/makeIcons.ts` | draws the tile; writes the SVG and the PNG files |
| `public/favicon.svg`, `public/apple-touch-icon.png`, `public/icons/*.png` | the icons |
| `supabase/migrations/20261013000001_morning_push.sql` | table, rules, save function, extensions, kick function, jobs |
| `supabase/tests/tenancy.test.sql` | database rules tests |
| `supabase/functions/_shared/morningPush.ts` | pure: clock, due, text, caller kind, the round and the test send |
| `supabase/functions/_shared/morningPushData.ts` | the round's reads and writes over a Supabase client handed in |
| `supabase/functions/send-morning-push/index.ts` | the shell: environment, clients, `web-push`, HTTP |
| `supabase/config.toml` | `verify_jwt = false` for the function |
| `public/push-sw.js` | the service worker's push and tap handlers |
| `vite.config.ts`, `index.html` | load `push-sw.js`; manifest icons; icon links and iPhone tags |
| `src/lib/push.ts` | everything push-related on the device |
| `src/components/MorningPushDialog.tsx` | the dialog |
| `src/pages/admin/SchedulePage.tsx` | the bell button |
| `src/layouts/AdminLayout.tsx`, `src/hooks/useAuth.ts` | keep right on open; forget on sign-out |
| `src/test/fakeSupabase.ts` | function calls logged and answerable |
| `scripts/makePushKeys.ts` | makes the key pair and the job secret |
| `.env.example`, `.env.production` | the public key |
| `src/locales/en.json`, `src/locales/ar.json` | copy |

## Copy

A new top-level block `push`, after `today`, in both files.

| Key | English | Arabic |
|---|---|---|
| `push.title` | Morning notification | إشعار الصباح |
| `push.bellOff` | Morning notification: off | إشعار الصباح: متوقف |
| `push.bellOn` | Morning notification: on, {{time}} | إشعار الصباح: مفعّل، {{time}} |
| `push.intro` | Each morning, a notification with what is on your schedule that day. Nothing is sent on a day with nothing on it. | كل صباح، إشعار بما في جدولك لذلك اليوم. لا يُرسل شيء في يوم بلا مواعيد. |
| `push.hour` | Time | الوقت |
| `push.titlesShown` | The titles of your items appear in the notification. | تظهر عناوين مواعيدك في الإشعار. |
| `push.turnOn` | Turn on | تفعيل |
| `push.turnOff` | Turn off | إيقاف |
| `push.test` | Send a test now | إرسال تجربة الآن |
| `push.testSent` | Sent. It should arrive in a moment. | تم الإرسال. سيصل بعد لحظات. |
| `push.testFailed` | Could not send. Try again. | تعذّر الإرسال. حاول مرة أخرى. |
| `push.saveFailed` | Could not save. Check your connection and try again. | تعذّر الحفظ. تحقق من الاتصال وحاول مرة أخرى. |
| `push.unsupported` | This browser cannot show notifications from the app. | هذا المتصفح لا يستطيع عرض إشعارات التطبيق. |
| `push.needsInstall` | On an iPhone or iPad, add the app to the Home Screen first: tap Share, then Add to Home Screen. Open it from there and turn the notification on. | على الآيفون أو الآيباد، أضف التطبيق إلى الشاشة الرئيسية أولاً: اضغط «مشاركة» ثم «إضافة إلى الشاشة الرئيسية». افتحه من هناك وفعّل الإشعار. |
| `push.blocked` | Notifications are blocked for this app. Allow them in your browser or phone settings, then come back here. | الإشعارات محظورة لهذا التطبيق. اسمح بها من إعدادات المتصفح أو الهاتف ثم عد إلى هنا. |
| `push.close` | Close | إغلاق |

The words the function uses (Task 4), which a test holds equal to the locale files where they exist there:

| | English | Arabic | Locale key |
|---|---|---|---|
| today | Today | اليوم | `today.title` |
| session | Match session | جلسة مباريات | `schedule.session` |
| plan | Training plan | خطة تدريب | `schedule.plan` |
| count | 1 item / {{count}} items | the six forms | `today.count_*` |
| more | +{{count}} more | +{{count}} أخرى | (function only) |
| sample | Nothing on your schedule today. Your morning notification will appear here. | لا شيء في جدولك اليوم. هنا سيظهر إشعار الصباح. | (function only) |

---

### Task 1: The day logic moves to the shared folder

**Files:**
- Create: `supabase/functions/_shared/scheduleDay.ts`, `supabase/functions/_shared/scheduleDay.test.ts`
- Modify: `src/utils/schedule.ts`

**Interfaces:**
- Produces, from `scheduleDay.ts` (moved unchanged, comments included): `ScheduleKind`, `ScheduleItem`, `ScheduleExtras`, `weekdayOf`, `RepeatMode`, `repeatModeOf`, `occursOn`, `itemsOn`, `isDone`, `timeLabel`, `DotKind`, `TodayRow`, `todayRows`. `src/utils/schedule.ts` exports exactly what it did before.

- [ ] **Step 1: Write the failing test** `supabase/functions/_shared/scheduleDay.test.ts`

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { itemsOn, occursOn, todayRows, type ScheduleItem } from './scheduleDay.ts'

const item = (over: Partial<ScheduleItem> = {}): ScheduleItem => ({
  id: 'i1', kind: 'task', title: 'Book the pitch', item_date: '2026-10-12', start_time: null, end_time: null, note: null,
  repeat_days: [], repeat_every: 1, repeat_monthly: false, repeat_until: null, skipped_dates: [], done_dates: [], ...over,
})

it('holds the day logic the app and the server function share', () => {
  const weekly = item({ id: 'w', item_date: '2026-10-05', repeat_days: [1], start_time: '18:00:00' })
  expect(occursOn(weekly, '2026-10-12')).toBe(true)
  expect(itemsOn([item(), weekly], '2026-10-12').map((i) => i.id)).toEqual(['w', 'i1'])
  expect(todayRows([item({ done_dates: ['2026-10-12'] })], { sessions: [{ id: 's1', date: '2026-10-12' }], plans: [] }, '2026-10-12'))
    .toEqual([{ kind: 'session', id: 's1', dot: 'session', time: null, title: null }])
})

// The server function runs in Deno: a shared file may only import its neighbours, by their full name
it.each(['scheduleDay.ts', 'morningPush.ts', 'morningPushData.ts'])('%s imports nothing Deno cannot load', (name) => {
  let source: string
  try { source = readFileSync(resolve(__dirname, name), 'utf8') } catch { return } // not written yet
  const paths = [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
  for (const path of paths) expect(path).toMatch(/^\.\/[A-Za-z]+\.ts$/)
})

it('the app still gets everything from src/utils/schedule', async () => {
  const app = await import('../../../src/utils/schedule.ts')
  for (const name of ['occursOn', 'itemsOn', 'isDone', 'timeLabel', 'todayRows', 'repeatModeOf', 'weekdayOf', 'monthGrid', 'layoutDay', 'draftToRow']) {
    expect(app).toHaveProperty(name)
  }
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run supabase/functions/_shared/scheduleDay.test.ts`
Expected: FAIL, `./scheduleDay.ts` cannot be resolved.

- [ ] **Step 3: Move the code**

Create `scheduleDay.ts` with the listed exports and the private helpers they need (`toUtc`, `daysBetween`, `hm`, `DAY_MS`), under a header comment saying it is shared with the server function and must import nothing. In `src/utils/schedule.ts` delete what moved, add `export * from '../../supabase/functions/_shared/scheduleDay.ts'`, and import from that file whatever the remaining code still uses (as `src/lib/features.ts` does for `features.ts`). A private helper both files need (`toUtc`, `two`) stays private in each.

- [ ] **Step 4: Run the shared test and every test that uses the day logic**

Run: `npx vitest run supabase/functions/_shared/scheduleDay.test.ts src/utils/schedule.test.ts src/lib/scheduleApi.test.ts src/pages/admin/SchedulePage.test.tsx src/components/TodayReminder.test.tsx`
Expected: PASS, with no change to any existing test.

- [ ] **Step 5: Type-check and commit**

Run: `npm run typecheck` — Expected: no errors.

```bash
git add supabase/functions/_shared/scheduleDay.ts supabase/functions/_shared/scheduleDay.test.ts src/utils/schedule.ts
git commit -m "refactor: the schedule's day logic lives where the server functions can use it"
```

---

### Task 2: The app's icons

**Files:**
- Create: `scripts/makeIcons.ts`, `scripts/makeIcons.test.ts`, `src/appIcons.test.ts`
- Create (written by the script): `public/favicon.svg`, `public/apple-touch-icon.png`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-512.png`, `public/icons/badge-96.png`
- Modify: `vite.config.ts` (manifest icons, `includeAssets`), `index.html`

**Interfaces:**
- Produces, from `scripts/makeIcons.ts`:
  ```ts
  // RGBA pixels, row by row
  export function drawTile(size: number, opts: { cell: number; background: boolean; line: boolean }): Uint8Array
  export function encodePng(size: number, rgba: Uint8Array): Buffer
  // Reads back a PNG written by encodePng (8-bit RGBA, no filtering)
  export function decodePng(png: Buffer): { size: number; rgba: Uint8Array }
  export function faviconSvg(): string
  // Every file the script writes, with the pixels it should hold (the SVG has none)
  export const ICONS: { path: string; size: number; cell: number; background: boolean; line: boolean }[]
  ```
  Run as `node scripts/makeIcons.ts`, it writes every file; imported, it writes nothing.

**The drawing (one definition for every size).** A grid of cells: the letters are 5 rows of `####`, `#...`, `####`, `...#`, `####` (S) and `#...`, `#...`, `#...`, `#...`, `####` (L), two empty columns between them, so the mark is 10 cells wide and 5 high. One empty row under it, then a line 10 cells wide and half a cell thick. Mark and line together are centred in the tile. `cell` is a fraction of the size. Rectangle edges are rounded to whole pixels.

| File | size | cell | background | line |
|---|---|---|---|---|
| `public/icons/icon-192.png` | 192 | 0.06 | yes | yes |
| `public/icons/icon-512.png` | 512 | 0.06 | yes | yes |
| `public/apple-touch-icon.png` | 180 | 0.06 | yes | yes |
| `public/icons/icon-maskable-512.png` | 512 | 0.048 | yes | yes |
| `public/icons/badge-96.png` | 96 | 0.08 | no (transparent) | no |

`faviconSvg()` is the 0.06 tile as `<rect>`s in a `0 0 100 100` view box.

- [ ] **Step 1: Write the failing tests**

`scripts/makeIcons.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { decodePng, drawTile, encodePng, faviconSvg, ICONS } from './makeIcons.ts'

const root = resolve(__dirname, '..')
const at = (rgba: Uint8Array, size: number, x: number, y: number) => [...rgba.slice((y * size + x) * 4, (y * size + x) * 4 + 4)]
const DARK = [0x11, 0x18, 0x27, 255], WHITE = [255, 255, 255, 255], GREEN = [0x22, 0xc5, 0x5e, 255]

it('draws a dark tile with a white SL and a green line under it', () => {
  const size = 100
  const px = drawTile(size, { cell: 0.06, background: true, line: true })
  expect(at(px, size, 2, 2)).toEqual(DARK)
  // The mark is 60 wide and 39 high (5 rows, a gap row, half a row), centred: it starts at 20, 30.5
  expect(at(px, size, 22, 33)).toEqual(WHITE)   // top-left of the S
  expect(at(px, size, 28, 39)).toEqual(DARK)    // the S's first hollow
  expect(at(px, size, 58, 33)).toEqual(WHITE)   // the L's upright
  expect(at(px, size, 70, 33)).toEqual(DARK)    // right of the L's upright
  expect(at(px, size, 50, 68)).toEqual(GREEN)   // the line
})

it('the badge is the white mark alone on nothing', () => {
  const px = drawTile(96, { cell: 0.08, background: false, line: false })
  expect(at(px, 96, 1, 1)).toEqual([0, 0, 0, 0])
  const colours = new Set<string>()
  for (let i = 0; i < px.length; i += 4) colours.add(px.slice(i, i + 4).join(','))
  expect([...colours].sort()).toEqual(['0,0,0,0', '255,255,255,255'])
})

it('the maskable icon keeps the mark inside the circle a phone may cut', () => {
  const size = 512
  const px = drawTile(size, { cell: 0.048, background: true, line: true })
  let outside = 0
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const far = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) > size * 0.4
    if (far && at(px, size, x, y).join() !== DARK.join()) outside++
  }
  expect(outside).toBe(0)
})

it('writes a PNG another program can read, and reads its own back', () => {
  const px = drawTile(64, { cell: 0.06, background: true, line: true })
  const png = encodePng(64, px)
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  expect(png.readUInt32BE(16)).toBe(64)  // width in the header
  expect(png.readUInt32BE(20)).toBe(64)  // height
  expect([png[24], png[25]]).toEqual([8, 6]) // 8 bits, red green blue alpha
  expect(decodePng(png)).toEqual({ size: 64, rgba: px })
})

it.each(ICONS)('the committed $path is what the script draws', ({ path, size, cell, background, line }) => {
  const committed = decodePng(readFileSync(resolve(root, path)))
  expect(committed.size).toBe(size)
  expect(Buffer.from(committed.rgba).equals(Buffer.from(drawTile(size, { cell, background, line })))).toBe(true)
})

it('the committed favicon is what the script draws', () => {
  expect(readFileSync(resolve(root, 'public/favicon.svg'), 'utf8')).toBe(faviconSvg())
  expect(faviconSvg()).toContain('viewBox="0 0 100 100"')
})
```

`src/appIcons.test.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')
const html = readFileSync(resolve(root, 'index.html'), 'utf8')
const config = readFileSync(resolve(root, 'vite.config.ts'), 'utf8')

it('the page names the tab icon and the iPhone home-screen icon', () => {
  expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />')
  expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />')
  expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />')
  expect(html).toContain('<meta name="mobile-web-app-capable" content="yes" />')
  expect(html).toContain('<meta name="apple-mobile-web-app-title" content="ScoreLeader" />')
})

it('every icon the manifest and the page name is a real file', () => {
  const named = [...config.matchAll(/src: '([^']+\.png)'/g)].map((m) => m[1])
  expect(named.sort()).toEqual(['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'])
  for (const path of [...named, 'favicon.svg', 'apple-touch-icon.png', 'icons/badge-96.png']) {
    expect(existsSync(resolve(root, 'public', path)), path).toBe(true)
  }
})

it('the maskable icon is listed as maskable and the others as plain', () => {
  expect(config).toMatch(/src: 'icons\/icon-maskable-512\.png'[^}]*purpose: 'maskable'/)
  expect(config).toMatch(/src: 'icons\/icon-512\.png'[^}]*purpose: 'any'/)
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run scripts/makeIcons.test.ts src/appIcons.test.ts`
Expected: FAIL, `./makeIcons.ts` cannot be resolved; the page and config tests fail on the missing tags and files.

- [ ] **Step 3: Implement `scripts/makeIcons.ts`**

PNG by hand with `node:zlib` (`deflateSync`) and a CRC-32 table: signature, `IHDR` (8-bit, colour type 6), one `IDAT` whose rows each start with filter byte 0, `IEND`. `decodePng` inflates the `IDAT` data and drops the filter bytes. The file writes its outputs only when it is the program being run (`import.meta.url` against `process.argv[1]`).

- [ ] **Step 4: Write the files**

Run: `node scripts/makeIcons.ts`
Expected: six files written under `public/`.

- [ ] **Step 5: Update `vite.config.ts` and `index.html`**

Manifest `icons`: `icons/icon-192.png` (192x192, purpose `any`), `icons/icon-512.png` (512x512, purpose `any`), `icons/icon-maskable-512.png` (512x512, purpose `maskable`). `includeAssets`: `favicon.svg`, `apple-touch-icon.png`, `icons/badge-96.png`. In `index.html`'s head, after the theme colour, the five lines the test names.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run scripts/makeIcons.test.ts src/appIcons.test.ts src/startupScreen.test.ts`
Expected: PASS.

- [ ] **Step 7: Look at the icons, then commit**

Open `public/icons/icon-512.png` and `public/icons/icon-maskable-512.png` with the Read tool and check the tile reads as "SL" over a green line.

```bash
git add scripts/makeIcons.ts scripts/makeIcons.test.ts src/appIcons.test.ts public vite.config.ts index.html
git commit -m "feat: the app has its icons: a dark tile with SL, for the tab, the home screen and notifications"
```

---

### Task 3: The database

**Files:**
- Create: `supabase/migrations/20261013000001_morning_push.sql`
- Modify: `supabase/tests/tenancy.test.sql` (a new section above `-- Later tests go above this line.`; the header comment gains the new fixture ids)

**Interfaces:**
- Produces: table `public.push_subscriptions` (columns as in the spec, section 3); `public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_time_zone text, p_notify_hour int, p_language text) RETURNS void`; `public.kick_morning_push() RETURNS void`; jobs `morning-push` (`*/15 * * * *`) and `purge-cron-history` (`0 3 * * *`).

- [ ] **Step 1: Write the failing database tests** in `supabase/tests/tenancy.test.sql`, in the file's own style (`pg_temp.act_as`, `expect`, `expect_error`, `expect_count`)

The section starts by clearing, inside the rehearsal's transaction, what the rollout will later leave behind, so the checks give the same answer before and after it: `DELETE FROM public.push_subscriptions;` and `DELETE FROM vault.secrets WHERE name IN ('morning_push_url', 'morning_push_secret');`. Queued requests are counted by their address (`url = 'https://example.test/fn'`), never in total.

Checks, each with a label that says what it proves:

1. As A: `save_push_subscription('https://push.test/a1', 'key', 'auth', 'Asia/Riyadh', 7, 'ar')` adds one row owned by A with `last_sent_on` NULL.
2. As A: the same address again with hour 9 and `'en'` leaves one row, now hour 9, language `en`, a later `updated_at`.
3. As A: a direct `INSERT` and a direct `UPDATE` on the table are refused (`permission denied`).
4. As B: `SELECT count(*)` of the table is 0; `DELETE` of A's row affects 0 rows.
5. As the superadmin and as a visitor: 0 rows read; the visitor's call of the save function is refused.
6. Set A's row `last_sent_on = '2026-10-13'` (as the test's own role). As A, saving the same address again keeps `last_sent_on`. As B, saving that address makes B the owner and clears `last_sent_on`; A now reads 0 rows.
7. Refusals of the save function, as A: hour 24 (`push_subscriptions_hour_check`); language `'fr'` (`push_subscriptions_language_check`); an address not starting with `https://` (`push_subscriptions_endpoint_check`); a time zone of `'Not a zone!'` (`push_subscriptions_time_zone_check`); an empty key (`push_subscriptions_keys_check`).
8. A without `schedule` (remove it as line 864 does, restore it after): the save is refused (`schedule feature needed`). The disabled admin D: refused.
9. As A: `DELETE` of his own row affects 1 row.
10. Deleting a coach removes his devices: the table's one foreign key is `ON DELETE CASCADE` (`confdeltype = 'c'` in `pg_constraint` for `conrelid = 'public.push_subscriptions'::regclass AND contype = 'f'`).
11. `kick_morning_push()`: as A, calling it is refused (`permission denied`). As the test's own role, with the table empty: no queued request to that address. With one row in the table and no Vault values: still none. After `vault.create_secret('https://example.test/fn', 'morning_push_url')` and `vault.create_secret('s3cret', 'morning_push_secret')`: exactly one queued request, to `https://example.test/fn`, whose headers hold `Authorization` = `Bearer s3cret`.
12. `cron.job` holds `morning-push` with schedule `*/15 * * * *` and `purge-cron-history` with `0 3 * * *`.

- [ ] **Step 2: Rehearse to see it fail**

Run (Git Bash, credentials exported from `E:\Score-Leader\.env.zurich.local` by a small script file, not inline): `bash scripts/rehearse.sh`
Expected: `REHEARSAL FAILED`, with `relation "public.push_subscriptions" does not exist` or `function public.save_push_subscription ... does not exist`. Nothing is kept: the transaction rolls back.

- [ ] **Step 3: Write the migration** `supabase/migrations/20261013000001_morning_push.sql`

```sql
-- Morning push: each device that wants the morning notification, the function that saves one,
-- and the job that calls the server function every 15 minutes. Only adds; nothing is sent
-- until a coach turns the notification on and the two Vault values are set.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ===== Devices

-- One row per browser. endpoint, p256dh and auth come from the browser's push subscription;
-- time_zone is an IANA name; last_sent_on is the device's local day last handled.
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.admin_profiles(user_id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  time_zone text NOT NULL,
  notify_hour smallint NOT NULL,
  language text NOT NULL,
  last_sent_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_subscriptions_endpoint_check CHECK (endpoint LIKE 'https://%' AND char_length(endpoint) <= 2000),
  CONSTRAINT push_subscriptions_keys_check CHECK (char_length(p256dh) BETWEEN 1 AND 200 AND char_length(auth) BETWEEN 1 AND 200),
  CONSTRAINT push_subscriptions_time_zone_check CHECK (time_zone ~ '^[A-Za-z0-9_+/-]{1,64}$'),
  CONSTRAINT push_subscriptions_hour_check CHECK (notify_hour BETWEEN 0 AND 23),
  CONSTRAINT push_subscriptions_language_check CHECK (language IN ('en', 'ar'))
);
CREATE INDEX push_subscriptions_user_id_idx ON public.push_subscriptions (user_id);

-- ===== Security rules: a coach reads and deletes his own devices; rows are written only by
-- save_push_subscription

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_subscriptions FROM anon, authenticated;
GRANT SELECT, DELETE ON public.push_subscriptions TO authenticated;

CREATE POLICY "own devices read" ON public.push_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "own devices delete" ON public.push_subscriptions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Adds this device, or updates it when its address is already stored. Whoever holds the
-- address and its keys holds the device, so a second coach signing in on the same browser
-- takes the row over; the day already handled is then forgotten.
CREATE FUNCTION public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_time_zone text, p_notify_hour int, p_language text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.caller_has_feature('schedule') THEN
    RAISE EXCEPTION 'schedule feature needed';
  END IF;
  INSERT INTO public.push_subscriptions AS s (user_id, endpoint, p256dh, auth, time_zone, notify_hour, language)
  VALUES (auth.uid(), p_endpoint, p_p256dh, p_auth, p_time_zone, p_notify_hour, p_language)
  ON CONFLICT (endpoint) DO UPDATE SET
    last_sent_on = CASE WHEN s.user_id = EXCLUDED.user_id THEN s.last_sent_on END,
    user_id = EXCLUDED.user_id,
    p256dh = EXCLUDED.p256dh,
    auth = EXCLUDED.auth,
    time_zone = EXCLUDED.time_zone,
    notify_hour = EXCLUDED.notify_hour,
    language = EXCLUDED.language,
    updated_at = now();
END $$;

REVOKE ALL ON FUNCTION public.save_push_subscription(text, text, text, text, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_push_subscription(text, text, text, text, int, text) TO authenticated;

-- ===== The job

-- Calls the server function that sends the morning notifications. Quiet while nobody has
-- turned the notification on, and until the function's address and the job's secret are in
-- Vault under these two names (they are set by hand, never written in a migration).
CREATE FUNCTION public.kick_morning_push()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target text;
  secret text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.push_subscriptions) THEN RETURN; END IF;
  SELECT decrypted_secret INTO target FROM vault.decrypted_secrets WHERE name = 'morning_push_url';
  SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name = 'morning_push_secret';
  IF target IS NULL OR secret IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := target,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
END $$;

REVOKE ALL ON FUNCTION public.kick_morning_push() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('morning-push', '*/15 * * * *', 'SELECT public.kick_morning_push()');
-- The job history grows by 96 rows a day
SELECT cron.schedule('purge-cron-history', '0 3 * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days'$$);
```

- [ ] **Step 4: Rehearse to see it pass**

Run: `bash scripts/rehearse.sh`
Expected: `TENANCY TESTS PASSED`. If a statement of the migration itself is refused by the live database (an extension's schema, a grant), fix the migration, not the test, and rehearse again.

- [ ] **Step 5: Confirm nothing was kept**

Run a read-only query: `select count(*) from pg_extension where extname in ('pg_cron','pg_net')`
Expected: `0`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261013000001_morning_push.sql supabase/tests/tenancy.test.sql
git commit -m "feat: devices for the morning notification, the function that saves one, and the job that sends (database)"
```

---

### Task 4: Who is due, and what the notification says

**Files:**
- Create: `supabase/functions/_shared/morningPush.ts`, `supabase/functions/_shared/morningPush.test.ts`

**Interfaces:**
- Consumes: `TodayRow` from `./scheduleDay.ts`.
- Produces:
  ```ts
  export type PushLanguage = 'en' | 'ar'
  export interface PushSub {
    id: string; user_id: string; endpoint: string; p256dh: string; auth: string
    time_zone: string; notify_hour: number; language: PushLanguage; last_sent_on: string | null
  }
  // A device with what the round needs to know about its coach
  export interface CoachSub extends PushSub { coach: { enabled: boolean; features: string[] } }
  export interface LeagueDay { name: string; slug: string; rows: TodayRow[] }
  export interface PushMessage { title: string; body: string; url: string; tag: string; lang: PushLanguage; dir: 'ltr' | 'rtl' }

  // The date ('2026-10-13') and hour (0–23) on the clock of a time zone; null for a zone that cannot be read
  export function localClock(timeZone: string, now: Date): { date: string; hour: number } | null
  // The local day a device is due for, or null when it is not due now
  export function dueDate(sub: Pick<PushSub, 'time_zone' | 'notify_hour' | 'last_sent_on'>, now: Date): string | null
  // null when no league has a row
  export function buildMessage(language: PushLanguage, date: string, leagues: LeagueDay[]): PushMessage | null
  export function sampleMessage(language: PushLanguage, date: string): PushMessage
  export const WORDS: Record<PushLanguage, { today: string; session: string; plan: string; more: string; sample: string; count: Record<string, string> }>
  ```

**Rules the tests pin:**
- `localClock` uses `Intl.DateTimeFormat('en-CA', { timeZone, hourCycle: 'h23', year, month, day, hour })` and its parts; a `RangeError` gives null.
- Due: the clock's hour is `notify_hour` or `notify_hour + 1` (never past 23), and `last_sent_on` is not the clock's date.
- Title: `<today>: <count phrase>`; the phrase is the locale's plural form for the language (`Intl.PluralRules`), with `{{count}}` replaced.
- A line: an item is its time and title, or the title alone; a session is the session word; a plan is `<plan word>: <title>`, or the plan word alone. With rows in more than one league, every line starts with `<league name> · `. A line longer than 80 characters (counted as code points, `[...line]`) is cut to 79 and `…`.
- At most five row lines, in league order then row order; further rows become one more line from `more`.
- `url`: `/admin/<slug>/schedule` when exactly one league has rows, otherwise `/admin`. `tag`: `today-<date>`. `dir`: `rtl` for `ar`.

- [ ] **Step 1: Write the failing tests** `supabase/functions/_shared/morningPush.test.ts`

```ts
import en from '../../../src/locales/en.json'
import ar from '../../../src/locales/ar.json'
import { buildMessage, dueDate, localClock, sampleMessage, WORDS, type LeagueDay } from './morningPush.ts'
import type { TodayRow } from './scheduleDay.ts'

const at = (iso: string) => new Date(iso)
const sub = (over = {}) => ({ time_zone: 'Asia/Riyadh', notify_hour: 7, last_sent_on: null as string | null, ...over })

describe('localClock', () => {
  it('reads the date and hour of a time zone', () => {
    expect(localClock('Asia/Riyadh', at('2026-10-13T04:10:00Z'))).toEqual({ date: '2026-10-13', hour: 7 })
    expect(localClock('America/New_York', at('2026-10-13T03:59:00Z'))).toEqual({ date: '2026-10-12', hour: 23 })
    expect(localClock('Asia/Kolkata', at('2026-10-13T18:45:00Z'))).toEqual({ date: '2026-10-14', hour: 0 })
    expect(localClock('UTC', at('2026-10-13T00:00:00Z'))).toEqual({ date: '2026-10-13', hour: 0 })
  })
  it.each(['Not a zone!', '', 'Mars/Olympus'])('gives null for a zone it cannot read (%s)', (zone) => {
    expect(localClock(zone, at('2026-10-13T04:10:00Z'))).toBeNull()
  })
})

describe('dueDate', () => {
  it('is due from the chosen hour to the end of the hour after it', () => {
    expect(dueDate(sub(), at('2026-10-13T03:59:00Z'))).toBeNull()               // 06:59
    expect(dueDate(sub(), at('2026-10-13T04:00:00Z'))).toBe('2026-10-13')       // 07:00
    expect(dueDate(sub(), at('2026-10-13T05:59:00Z'))).toBe('2026-10-13')       // 08:59
    expect(dueDate(sub(), at('2026-10-13T06:00:00Z'))).toBeNull()               // 09:00
  })
  it('is not due twice on one day, and is due again the next', () => {
    expect(dueDate(sub({ last_sent_on: '2026-10-13' }), at('2026-10-13T04:15:00Z'))).toBeNull()
    expect(dueDate(sub({ last_sent_on: '2026-10-13' }), at('2026-10-14T04:15:00Z'))).toBe('2026-10-14')
  })
  it('at hour 23 the window is that hour alone', () => {
    const late = sub({ notify_hour: 23 })
    expect(dueDate(late, at('2026-10-13T20:30:00Z'))).toBe('2026-10-13')        // 23:30
    expect(dueDate(late, at('2026-10-13T21:10:00Z'))).toBeNull()                // 00:10 the next day
  })
  it('follows a time zone half an hour off', () => {
    const india = sub({ time_zone: 'Asia/Kolkata' })
    expect(dueDate(india, at('2026-10-13T01:29:00Z'))).toBeNull()               // 06:59
    expect(dueDate(india, at('2026-10-13T01:30:00Z'))).toBe('2026-10-13')       // 07:00
  })
  it('on the day the clocks go forward, an hour that does not exist is caught by the one after', () => {
    const berlin = sub({ time_zone: 'Europe/Berlin', notify_hour: 2 })
    expect(dueDate(berlin, at('2026-03-29T00:59:00Z'))).toBeNull()              // 01:59
    expect(dueDate(berlin, at('2026-03-29T01:00:00Z'))).toBe('2026-03-29')      // 03:00, there is no 02:00
  })
  it('on the day the clocks go back, the hour that comes twice is sent once', () => {
    const berlin = sub({ time_zone: 'Europe/Berlin', notify_hour: 2 })
    expect(dueDate(berlin, at('2026-10-25T00:10:00Z'))).toBe('2026-10-25')      // 02:10, the first time
    expect(dueDate({ ...berlin, last_sent_on: '2026-10-25' }, at('2026-10-25T01:10:00Z'))).toBeNull() // 02:10 again
  })
  it('a device whose time zone cannot be read is never due', () => {
    expect(dueDate(sub({ time_zone: 'Not a zone!' }), at('2026-10-13T04:10:00Z'))).toBeNull()
  })
})

const row = (over: Partial<TodayRow>): TodayRow => ({ kind: 'item', id: 'i', dot: 'task', time: null, title: 'Item', ...over })
const eagles = (rows: TodayRow[]): LeagueDay => ({ name: 'Eagles', slug: 'eagles', rows })

describe('buildMessage', () => {
  it('lists one league in English', () => {
    expect(buildMessage('en', '2026-10-13', [eagles([
      row({ time: '08:00 – 09:30', title: 'Gym' }),
      row({ title: 'Book the pitch' }),
      row({ kind: 'session', dot: 'session', title: null }),
      row({ kind: 'plan', dot: 'plan', title: 'Passing day' }),
      row({ kind: 'plan', dot: 'plan', title: null }),
    ])])).toEqual({
      title: 'Today: 5 items',
      body: '08:00 – 09:30 Gym\nBook the pitch\nMatch session\nTraining plan: Passing day\nTraining plan',
      url: '/admin/eagles/schedule', tag: 'today-2026-10-13', lang: 'en', dir: 'ltr',
    })
  })
  it('says "1 item" for one', () => {
    expect(buildMessage('en', '2026-10-13', [eagles([row({})])])?.title).toBe('Today: 1 item')
  })
  it('is null when nothing is on', () => {
    expect(buildMessage('en', '2026-10-13', [])).toBeNull()
    expect(buildMessage('en', '2026-10-13', [eagles([])])).toBeNull()
  })
  it('names the league on every line when more than one has something, and opens the app', () => {
    const message = buildMessage('en', '2026-10-13', [
      eagles([row({ title: 'Gym' })]),
      { name: 'Lions', slug: 'lions', rows: [] },
      { name: 'Owls', slug: 'owls', rows: [row({ kind: 'session', dot: 'session', title: null })] },
    ])
    expect(message?.body).toBe('Eagles · Gym\nOwls · Match session')
    expect(message?.url).toBe('/admin')
    expect(message?.title).toBe('Today: 2 items')
  })
  it('a league with nothing does not turn the names on', () => {
    const message = buildMessage('en', '2026-10-13', [eagles([row({ title: 'Gym' })]), { name: 'Lions', slug: 'lions', rows: [] }])
    expect(message?.body).toBe('Gym')
    expect(message?.url).toBe('/admin/eagles/schedule')
  })
  it('shows five rows and counts the rest', () => {
    const rows = Array.from({ length: 8 }, (_, i) => row({ id: `i${i}`, title: `Item ${i + 1}` }))
    const message = buildMessage('en', '2026-10-13', [eagles(rows)])
    expect(message?.body.split('\n')).toEqual(['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5', '+3 more'])
    expect(message?.title).toBe('Today: 8 items')
  })
  it('cuts a long line, so the whole message stays small enough to send', () => {
    const long = '⚽'.repeat(80)
    const rows = Array.from({ length: 9 }, (_, i) => row({ id: `i${i}`, time: '08:00 – 09:30', title: long }))
    const message = buildMessage('ar', '2026-10-13', [
      { name: 'ن'.repeat(80), slug: 'a', rows }, { name: 'م'.repeat(80), slug: 'b', rows },
    ])!
    for (const line of message.body.split('\n')) expect([...line].length).toBeLessThanOrEqual(80)
    expect(message.body.split('\n')[0].endsWith('…')).toBe(true)
    expect(new TextEncoder().encode(JSON.stringify(message)).length).toBeLessThan(3000)
  })
  it('speaks Arabic, right to left, with its plural forms', () => {
    const message = buildMessage('ar', '2026-10-13', [eagles([
      row({ time: '08:00', title: 'تمرين' }), row({ kind: 'session', dot: 'session', title: null }), row({ kind: 'plan', dot: 'plan', title: 'تمرير' }),
    ])])!
    expect(message).toMatchObject({ lang: 'ar', dir: 'rtl', title: 'اليوم: 3 عناصر' })
    expect(message.body).toBe('08:00 تمرين\nجلسة مباريات\nخطة تدريب: تمرير')
    expect(buildMessage('ar', '2026-10-13', [eagles([row({})])])?.title).toBe('اليوم: عنصر واحد')
    expect(buildMessage('ar', '2026-10-13', [eagles([row({}), row({})])])?.title).toBe('اليوم: عنصران')
    const eleven = Array.from({ length: 11 }, () => row({}))
    expect(buildMessage('ar', '2026-10-13', [eagles(eleven)])?.title).toBe('اليوم: 11 عنصراً')
  })
})

it('a sample says where the notification will appear', () => {
  expect(sampleMessage('en', '2026-10-13')).toEqual({
    title: 'Today', body: 'Nothing on your schedule today. Your morning notification will appear here.',
    url: '/admin', tag: 'today-2026-10-13', lang: 'en', dir: 'ltr',
  })
  expect(sampleMessage('ar', '2026-10-13')).toMatchObject({ title: 'اليوم', dir: 'rtl' })
})

it("uses the app's own words", () => {
  for (const [language, locale] of [['en', en], ['ar', ar]] as const) {
    expect(WORDS[language].today).toBe(locale.today.title)
    expect(WORDS[language].session).toBe(locale.schedule.session)
    expect(WORDS[language].plan).toBe(locale.schedule.plan)
    const counts = Object.fromEntries(Object.entries(locale.today).filter(([k]) => k.startsWith('count_')).map(([k, v]) => [k.slice(6), v]))
    expect(WORDS[language].count).toEqual(counts)
  }
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run supabase/functions/_shared/morningPush.test.ts`
Expected: FAIL, `./morningPush.ts` cannot be resolved.

- [ ] **Step 3: Implement the types, `WORDS`, `localClock`, `dueDate`, `buildMessage`, `sampleMessage`** in `morningPush.ts` to the rules above

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run supabase/functions/_shared/morningPush.test.ts supabase/functions/_shared/scheduleDay.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/morningPush.ts supabase/functions/_shared/morningPush.test.ts
git commit -m "feat: who is due for the morning notification, and what it says"
```

---

### Task 5: The round, the test send, and the function

**Files:**
- Modify: `supabase/functions/_shared/morningPush.ts`, `supabase/functions/_shared/morningPush.test.ts`
- Create: `supabase/functions/_shared/morningPushData.ts`, `supabase/functions/_shared/morningPushData.test.ts`, `supabase/functions/send-morning-push/index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: Task 4's types and functions; `todayRows`, `ScheduleItem` from `./scheduleDay.ts`.
- Produces, in `morningPush.ts`:
  ```ts
  export type SendResult = 'sent' | 'gone' | 'failed'
  export interface RoundDeps {
    subscriptions(): Promise<CoachSub[]>
    day(userId: string, date: string, withPlans: boolean): Promise<LeagueDay[]>
    send(sub: PushSub, message: PushMessage): Promise<SendResult>
    markSent(id: string, date: string): Promise<void>
    remove(id: string): Promise<void>
  }
  export interface RoundResult { due: number; sent: number; nothing: number; gone: number; failed: number }
  export function runRound(deps: RoundDeps, now: Date): Promise<RoundResult>
  export function runTest(deps: RoundDeps, userId: string, endpoint: string, now: Date): Promise<SendResult | 'notFound'>
  // Who is calling, from the Authorization header: the job (its secret), someone with a session, or nobody
  export function callerKind(authorization: string | null, secret: string | undefined): 'job' | 'user' | 'none'
  ```
- Produces, in `morningPushData.ts`:
  ```ts
  // `client` is a Supabase client working with the service role; `send` delivers one message
  export function roundDeps(client: DataClient, send: RoundDeps['send']): RoundDeps
  // The caller's own devices only, for the test send
  export function coachIsAllowed(client: DataClient, userId: string): Promise<boolean>
  ```
  `DataClient` is the small structural type of what is used (`from(table)` with `select`, `eq`, `in`, `lte`, `order`, `update`, `delete`), so both the real client and the test fake fit.

**Rules the tests pin:**
- A device counts only when its coach is enabled and has `schedule`; plans are read only when he has `training`.
- `day` is asked once per coach and local date, however many of his devices are due.
- No rows: `markSent`, nothing sent, counted in `nothing`. `sent`: `markSent`. `gone`: `remove`. `failed`, or `send` or `day` throwing: nothing written, counted in `failed`, and the round goes on.
- `runTest`: the device is the row with that `endpoint` **and** that `user_id`; its date is its own clock's (today in UTC when the zone cannot be read); a real message, or the sample with nothing on; never `markSent`; `gone` removes the row.
- `callerKind`: `job` only when the secret is at least 16 characters and the header is exactly `Bearer <secret>` (compared without stopping at the first difference); `user` for any other non-empty bearer token; otherwise `none`.
- `roundDeps(...).day`: the coach's leagues in `created_at` order; for all of them at once, the items dated that day that do not repeat, the repeating ones that started on or before it (dropped when `repeat_until` is before it), the sessions of that day, and (with plans) the trainings of that day; rows per league through `todayRows`.

- [ ] **Step 1: Write the failing tests for `runRound`, `runTest` and `callerKind`** (added to `morningPush.test.ts`)

A helper builds `RoundDeps` over in-memory lists and records every call:

```ts
const NOW = new Date('2026-10-13T04:10:00Z') // 07:10 in Riyadh
const device = (over: Partial<CoachSub> = {}): CoachSub => ({
  id: 'd1', user_id: 'u1', endpoint: 'https://push.test/d1', p256dh: 'k', auth: 'a', time_zone: 'Asia/Riyadh',
  notify_hour: 7, language: 'en', last_sent_on: null, coach: { enabled: true, features: ['schedule', 'training'] }, ...over,
})
function world(devices: CoachSub[], days: Record<string, LeagueDay[]> = {}, answers: Record<string, SendResult | Error> = {}) {
  const log = { day: [] as string[], sent: [] as [string, PushMessage][], marked: [] as [string, string][], removed: [] as string[] }
  const deps: RoundDeps = {
    subscriptions: async () => devices,
    day: async (userId, date, withPlans) => {
      log.day.push(`${userId}|${date}|${withPlans}`)
      const found = days[userId]
      if (!found) throw new Error('down')
      return found
    },
    send: async (sub, message) => {
      log.sent.push([sub.id, message])
      const answer = answers[sub.id] ?? 'sent'
      if (answer instanceof Error) throw answer
      return answer
    },
    markSent: async (id, date) => { log.marked.push([id, date]) },
    remove: async (id) => { log.removed.push(id) },
  }
  return { deps, log }
}
const gym: LeagueDay[] = [{ name: 'Eagles', slug: 'eagles', rows: [row({ title: 'Gym' })] }]
```

Tests, each with the assertions named:

- `sends to a due device and marks its day`: result `{ due: 1, sent: 1, nothing: 0, gone: 0, failed: 0 }`; `log.sent[0][1].body` is `'Gym'`; `log.marked` is `[['d1', '2026-10-13']]`.
- `leaves a device that is not due alone`: hour 9 → `due: 0`, `log.day` empty.
- `reads a coach's day once for two devices`: two devices of `u1` → `log.day` is `['u1|2026-10-13|true']`, two sent, two marked.
- `reads two days for one coach whose devices are on different dates`: one device in `Pacific/Kiritimati` (UTC+14: 18:10 on the 13th at `NOW`) with hour 18 and one in `Pacific/Pago_Pago` (UTC−11: 17:10 on the 12th) with hour 17 → `log.day`, sorted, is `['u1|2026-10-12|true', 'u1|2026-10-13|true']`; each device is marked with its own date.
- `marks the day and sends nothing when nothing is on`: `days.u1 = [{ ..., rows: [] }]` → `nothing: 1`, `log.sent` empty, marked.
- `removes a device whose address is gone`: answer `'gone'` → `gone: 1`, `log.removed` is `['d1']`, not marked.
- `leaves a failed send for the next run, and goes on`: `d1` answers `'failed'`, `d2` (another coach) is fine → `failed: 1, sent: 1`; `d1` not marked.
- `a send that throws, and a day that cannot be read, count as failed and stop nobody`: `d1` throws, `u2` has no day, `d3` of `u3` is fine → `failed: 2, sent: 1`.
- `skips a coach who is disabled or lost the schedule`: `enabled: false`, and `features: []` → `due: 0`.
- `does not read training plans for a coach without training`: `features: ['schedule']` → `log.day` is `['u1|2026-10-13|false']`.
- `skips a device whose time zone cannot be read, and goes on`: one device with `time_zone: 'Not a zone!'` and one good → `due: 1, sent: 1`.
- `runTest sends today's items to the caller's own device whatever the hour, and marks nothing`: hour 20 → `'sent'`, `log.marked` empty.
- `runTest sends the sample on an empty day`: body is the sample text.
- `runTest finds nothing for another coach's device, or an unknown one`: `runTest(deps, 'u2', 'https://push.test/d1', NOW)` → `'notFound'`, nothing sent.
- `runTest removes a device whose address is gone`: `'gone'`, removed.
- `callerKind`:
  ```ts
  const SECRET = 'a-long-job-secret-0123456789'
  expect(callerKind(`Bearer ${SECRET}`, SECRET)).toBe('job')
  expect(callerKind('Bearer some.user.session', SECRET)).toBe('user')
  expect(callerKind(`Bearer ${SECRET}x`, SECRET)).toBe('user')
  expect(callerKind(null, SECRET)).toBe('none')
  expect(callerKind('', SECRET)).toBe('none')
  expect(callerKind('Bearer ', SECRET)).toBe('none')
  expect(callerKind('Basic abc', SECRET)).toBe('none')
  // A function deployed without its secret has no job
  expect(callerKind('Bearer ', '')).toBe('none')
  expect(callerKind('Bearer ', undefined)).toBe('none')
  expect(callerKind('Bearer short', 'short')).toBe('user')
  ```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run supabase/functions/_shared/morningPush.test.ts`
Expected: the new tests FAIL (`runRound is not a function`).

- [ ] **Step 3: Implement `runRound`, `runTest`, `callerKind`**

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run supabase/functions/_shared/morningPush.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing tests for `morningPushData.ts`** (`morningPushData.test.ts`, over the in-memory fake: `import { supabase, db, resetDb, rows } from '../../../src/test/fakeSupabase.ts'`)

Seed two coaches (`u1` admin enabled with `schedule` and `training`; `u2` admin disabled), three leagues (`L1` and `L2` of `u1`, `L3` of `u2`), schedule items (one today in `L1`; one weekly from a week ago in `L2`; one weekly ended yesterday in `L1`; one tomorrow; one in `L3`), a session today in `L2`, a training today in `L1`, and devices for both.

- `subscriptions() gives every device with its coach's state`: `u1`'s device has `coach: { enabled: true, features: [...] }`; `u2`'s has `enabled: false`; a device whose profile has role `superadmin` has `enabled: false`.
- `day() gives each of the coach's leagues with its rows, in the order they were made`: for `u1` → `[{ name: 'Eagles', slug: 'eagles', rows: [item, plan] }, { name: 'Lions', slug: 'lions', rows: [weekly item, session] }]` (compared by `kind:id`); nothing of `L3`.
- `day() leaves training plans out without plans`: `withPlans = false` → no plan row, and `db.errors.trainings` set does not fail it.
- `day() throws when a read fails`: `db.errors.schedule_items` → rejects.
- `day() is empty for a coach with no league`.
- `markSent() writes the day`, `remove() deletes the device`: checked in `rows('push_subscriptions')`.
- `coachIsAllowed()`: true for `u1`; false for the disabled coach, for one without `schedule`, for a superadmin, for an unknown id.

- [ ] **Step 6: Run them to see them fail, implement `morningPushData.ts`, run them to see them pass**

Run: `npx vitest run supabase/functions/_shared/morningPushData.test.ts`
Expected first: FAIL, the module cannot be resolved. After implementing: PASS.

- [ ] **Step 7: Write `supabase/functions/send-morning-push/index.ts`**

The shell, in the shape of `create-admin/index.ts` (`handle` inside a `Deno.serve` that turns anything thrown into `internalError`):

- `OPTIONS` answers the CORS headers of `_shared/superadmin.ts`; anything but `POST` is 400.
- `callerKind(req.headers.get('Authorization'), Deno.env.get('MORNING_PUSH_SECRET'))`:
  - `none`: 403 `{ error: 'forbidden' }`.
  - `job`: `runRound(roundDeps(admin, send), new Date())`, answered as JSON.
  - `user`: the caller's id from a client made with the anon key and his header (`auth.getUser()`), 403 without one or when `coachIsAllowed` is false; the body must be `{ test: true, endpoint: <string> }`, else 400; then `runTest(...)`, answered `{ result }` with status 200 for `sent`, 404 for `notFound`, 410 for `gone`, 502 for `failed`.
- `admin` is a service-role client (`persistSession: false`, `autoRefreshToken: false`).
- `send`: `webpush.sendNotification({ endpoint, keys: { p256dh, auth } }, JSON.stringify(message), { TTL: 43200, vapidDetails: { subject, publicKey, privateKey } })` from `npm:web-push@3`; an error whose `statusCode` is 404 or 410 is `gone`, any other is `failed` (logged with its status code, never with the address).

In `supabase/config.toml` add:

```toml
[functions.send-morning-push]
verify_jwt = false
```

This file is not run by Vitest. What proves it is the rollout's test send.

- [ ] **Step 8: Run the shared tests once more and commit**

Run: `npx vitest run supabase/functions/_shared`
Expected: PASS.

```bash
git add supabase/functions supabase/config.toml
git commit -m "feat: the server function that sends the morning notifications"
```

---

### Task 6: The service worker's push handler

**Files:**
- Create: `public/push-sw.js`, `src/pushSw.test.ts`
- Modify: `vite.config.ts` (`workbox: { importScripts: ['push-sw.js'] }`)

**Interfaces:**
- Consumes: the message `{ title, body, url, tag, lang, dir }` (Task 4's `PushMessage`).
- Produces: nothing imported elsewhere.

- [ ] **Step 1: Write the failing test** `src/pushSw.test.ts`

The file is plain script; the test runs its text against a stand-in for the worker's `self`:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { vi } from 'vitest'

function worker(windows: { url: string; focus: () => Promise<unknown>; navigate: (url: string) => Promise<unknown> }[] = []) {
  const handlers: Record<string, (event: never) => void> = {}
  const self = {
    addEventListener: (name: string, fn: (event: never) => void) => { handlers[name] = fn },
    registration: { showNotification: vi.fn().mockResolvedValue(undefined) },
    clients: { matchAll: vi.fn().mockResolvedValue(windows), openWindow: vi.fn().mockResolvedValue(undefined) },
    location: { origin: 'https://app.test' },
  }
  new Function('self', readFileSync(resolve(__dirname, '../public/push-sw.js'), 'utf8'))(self)
  const fire = async (name: string, event: Record<string, unknown>) => {
    let done: Promise<unknown> = Promise.resolve()
    handlers[name]({ ...event, waitUntil: (p: Promise<unknown>) => { done = p } } as never)
    await done
  }
  return { self, fire }
}
const message = { title: 'Today: 2 items', body: 'Gym\nMatch session', url: '/admin/eagles/schedule', tag: 'today-2026-10-13', lang: 'en', dir: 'ltr' }

it('shows the notification a push carries', async () => {
  const { self, fire } = worker()
  await fire('push', { data: { json: () => message } })
  expect(self.registration.showNotification).toHaveBeenCalledWith('Today: 2 items', {
    body: 'Gym\nMatch session', tag: 'today-2026-10-13', lang: 'en', dir: 'ltr',
    icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', data: { url: '/admin/eagles/schedule' },
  })
})

it.each([
  ['no data', { data: null }],
  ['data that is not JSON', { data: { json: () => { throw new SyntaxError('bad') } } }],
  ['JSON without a title', { data: { json: () => ({ body: 'x' }) } }],
])('still shows a plain notification for a push with %s', async (_name, event) => {
  const { self, fire } = worker()
  await fire('push', event)
  expect(self.registration.showNotification).toHaveBeenCalledWith('ScoreLeader', expect.objectContaining({ data: { url: '/admin' } }))
})

it('a tap closes the notification and takes an open window of the app there', async () => {
  const open = { url: 'https://app.test/admin/eagles/home', focus: vi.fn().mockResolvedValue(undefined), navigate: vi.fn().mockResolvedValue(undefined) }
  const { self, fire } = worker([open])
  const close = vi.fn()
  await fire('notificationclick', { notification: { close, data: { url: '/admin/eagles/schedule' } } })
  expect(close).toHaveBeenCalled()
  expect(open.navigate).toHaveBeenCalledWith('/admin/eagles/schedule')
  expect(open.focus).toHaveBeenCalled()
  expect(self.clients.openWindow).not.toHaveBeenCalled()
})

it('a tap opens the app when no window of it is open', async () => {
  const { self, fire } = worker()
  await fire('notificationclick', { notification: { close: vi.fn(), data: { url: '/admin/eagles/schedule' } } })
  expect(self.clients.matchAll).toHaveBeenCalledWith({ type: 'window', includeUncontrolled: true })
  expect(self.clients.openWindow).toHaveBeenCalledWith('/admin/eagles/schedule')
})

it('a tap on a notification with no address opens the admin area', async () => {
  const { self, fire } = worker()
  await fire('notificationclick', { notification: { close: vi.fn(), data: null } })
  expect(self.clients.openWindow).toHaveBeenCalledWith('/admin')
})

it('a window that cannot be taken there is replaced by a new one', async () => {
  const stuck = { url: 'https://app.test/', focus: vi.fn(), navigate: vi.fn().mockRejectedValue(new Error('no')) }
  const { self, fire } = worker([stuck])
  await fire('notificationclick', { notification: { close: vi.fn(), data: { url: '/admin' } } })
  expect(self.clients.openWindow).toHaveBeenCalledWith('/admin')
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/pushSw.test.ts`
Expected: FAIL, `public/push-sw.js` does not exist.

- [ ] **Step 3: Write `public/push-sw.js`** (plain script, no imports, a header comment saying the generated service worker loads it and what it does)

A push that cannot be read is shown under the app's name, `ScoreLeader`, with no body, tag `today` and the address `/admin`: the worker does not know the device's language, and the name reads the same in both. A window is "taken there" with `client.navigate(url)` then `client.focus()`; a window without `navigate`, or one that refuses, falls back to `clients.openWindow(url)`.

- [ ] **Step 4: Run it to see it pass, then wire it in and build**

Run: `npx vitest run src/pushSw.test.ts` — Expected: PASS.

Add `workbox: { importScripts: ['push-sw.js'] }` to the `VitePWA` options.

Run: `npm run build`, then search `dist/sw.js` for `push-sw.js` and check `dist/push-sw.js` exists.
Expected: the build passes; `dist/sw.js` contains `importScripts("push-sw.js")` (quotes may differ); the file is in `dist/`.

- [ ] **Step 5: Commit**

```bash
git add public/push-sw.js src/pushSw.test.ts vite.config.ts
git commit -m "feat: the service worker shows a pushed notification and opens the app on a tap"
```

---

### Task 7: Push on the device

**Files:**
- Create: `src/lib/push.ts`, `src/lib/push.test.ts`
- Modify: `src/test/fakeSupabase.ts` (`functions.invoke` logs each call in `db.invokes` and answers from `db.functionResults[name]`, default `{ data: null, error: null }`; both reset by `resetDb`)

**Interfaces:**
- Produces:
  ```ts
  export type PushSupport = 'ok' | 'needsInstall' | 'unsupported'
  export interface PushState { support: PushSupport; permission: 'default' | 'granted' | 'denied'; on: boolean; hour: number }
  export const DEFAULT_HOUR = 7
  export function readPushState(): Promise<PushState>
  // 'blocked' when the browser says no; 'dismissed' when the question was closed unanswered
  export function turnOnPush(hour: number, language: string): Promise<'on' | 'blocked' | 'dismissed' | 'failed'>
  export function setPushHour(hour: number, language: string): Promise<boolean>
  export function turnOffPush(): Promise<boolean>
  export function sendTestPush(): Promise<boolean>
  // On opening the admin area: saves again when the address, the time zone or the language is not what is stored
  export function keepPushRight(language: string): Promise<void>
  // On signing out: this device stops getting the coach's notifications
  export function forgetPush(): Promise<void>
  ```

**Rules the tests pin:**
- `support`: `unsupported` without `navigator.serviceWorker`, `PushManager`, `Notification`, a registered service worker (`navigator.serviceWorker.getRegistration()`), or `VITE_VAPID_PUBLIC_KEY`; `needsInstall` on an iPhone or iPad (user agent, or `MacIntel` with touch points) that has no `PushManager` and is not running from the home screen; otherwise `ok`.
- `on`: permission granted, the browser holds a subscription, and a row with its `endpoint` exists; `hour` is that row's, else the device's remembered hour (`scoreleader.push`), else 7.
- `turnOnPush`: `Notification.requestPermission()`; `denied` → `blocked`; `default` → `dismissed`; then `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` with the key decoded from base64url; then `rpc('save_push_subscription', { p_endpoint, p_p256dh, p_auth, p_time_zone, p_notify_hour, p_language })` with the keys base64url-encoded from `subscription.getKey`, the zone from `Intl.DateTimeFormat().resolvedOptions().timeZone`, the language `ar` for anything starting with `ar` and `en` otherwise. A failed subscribe or save → `failed`, and a subscription made in this attempt is given back. On success the hour is remembered on the device.
- `setPushHour`: the same save with the new hour; remembered on success.
- `turnOffPush`: deletes the row with this `endpoint`, calls `subscription.unsubscribe()`, forgets the remembered hour; true unless the delete failed (the subscription is still given back).
- `sendTestPush`: `functions.invoke('send-morning-push', { body: { test: true, endpoint } })`; true when there is no error.
- `keepPushRight`: does nothing unless permission is granted, a subscription exists and an hour is remembered; saves when there is no row for the endpoint or its `time_zone` or `language` differ; never throws.
- `forgetPush`: when a subscription exists, tries the delete and always calls `unsubscribe()`; forgets the remembered hour; never throws.

- [ ] **Step 1: Write the failing tests** `src/lib/push.test.ts`

Over the fake database (`vi.mock('./supabase', ...)` as the other tests do) and a stand-in browser installed per test:

```ts
function browser(over: { permission?: NotificationPermission; subscription?: FakeSubscription | null; ask?: NotificationPermission; subscribeFails?: boolean; registered?: boolean } = {}) { /* installs navigator.serviceWorker.getRegistration, window.PushManager, window.Notification; returns { subscribe, unsubscribe, requestPermission } spies */ }
```

`FakeSubscription` has `endpoint`, `getKey(name)` returning fixed bytes (so `p256dh` is `'AQID'` for bytes 1, 2, 3 and `auth` is `'BAUG'` for 4, 5, 6), and `unsubscribe`. `vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U')` and `vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')` returning `timeZone: 'Asia/Riyadh'`.

Tests (name, then what is asserted):

- `support`:
  - `cannot push without a service worker, without a registration, or without the key` → three cases, each `support: 'unsupported'`.
  - `asks an iPhone not on the home screen to be added first` → user agent of an iPhone, no `PushManager`, `matchMedia('(display-mode: standalone)')` false → `needsInstall`.
  - `an iPhone opened from the home screen can push` → `PushManager` present → `ok`.
- `readPushState`:
  - `is off with the default hour on a fresh device` → `{ support: 'ok', permission: 'default', on: false, hour: 7 }`.
  - `is on with the stored hour when the browser's address is in the table` → row with hour 9 → `on: true, hour: 9`.
  - `is off when the browser has an address the table does not know` → `on: false`.
  - `is off when notifications are blocked, even with a row` → `permission: 'denied', on: false`.
- `turnOnPush`:
  - `asks, subscribes with the app's key and saves the device` → `'on'`; `subscribe` called with `userVisibleOnly: true` and a 65-byte `applicationServerKey`; `db.rpcs` is `[{ fn: 'save_push_subscription', args: { p_endpoint: 'https://push.test/d1', p_p256dh: 'AQID', p_auth: 'BAUG', p_time_zone: 'Asia/Riyadh', p_notify_hour: 8, p_language: 'ar' } }]` for language `'ar-EG'`; `localStorage['scoreleader.push']` is `{"hour":8}`.
  - `reports blocked when the browser says no` → `'blocked'`, no subscribe, no rpc.
  - `reports dismissed when the question is closed unanswered` → `ask: 'default'` → `'dismissed'`, no subscribe.
  - `gives the address back when the save is refused` → `db.rpcResults.save_push_subscription = { data: null, error: { message: 'schedule feature needed' } }` → `'failed'`, `unsubscribe` called, nothing remembered.
  - `fails without leaving anything when the browser cannot subscribe` → `'failed'`, no rpc.
- `setPushHour saves the new hour and remembers it`; `setPushHour reports a refused save and keeps the old hour remembered`.
- `turnOffPush deletes the device, gives the address back and forgets the hour`; `turnOffPush still gives the address back when the delete fails, and says it failed`.
- `sendTestPush calls the function for this device` → `db.invokes` is `[{ name: 'send-morning-push', body: { test: true, endpoint: 'https://push.test/d1' } }]`, true; `reports a failed test` → `db.functionResults['send-morning-push'] = { data: null, error: { message: 'x' } }` → false; `is false with no address`.
- `keepPushRight`:
  - `saves again when the time zone changed` (row has `Europe/Berlin`) → one rpc with `Asia/Riyadh` and the row's hour.
  - `saves again when the language changed`.
  - `saves again when the browser renewed the address` (no row for the endpoint, hour 9 remembered) → rpc with hour 9.
  - `does nothing when everything is as stored`, `when the device is off`, `when notifications are blocked` → no rpc.
  - `never throws` → `db.errors.push_subscriptions` set → resolves.
- `forgetPush deletes the device and gives the address back`; `forgetPush gives the address back even when the delete fails`; `forgetPush does nothing on a device that is off`; `never throws when the browser has no service worker`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/push.test.ts`
Expected: FAIL, `./push` cannot be resolved.

- [ ] **Step 3: Extend the fake (`db.invokes`, `db.functionResults`) and implement `src/lib/push.ts`**

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/lib/push.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/push.ts src/lib/push.test.ts src/test/fakeSupabase.ts
git commit -m "feat: turning the morning notification on and off for this device"
```

---

### Task 8: The dialog and the bell

**Files:**
- Create: `src/components/MorningPushDialog.tsx`, `src/components/MorningPushDialog.test.tsx`
- Modify: `src/pages/admin/SchedulePage.tsx`, `src/pages/admin/SchedulePage.test.tsx`
- Modify: `src/locales/en.json`, `src/locales/ar.json` (the `push` block, by a byte-level script)

**Interfaces:**
- Consumes: everything Task 7 produces.
- Produces: `MorningPushDialog` (default export), props `{ state: PushState; onChange: (state: PushState) => void; onClose: () => void }`.

**Behaviour to implement:**
- Built like `TodayDialog`: backdrop tap, Escape and **Close** close it; `role="dialog"`, `aria-modal`, named by `push.title`; Tab stays inside; focus starts on the first button.
- By state: `unsupported` → `push.unsupported`; `needsInstall` → `push.needsInstall`; permission `denied` → `push.blocked`; otherwise `push.intro`, a `<select>` labelled `push.hour` with 24 options `00:00`–`23:00` (`dir="ltr"`), then Off (`push.titlesShown`, **Turn on**) or On (**Send a test now**, **Turn off**).
- **Turn on:** `turnOnPush(hour, i18n.language)`; `on` → `onChange` with the state read again; `blocked` → `onChange` with the state read again (now blocked); `dismissed` → stays Off, no message; `failed` → `push.saveFailed` in a `role="alert"`.
- **Changing the hour while on:** `setPushHour`; failure → `push.saveFailed` and the select returns to the stored hour.
- **Send a test now:** `push.testSent` in a `role="status"`, or `push.testFailed` in a `role="alert"`.
- **Turn off:** `turnOffPush`, then `onChange` with the state read again.
- Every button and the select are disabled while a request of the dialog runs.
- `SchedulePage`: reads the state once when it opens (`readPushState`); a bell button at the end of the heading row with `aria-label` `push.bellOn` (time `07:00` form) or `push.bellOff`, filled when on; it opens the dialog. While the state is not yet read the bell is not shown.

- [ ] **Step 1: Write the failing tests**

`MorningPushDialog.test.tsx` mocks `../lib/push` (`vi.mock`, every function a `vi.fn`) and renders the dialog with a given state:

- `says so when this browser cannot push`, `tells an iPhone to be added to the Home Screen first`, `says notifications are blocked` → the exact English text; no Turn on button.
- `off: offers the hour, 07:00 chosen, and Turn on` → the select's value is `7`, it has 24 options, the first `00:00` and the last `23:00`; `push.titlesShown` is shown.
- `turning on with another hour` → choose `06:00`, click Turn on → `turnOnPush` called with `(6, 'en')`; `onChange` called with what `readPushState` then gives.
- `a dismissed permission question leaves it off and says nothing` → no alert, `onChange` not called, Turn on enabled again.
- `a blocked answer shows the blocked state` → `onChange` called with the blocked state.
- `a failed save says so` → the alert holds `Could not save. Check your connection and try again.`
- `a double tap turns it on once` → two clicks while the first call is pending → `turnOnPush` called once.
- `on: changing the hour saves at once` → `setPushHour(9, 'en')`; `on: a refused hour goes back and says so`.
- `on: a test says it was sent`, `on: a failed test says so`.
- `on: turning off` → `turnOffPush` called, `onChange` called.
- `Escape, a tap outside and Close close it`; `focus starts inside and Tab stays inside`.
- `speaks Arabic` → dialog named `إشعار الصباح`, button `تفعيل`.

`SchedulePage.test.tsx` (mock `../../lib/push` for the file, default state off):

- `shows the bell with its state, and opens the dialog` → button named `Morning notification: off`; click → the dialog is shown.
- `the bell says on with the time` → state on at 9 → button named `Morning notification: on, 09:00`.
- `the bell follows a change made in the dialog` → turn on in the dialog → the button is renamed.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/MorningPushDialog.test.tsx src/pages/admin/SchedulePage.test.tsx`
Expected: FAIL, the component does not exist; the bell is not found.

- [ ] **Step 3: Add the `push` block to both locale files** with a byte-level script (see Global Constraints), then check `git diff --numstat src/locales/` shows added lines only

- [ ] **Step 4: Implement the dialog and the bell**

- [ ] **Step 5: Run them to see them pass**

Run: `npx vitest run src/components/MorningPushDialog.test.tsx src/pages/admin/SchedulePage.test.tsx`
Expected: PASS, every existing schedule page test included.

- [ ] **Step 6: Commit**

```bash
git add src/components/MorningPushDialog.tsx src/components/MorningPushDialog.test.tsx src/pages/admin/SchedulePage.tsx src/pages/admin/SchedulePage.test.tsx
git -c core.autocrlf=false add src/locales/en.json src/locales/ar.json
git commit -m "feat: a bell on the coach's schedule turns the morning notification on, with its hour and a test"
```

---

### Task 9: Kept right on open, forgotten on sign-out

**Files:**
- Modify: `src/layouts/AdminLayout.tsx`, `src/layouts/AdminLayout.test.tsx`, `src/hooks/useAuth.ts`, `src/hooks/useAuth.test.ts`

**Interfaces:**
- Consumes: `keepPushRight(language)`, `forgetPush()` (Task 7).

**Behaviour to implement:**
- `AdminLayout`: when the league has `schedule`, an effect calls `keepPushRight(i18n.language)` on opening and whenever the language changes.
- `useAuth().signOut`: waits for `forgetPush()` for at most 2 seconds, whatever it does, then signs out as before.

- [ ] **Step 1: Write the failing tests**

`AdminLayout.test.tsx` (mock `../lib/push`):
- `keeps the morning notification right when the admin area opens` → `keepPushRight` called with `'en'`.
- `not without the schedule feature` → not called.

`useAuth.test.ts` (mock `../lib/push`; add `signOut: vi.fn().mockResolvedValue({ error: null })` to the mocked `supabase.auth`):
- `signing out forgets this device's notification first` → the order of the two calls is `forgetPush`, then `auth.signOut`.
- `still signs out when forgetting fails` → `forgetPush` rejects → `auth.signOut` called.
- `signs out within two seconds when forgetting never answers` → `forgetPush` returns a promise that never resolves; with fake timers, after `vi.advanceTimersByTimeAsync(2000)` `auth.signOut` has been called, and not before 1999 ms.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/layouts/AdminLayout.test.tsx src/hooks/useAuth.test.ts`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement both changes**

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/layouts/AdminLayout.test.tsx src/hooks/useAuth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/layouts/AdminLayout.tsx src/layouts/AdminLayout.test.tsx src/hooks/useAuth.ts src/hooks/useAuth.test.ts
git commit -m "feat: the morning notification follows the device's time zone and language, and stops on sign-out"
```

---

### Task 10: The keys, the whole suite and the build

**Files:**
- Create: `scripts/makePushKeys.ts`, `scripts/makePushKeys.test.ts`
- Modify: `.env.example`, `.env.production`

**Interfaces:**
- Produces: `export function makePushKeys(): { publicKey: string; privateKey: string; jobSecret: string }` — a P-256 key pair in the form Web Push uses (public: the 65-byte uncompressed point, base64url, 87 characters; private: the 32-byte scalar, base64url, 43 characters) and a 48-character random secret. Run as `node scripts/makePushKeys.ts <file>`, it appends `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `MORNING_PUSH_SECRET` lines to that file and prints only the public key; it refuses a file that already holds `VAPID_PRIVATE_KEY`.

- [ ] **Step 1: Write the failing test** `scripts/makePushKeys.test.ts`

```ts
import { createECDH } from 'node:crypto'
import { makePushKeys } from './makePushKeys.ts'

it('makes a key pair in the form Web Push uses, and a long secret', () => {
  const { publicKey, privateKey, jobSecret } = makePushKeys()
  expect(publicKey).toMatch(/^[A-Za-z0-9_-]{87}$/)
  expect(privateKey).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(jobSecret).toMatch(/^[A-Za-z0-9_-]{48}$/)
  const point = Buffer.from(publicKey, 'base64url')
  expect(point.length).toBe(65)
  expect(point[0]).toBe(4)
  // The public key really belongs to the private one
  const ecdh = createECDH('prime256v1')
  ecdh.setPrivateKey(Buffer.from(privateKey, 'base64url'))
  expect(ecdh.getPublicKey().equals(point)).toBe(true)
})

it('makes different keys each time', () => {
  expect(makePushKeys().privateKey).not.toBe(makePushKeys().privateKey)
})
```

- [ ] **Step 2: Run it to see it fail, implement `scripts/makePushKeys.ts`, run it to see it pass**

Run: `npx vitest run scripts/makePushKeys.test.ts`
Expected first: FAIL, the module cannot be resolved. After implementing: PASS.

- [ ] **Step 3: Make the keys, keeping the private half out of git**

Run: `node scripts/makePushKeys.ts E:/Score-Leader/.env.zurich.local`
Expected: prints the public key; the git-ignored credentials file gains three lines. This changes nothing live.

- [ ] **Step 4: Put the public key in the app's set-up files**

`.env.production` gains `VITE_VAPID_PUBLIC_KEY=<the printed key>` under a comment saying it is the public half of the push key; `.env.example` gains `VITE_VAPID_PUBLIC_KEY=` with the same comment.

- [ ] **Step 5: Run every test, type-check and build**

Run: `npm test` — Expected: every file passes (the baseline before this work was 127 files, 1028 tests).
Run: `npm run build` — Expected: no errors; `dist/sw.js` loads `push-sw.js`; `dist/icons/icon-192.png` exists; the built app's script contains the public key.

- [ ] **Step 6: Check the locale files' line endings**

Run: `git diff --numstat origin/main -- src/locales/`
Expected: added lines only, about twenty per file.

- [ ] **Step 7: Commit, report, and stop**

```bash
git add scripts/makePushKeys.ts scripts/makePushKeys.test.ts .env.example .env.production
git commit -m "feat: the app's public push key, and the script that makes the key pair"
```

Report the test and build results and the rollout below. Do not push, apply, deploy or set anything: ask the user first.

---

## Rollout (only after the user's go-ahead)

Each step names its check. The app already live keeps working at every point.

1. **Rehearse once more** on the final migration: `bash scripts/rehearse.sh` → `TENANCY TESTS PASSED`.
2. **Function secrets:** `supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=https://score-leader-drab.vercel.app MORNING_PUSH_SECRET=… --project-ref eogjqaquveigkqhmimjs` (values from `.env.zurich.local`) → `supabase secrets list` names the four.
3. **Migration:** `supabase db push --linked --dry-run` lists exactly `20261013000001_morning_push.sql`; then `supabase db push --linked --yes` → read-only checks: both extensions installed, two rows in `cron.job`, the table exists and is empty.
4. **Vault:** `select vault.create_secret('https://eogjqaquveigkqhmimjs.supabase.co/functions/v1/send-morning-push', 'morning_push_url')` and `select vault.create_secret('<the job secret>', 'morning_push_secret')` → `select name from vault.secrets` names both.
5. **Function:** `supabase functions deploy send-morning-push --use-api --project-ref eogjqaquveigkqhmimjs` → a `POST` with no header answers 403; a `POST` with the job secret answers 200 and `{ "due": 0, … }`.
6. **App:** push the branch, open the pull request, merge after the preview build passes → production deploy succeeds, the live `sw.js` loads `push-sw.js`, and `https://score-leader-drab.vercel.app/push-sw.js` is served as JavaScript (not the page: a handler file that fell through to `index.html` would stop the new service worker installing).
7. **The proof of sending:** the user turns the notification on on a phone and taps Send a test now. If no notification arrives, read the function's log (`supabase functions logs send-morning-push`; a refused push is logged with the push service's status and reason) before changing anything; if the `web-push` library is the cause, the fallback is `jsr:@negrel/webpush` behind the same `send`.
8. **The proof of the job.** Step 5 posts by hand and step 7 uses the coach's session, so neither shows that the database job reaches the function: a wrong address in Vault, or a Vault secret that differs from the function's, would pass both and show only as a silent morning. With the device on, set its hour in the dialog to the current hour and wait for the next quarter hour: a real notification must arrive by itself. Then, read-only: the newest row of `cron.job_run_details` for `morning-push` says `succeeded`, and the newest row of `net._http_response` has status 200 with the round's counts. Afterwards the user sets the hour he wants.
