# Training Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The superadmin keeps one catalog of training types and YouTube videos; a coach with the `training` feature builds a dated training from it and plays the videos inside the app.

**Architecture:** Four new tables behind row-level security (catalog global and superadmin-written, trainings per league and owner-only), one new feature key, and one database function that saves a training with its videos atomically. The app adds a pure YouTube link module, one data module (`trainingApi`), one video component, two superadmin pages and three coach pages. Every query is a plain single-table query joined in TypeScript, because the test fake finds linked tables by column name and `type_id` / `video_id` do not follow its naming.

**Tech Stack:** React 19 + TypeScript, Vite, Vitest + Testing Library (in-memory Supabase fake in `src/test/fakeSupabase.ts`), Supabase (Postgres, PostgREST, Edge Functions), i18next (`src/locales/en.json`, `ar.json`), date-fns.

**Spec:** `docs/superpowers/specs/2026-10-12-training-catalog-design.md`

## Global Constraints

- Work on branch `worktree-training-catalog` in `E:\Score-Leader\.claude\worktrees\training-catalog`; never commit to `main`.
- The feature key is exactly `training`; it has no dependency; nobody gets it from the migration.
- `youtube_id` is exactly 11 characters of `[A-Za-z0-9_-]`; the app stores the ID, never the link.
- Text limits: type name 1–80, video title 1–120, training title 1–80 or NULL (all measured after trimming).
- Embed URL `https://www.youtube-nocookie.com/embed/<id>?autoplay=1&playsinline=1&rel=0`; thumbnail `https://i.ytimg.com/vi/<id>/hqdefault.jpg`; watch URL `https://www.youtube.com/watch?v=<id>`.
- No embedded selects (`a, b(*)`) on the four new tables; join in TypeScript.
- Every new user-visible string is added to both `src/locales/en.json` and `src/locales/ar.json` (copy in the "Copy" section below); count strings use the same plural forms as `lineups.playerCount` in each file.
- Admin pages take the league from `useLeague()` and build links with `useAdminPath()`; a response for a league the user has left is dropped (pattern in `src/pages/admin/LineupsPage.tsx`).
- Failed database requests already raise a toast through `src/lib/reportingFetch.ts`; pages do not add their own.
- The migration only adds. It is rehearsed with `bash scripts/rehearse.sh` before it is applied; nothing is applied to the live database without the user's go-ahead (Task 9).
- Each task ends green on `npx vitest run` for its files; Task 9 runs `npm test` and `npm run build`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A link pasted with spaces or a line break around it** (phone share sheets add them) must be accepted. Pinned in Task 3.
2. **A catalog video deleted while a coach has the builder open:** Save must succeed with the videos that still exist, not fail. The same call with an id listed twice keeps the first place only. Pinned in Task 2.
3. **A double tap on Add or Save** must create one row, not two: the button is disabled while its request is running. Pinned in Tasks 6 and 8.
4. **"Today" just after midnight** must be the device's local date, not the UTC date (a coach in UTC+3 at 00:30 is already on the next day). Pinned in Task 7.
5. **A title of only spaces** must be saved as no title, not refused by the database check. Pinned in Tasks 2 and 8.

---

## File structure

| File | Responsibility |
|---|---|
| `supabase/functions/_shared/features.ts` | feature list gains `training` |
| `supabase/migrations/20261012000001_training.sql` | tables, trigger, `valid_features`, `caller_has_feature`, `save_training`, policies |
| `supabase/tests/tenancy.test.sql` | database rules tests for the above |
| `src/utils/youtube.ts` | link → ID, and the three URLs |
| `src/utils/trainingDays.ts` | local today, Today / Upcoming / Past grouping, date label |
| `src/lib/trainingApi.ts` | every query and write on the four tables |
| `src/test/fakeSupabase.ts` | logs `rpc` calls; orders numbers as numbers |
| `src/components/TrainingVideo.tsx` | thumbnail that becomes the player, plus the YouTube link |
| `src/pages/super/TrainingTypesPage.tsx`, `TrainingTypePage.tsx` | superadmin catalog |
| `src/pages/admin/TrainingsPage.tsx`, `TrainingViewPage.tsx`, `TrainingBuilderPage.tsx` | coach screens |
| `src/router.tsx`, `src/layouts/SuperLayout.tsx`, `src/layouts/AdminLayout.tsx` | routes and tabs |
| `src/lib/errorText.ts`, `src/locales/*.json` | error mapping and copy |
| `scripts/backup.ts` | the four tables join the backup |

## Copy

English is exact (tests assert it). Add each key to both files.

| Key | English | Arabic |
|---|---|---|
| `features.training`, `nav.training`, `super.tabs.training`, `training.title` | Training | التدريب |
| `training.new` | New training | تدريب جديد |
| `training.empty` | No trainings yet | لا توجد تدريبات بعد |
| `training.today` / `upcoming` / `past` | Today / Upcoming / Past | اليوم / القادمة / السابقة |
| `training.videoCount` (plural) | {{count}} video / {{count}} videos | {{count}} فيديو (forms as `lineups.playerCount`) |
| `training.date` | Date | التاريخ |
| `training.titleLabel` | Title (optional) | العنوان (اختياري) |
| `training.picked` | Picked videos | الفيديوهات المختارة |
| `training.catalog` | Catalog | المكتبة |
| `training.catalogEmpty` | No videos in the catalog yet | لا توجد فيديوهات في المكتبة بعد |
| `training.noVideos` | No videos in this training | لا توجد فيديوهات في هذا التدريب |
| `training.delete` | Delete training | حذف التدريب |
| `training.confirmDelete` | Delete this training? | هل تريد حذف هذا التدريب؟ |
| `training.play` | Play {{title}} | تشغيل {{title}} |
| `training.openOnYouTube` | Open on YouTube | فتح في يوتيوب |
| `training.moveUp` / `moveDown` | Move up / Move down | تحريك للأعلى / تحريك للأسفل |
| `super.training.typesTitle` | Training types | أنواع التدريب |
| `super.training.typesEmpty` | No training types yet | لا توجد أنواع تدريب بعد |
| `super.training.typeName` | Type name | اسم النوع |
| `super.training.add` | Add | إضافة |
| `super.training.rename` | Rename | إعادة تسمية |
| `super.training.deleteType` | Delete type | حذف النوع |
| `super.training.confirmDeleteType` (plural) | Delete “{{name}}” and its {{count}} video? / …{{count}} videos? | هل تريد حذف «{{name}}» مع {{count}} فيديو؟ |
| `super.training.link` | YouTube link | رابط يوتيوب |
| `super.training.videoTitle` | Video title | عنوان الفيديو |
| `super.training.badLink` | This is not a YouTube video link | هذا ليس رابط فيديو على يوتيوب |
| `super.training.duplicate` | This video is already in this type | هذا الفيديو موجود في هذا النوع |
| `super.training.noVideos` | No videos in this type yet | لا توجد فيديوهات في هذا النوع بعد |
| `super.training.deleteVideo` | Delete video | حذف الفيديو |
| `super.training.confirmDeleteVideo` | Delete “{{title}}”? | هل تريد حذف «{{title}}»؟ |
| `super.training.usedIn` (plural) | Used in {{count}} training; it will be removed from it. / Used in {{count}} trainings; it will be removed from them. | مستخدم في {{count}} تدريب وسيُزال منها. |
| `serverErrors.trainingNotFound` | This training no longer exists. | هذا التدريب لم يعد موجودًا. |

---

### Task 1: Feature key `training`

**Files:**
- Modify: `supabase/functions/_shared/features.ts`, `supabase/functions/_shared/features.test.ts`, `src/components/FeatureChecklist.test.tsx`, `src/locales/en.json`, `src/locales/ar.json`

**Interfaces:**
- Produces: `FeatureKey` includes `'training'`; `FEATURES` has 15 entries with `'training'` last.

- [ ] **Step 1: Change the tests.** In `features.test.ts` rename "accepts all 14 keys" to "accepts all 15 keys", assert `toHaveLength(15)`, and add `expect(setFeature([], 'training', true)).toEqual(['training'])`. In `FeatureChecklist.test.tsx` "Select all" asserts `toHaveLength(15)`; add a test that `screen.getByLabelText('Training')` exists.
- [ ] **Step 2: Run** `npx vitest run supabase/functions/_shared/features.test.ts src/components/FeatureChecklist.test.tsx`. Expected: FAIL (length 14; no "Training" label).
- [ ] **Step 3: Implement.** Append `'training'` to `FEATURES`; add `features.training` to both locale files.
- [ ] **Step 4: Run** the same command, then `npx vitest run`. Expected: PASS everywhere (`src/layouts/AdminLayout.test.tsx` still passes: no tab yet).
- [ ] **Step 5: Commit** `feat: training is a feature the superadmin can switch on`.

---

### Task 2: Database tables, rules and `save_training`

**Files:**
- Create: `supabase/migrations/20261012000001_training.sql`
- Modify: `supabase/tests/tenancy.test.sql`

**Interfaces:**
- Produces: tables `training_types`, `training_videos`, `trainings`, `training_items` with the columns, checks, keys and cascades of spec §2; `public.caller_has_feature(p_feature text) returns boolean`; `public.save_training(p_id uuid, p_league_id uuid, p_date date, p_title text, p_video_ids uuid[]) returns uuid`.

Running the rehearsal from this worktree: copy the git-ignored link state once (`cp -r /e/Score-Leader/supabase/.temp supabase/`) and export the token and password from `E:/Score-Leader/.env.zurich.local` exactly as in `docs/superpowers/plans/2026-10-09-match-format.md` Task 1. The rehearsal runs on the live database in one transaction that always rolls back.

- [ ] **Step 1: Write the failing tests** in `tenancy.test.sql`, using the file's helpers (`pg_temp.act_as`, `expect`, `expect_count`, `expect_error`):
  - Header comment: add fixture ids `cccccccc-…0013` training type, `cccccccc-…0014` and `…0015` videos, `aaaaaaaa-…0016` training.
  - Add `training` to the feature arrays of admins A, B and D in the fixture; rename the check to `'all 15 features are valid'` with `training` in its list.
  - Add `'trainings', 'training_items'` to the three table arrays (no NULL `league_id`; rows before the league is deleted; none after), and give the `99999999` fixture league one training with one item (insert the catalog type and videos as the table owner before it).
  - New section "Training: catalog by the superadmin, trainings by the owner with training":
    - As S: insert type `…0013` and videos `…0014` (`youtube_id 'dQw4w9WgXcQ'`) and `…0015` (`'aqz-KE-bpKQ'`) → 1 row each. Another video with `youtube_id 'dQw4w9WgXcQ'` in the same type → error containing `training_videos_type_id_youtube_id_key`. `youtube_id 'short'` → error containing `youtube_id`.
    - As A: insert / update / delete on `training_types` and `training_videos` → `row-level security` on insert, 0 rows on update and delete. A reads 2 videos.
    - As A: `SELECT public.save_training(NULL, '<A league>', '2026-10-12', '   ', ARRAY['…0015','…0014','…0015', gen_random_uuid()]::uuid[])` → afterwards exactly one training in A's league with `title IS NULL`, and its items are `…0015` at position 0 and `…0014` at position 1, both with `league_id` = A's league. (Review Focus 2 and 5.)
    - As A: `save_training(<that id>, …, '2026-10-13', 'Passing', ARRAY['…0014'])` → date and title changed, one item at position 0.
    - As B: reads 0 rows of `trainings` and `training_items`; `save_training(<A's training id>, …)` → error containing `training not found`; `save_training(NULL, '<A league>', …)` → `row-level security`; update and delete of A's training → 0 rows. A's training is unchanged afterwards.
    - As S: reads ≥ 1 `training_items`, 0 `trainings`; insert into `training_items` → `row-level security`.
    - As a visitor (`act_as(NULL)`): 0 rows from all four tables.
    - Remove `training` from A (as table owner): as A, 0 catalog rows, 0 trainings, and `save_training(NULL, '<A league>', …)` → `row-level security`. Put `training` back.
    - As table owner: delete video `…0014` → A's training still exists and has 0 items.
- [ ] **Step 2: Run** `bash scripts/rehearse.sh`. Expected: `REHEARSAL FAILED` (relation `training_types` does not exist, or the 15-feature check fails).
- [ ] **Step 3: Write the migration.**
  - `CREATE OR REPLACE FUNCTION public.valid_features` with the body from `20261006000001_tenancy_schema.sql` and `'training'` appended to the key array.
  - The four tables per spec §2. Constraint names Postgres generates by default are relied on by the tests (`training_videos_type_id_youtube_id_key`). Indexes: `training_videos(type_id)`, `trainings(league_id, training_date)`, `training_items(video_id)`, `training_items(league_id)`.
  - `CREATE TRIGGER training_items_set_league BEFORE INSERT OR UPDATE ON public.training_items FOR EACH ROW EXECUTE FUNCTION public.set_league_from_parent('trainings', 'training_id');`
  - `caller_has_feature`: SQL, STABLE, SECURITY DEFINER, `SET search_path = ''`; true when `admin_profiles` has a row with `user_id = auth.uid()`, `role = 'admin'`, `NOT is_disabled` and `p_feature = ANY (features)`.
  - RLS enabled on all four; policies `TO authenticated` only, per spec §3: `"catalog read"` (SELECT) and `"superadmin catalog"` (ALL) on both catalog tables; `"owner training"` (ALL) on `trainings` and `training_items`; `"superadmin counts use"` (SELECT, `is_superadmin()`) on `training_items`.
  - `save_training`, with the caller's rights; `GRANT EXECUTE` to `authenticated` only:

```sql
CREATE FUNCTION public.save_training(p_id uuid, p_league_id uuid, p_date date, p_title text, p_video_ids uuid[])
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_id uuid := p_id;
BEGIN
  IF v_id IS NULL THEN
    INSERT INTO public.trainings (league_id, training_date, title)
    VALUES (p_league_id, p_date, NULLIF(btrim(p_title), '')) RETURNING id INTO v_id;
  ELSE
    UPDATE public.trainings
       SET training_date = p_date, title = NULLIF(btrim(p_title), ''), updated_at = now()
     WHERE id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'training not found'; END IF;
  END IF;
  DELETE FROM public.training_items WHERE training_id = v_id;
  -- Videos still in the catalog only, each once, in the order first given
  INSERT INTO public.training_items (training_id, video_id, position)
  SELECT v_id, x.video_id, (row_number() OVER (ORDER BY x.first_ord) - 1)::int
  FROM (SELECT u.video_id, min(u.ord) AS first_ord
          FROM unnest(p_video_ids) WITH ORDINALITY AS u(video_id, ord)
          JOIN public.training_videos v ON v.id = u.video_id
         GROUP BY u.video_id) x;
  RETURN v_id;
END $$;
```

- [ ] **Step 4: Run** `bash scripts/rehearse.sh`. Expected: last line contains `TENANCY TESTS PASSED`.
- [ ] **Step 5: Commit** `feat: training catalog and trainings in the database, with their rules`.

---

### Task 3: YouTube links

**Files:**
- Create: `src/utils/youtube.ts`, `src/utils/youtube.test.ts`

**Interfaces:**
- Produces: `parseYouTubeId(input: string): string | null`, `youtubeThumbnail(id: string): string`, `youtubeEmbedUrl(id: string): string`, `youtubeWatchUrl(id: string): string`.

- [ ] **Step 1: Write the failing tests.**

```ts
const ID = 'dQw4w9WgXcQ'
it.each([
  `https://www.youtube.com/watch?v=${ID}`,
  `https://youtube.com/watch?v=${ID}&t=42s&list=PL123`,
  `https://m.youtube.com/watch?feature=share&v=${ID}`,
  `https://music.youtube.com/watch?v=${ID}`,
  `https://youtu.be/${ID}?si=abc`,
  `https://www.youtube.com/shorts/${ID}`,
  `https://www.youtube.com/embed/${ID}`,
  `https://www.youtube-nocookie.com/embed/${ID}`,
  `https://www.youtube.com/live/${ID}?feature=shared`,
  `youtu.be/${ID}`,
  `www.youtube.com/watch?v=${ID}`,
  `  https://youtu.be/${ID}\n`,                       // Review Focus 1
])('reads the id from %s', (link) => expect(parseYouTubeId(link)).toBe(ID))

it.each([
  '', '   ', ID, 'not a link',
  `https://vimeo.com/${ID}`,
  `https://youtube.com.evil.com/watch?v=${ID}`,
  `https://evil.com/?u=https://youtu.be/${ID}`,
  'https://www.youtube.com/playlist?list=PL123',
  'https://www.youtube.com/watch?v=short',
  `https://www.youtube.com/watch?v=${ID}extra`,
  `https://www.youtube.com/channel/${ID}`,
  `ftp://youtu.be/${ID}`,
])('refuses %s', (link) => expect(parseYouTubeId(link)).toBeNull())

it('builds the three urls', () => {
  expect(youtubeThumbnail(ID)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`)
  expect(youtubeEmbedUrl(ID)).toBe(`https://www.youtube-nocookie.com/embed/${ID}?autoplay=1&playsinline=1&rel=0`)
  expect(youtubeWatchUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`)
})
```

- [ ] **Step 2: Run** `npx vitest run src/utils/youtube.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the four functions. Parse with `new URL` (prefix `https://` when the trimmed text has no scheme); accept only `http:` / `https:` and the hosts of spec §4, compared exactly.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat: read the video id from a YouTube link`.

---

### Task 4: Data module `trainingApi`

**Files:**
- Create: `src/lib/trainingApi.ts`, `src/lib/trainingApi.test.ts`
- Modify: `src/test/fakeSupabase.ts`, `src/lib/errorText.ts`, `src/lib/errorText.test.ts`, both locale files

**Interfaces:**
- Consumes: tables and `save_training` from Task 2.
- Produces:

```ts
export interface TrainingType { id: string; name: string; sort_order: number }
export interface TrainingVideo { id: string; type_id: string; title: string; youtube_id: string; sort_order: number }
export interface Catalog { types: TrainingType[]; videos: TrainingVideo[] }          // each by sort_order, then created_at
export interface TrainingSummary { id: string; training_date: string; title: string | null; video_count: number }
export interface TrainingDetail {
  id: string; training_date: string; title: string | null
  videos: (TrainingVideo & { type_name: string })[]                                  // in saved order
}
type WriteResult = 'ok' | 'duplicate' | 'failed'                                     // 'duplicate' = error code 23505

export function fetchCatalog(): Promise<Catalog>                                     // throws on a failed request
export function nextSortOrder(rows: { sort_order: number }[]): number                // 0 for none, else max + 1
export function addType(name: string, sortOrder: number): Promise<boolean>
export function renameType(id: string, name: string): Promise<boolean>
export function deleteType(id: string): Promise<boolean>
export function addVideo(v: { type_id: string; title: string; youtube_id: string; sort_order: number }): Promise<WriteResult>
export function updateVideo(id: string, v: { title: string; youtube_id: string }): Promise<WriteResult>
export function deleteVideo(id: string): Promise<boolean>
export function swapOrder(table: 'training_types' | 'training_videos',
  a: { id: string; sort_order: number }, b: { id: string; sort_order: number }): Promise<boolean>
export function countTrainingsUsing(videoId: string): Promise<number>                // throws
export function fetchTrainings(leagueId: string): Promise<TrainingSummary[]>         // throws; by date, newest first
export function fetchTraining(id: string, leagueId: string): Promise<TrainingDetail | null>   // throws; null = not in this league
export function saveTraining(t: { id: string | null; leagueId: string; date: string; title: string; videoIds: string[] }): Promise<string | null>
export function deleteTraining(id: string): Promise<boolean>
```

  `saveTraining` calls `supabase.rpc('save_training', { p_id, p_league_id, p_date, p_title, p_video_ids })` and returns the id, or `null` on error. Names and titles are trimmed before they are sent.
- Fake: `db.rpcs: { fn: string; args: unknown }[]` (every `rpc` call is appended) and `db.rpcResults: Record<string, { data: unknown; error: { message: string } | null }>` (returned for that function name; default stays `{ data: null, error: null }`); both cleared by `resetDb`. An `rpc` call first waits for `db.holds['rpc:' + fn]`, so a test can keep a save in flight. `order` compares two numbers as numbers.

- [ ] **Step 1: Write the failing tests** in `trainingApi.test.ts` (mock `./supabase` with the fake as page tests do):
  - `fetchCatalog` returns types and videos ordered by `sort_order` where one row has `sort_order: 10` and another `2` (2 first).
  - `nextSortOrder([])` is `0`; `nextSortOrder([{ sort_order: 4 }, { sort_order: 9 }])` is `10`.
  - `addVideo` writes `{ type_id, title, youtube_id, sort_order }` to `training_videos`; with `db.errors.training_videos = { message: 'duplicate key', code: '23505' }` it returns `'duplicate'`; with another error, `'failed'`.
  - `swapOrder('training_types', { id: 'a', sort_order: 0 }, { id: 'b', sort_order: 1 })` leaves `a` at 1 and `b` at 0.
  - `countTrainingsUsing('v1')` is `2` with three `training_items` rows of which two have `video_id: 'v1'`.
  - `fetchTrainings('L1')` returns only L1's trainings, newest date first, each with its `video_count`.
  - `fetchTraining('t1', 'L1')` returns the videos in `position` order with `type_name`; `fetchTraining('t1', 'L2')` is `null`.
  - `saveTraining({ id: null, leagueId: 'L1', date: '2026-10-12', title: ' Passing ', videoIds: ['v2', 'v1'] })` records one `db.rpcs` entry `{ fn: 'save_training', args: { p_id: null, p_league_id: 'L1', p_date: '2026-10-12', p_title: 'Passing', p_video_ids: ['v2', 'v1'] } }` and returns `db.rpcResults.save_training.data`; with an error result it returns `null`.
  - In `errorText.test.ts`: `serverErrorKey('training not found')` is `'serverErrors.trainingNotFound'`.
- [ ] **Step 2: Run** `npx vitest run src/lib/trainingApi.test.ts src/lib/errorText.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the fake changes, the module, the `errorText` rule (`/training not found/i`) and the two `serverErrors.trainingNotFound` strings.
- [ ] **Step 4: Run** the same command, then `npx vitest run`. Expected: PASS everywhere.
- [ ] **Step 5: Commit** `feat: data access for the training catalog and trainings`.

---

### Task 5: `TrainingVideo` component

**Files:**
- Create: `src/components/TrainingVideo.tsx`, `src/components/TrainingVideo.test.tsx`
- Modify: both locale files (`training.play`, `training.openOnYouTube`)

**Interfaces:**
- Consumes: Task 3 URL functions.
- Produces: `export default function TrainingVideo(props: { youtubeId: string; title: string; playing: boolean; onPlay: () => void })`. The parent owns which video plays.

- [ ] **Step 1: Write the failing tests.**
  - Not playing: a button named `Play Rondo` containing an `img` whose `src` is the thumbnail URL with `loading="lazy"`; no `iframe` in the document; clicking the button calls `onPlay` once.
  - Playing: an `iframe` with `title="Rondo"`, `src` = the embed URL, `allow` containing `autoplay` and `fullscreen`, and `referrerpolicy="strict-origin-when-cross-origin"`; no play button.
  - Both states: a link named `Open on YouTube` with `href` = the watch URL, `target="_blank"`, `rel="noreferrer"`.
  - `fireEvent.error` on the thumbnail removes the `img` and keeps the play button.
- [ ] **Step 2: Run** `npx vitest run src/components/TrainingVideo.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** A 16:9 box (`aspect-video`, rounded, `bg-gray-800`) holds the thumbnail button or the iframe; the link sits under it.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat: a video thumbnail that plays in the page`.

---

### Task 6: Superadmin catalog

**Files:**
- Create: `src/pages/super/TrainingTypesPage.tsx`, `TrainingTypesPage.test.tsx`, `TrainingTypePage.tsx`, `TrainingTypePage.test.tsx`
- Modify: `src/router.tsx`, `src/layouts/SuperLayout.tsx`, `src/routes/routes.test.tsx`, both locale files (`super.tabs.training`, `super.training.*`, `training.moveUp`, `training.moveDown`)

**Interfaces:**
- Consumes: Task 4 (`fetchCatalog`, `nextSortOrder`, `addType`, `renameType`, `deleteType`, `addVideo`, `updateVideo`, `deleteVideo`, `swapOrder`, `countTrainingsUsing`), Task 3 (`parseYouTubeId`, `youtubeThumbnail`), Task 5.
- Produces: routes `/super/training` and `/super/training/:typeId`; a third `SuperLayout` tab.

Both pages follow `src/pages/super/LeaguesPage.tsx` for loading, "Could not load" and Retry, and reload the catalog after every successful write. Tests use the fake database (`resetDb({ training_types: […], training_videos: […] })`) inside a `MemoryRouter`.

- [ ] **Step 1: Write the failing tests.**
  - `TrainingTypesPage`: lists types in `sort_order` with `2 videos` / `1 video` and a link to `/super/training/<id>`; empty → `No training types yet`; typing `Passing` and pressing `Add` inserts `{ name: 'Passing', sort_order: <max + 1> }` and shows it; **while the insert is held (`db.holds.training_types`) the Add button is disabled and a second click adds nothing (one insert in `db.writes`)**; Add is disabled for an empty or spaces-only name; `Move down` on the first type swaps the two `sort_order` values and the list order; the first row has no `Move up`, the last no `Move down`; a failed load shows Retry.
  - `TrainingTypePage` at `/super/training/t1`: shows the type name and its videos only; a bad link shows `This is not a YouTube video link` and keeps Add disabled; a valid link shows a preview `img` with the thumbnail URL; Add with link `https://youtu.be/dQw4w9WgXcQ` and title `Rondo` inserts `{ type_id: 't1', title: 'Rondo', youtube_id: 'dQw4w9WgXcQ', sort_order: <max + 1> }` and clears the form; a `23505` error shows `This video is already in this type`; `Delete video` opens a dialog with `Delete “Rondo”?` and, when two items use it, `Used in 2 trainings; it will be removed from them.`; confirming deletes the row; `Edit` on a video, changing the title to `Rondo 4v2` and the link to `https://youtu.be/aqz-KE-bpKQ`, updates that row to `{ title: 'Rondo 4v2', youtube_id: 'aqz-KE-bpKQ' }`; `Rename` saves the new name; `Delete type` asks `Delete “Passing” and its 2 videos?` and on confirm deletes the type and goes to `/super/training`; an unknown `typeId` shows `Page not found`; playing a second video returns the first to its thumbnail.
  - `routes.test.tsx`: stub both pages like the others; a superadmin at `/super/training` sees `TrainingTypesPage`, at `/super/training/t1` sees `TrainingTypePage`.
- [ ] **Step 2: Run** `npx vitest run src/pages/super src/routes/routes.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the two pages (confirmation dialogs as in `src/pages/admin/LineupEditorPage.tsx`; video edit reuses the add form's fields inline), the two lazy routes under `/super`, and the `NavLink to="/super/training"` tab.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat: the superadmin keeps a catalog of training types and videos`.

---

### Task 7: Coach list and view, tab and routes

**Files:**
- Create: `src/utils/trainingDays.ts`, `trainingDays.test.ts`, `src/pages/admin/TrainingsPage.tsx`, `TrainingsPage.test.tsx`, `TrainingViewPage.tsx`, `TrainingViewPage.test.tsx`
- Modify: `src/router.tsx`, `src/layouts/AdminLayout.tsx`, `src/layouts/AdminLayout.test.tsx`, `src/routes/routes.test.tsx`, both locale files (`nav.training`, `training.*` used here)

**Interfaces:**
- Consumes: Task 4 (`fetchTrainings`, `fetchTraining`, types), Task 5.
- Produces:

```ts
// src/utils/trainingDays.ts
export function localToday(now?: Date): string                        // 'yyyy-MM-dd' in the device's time zone
export function groupByDay<T extends { training_date: string }>(list: T[], today: string):
  { today: T[]; upcoming: T[]; past: T[] }                           // upcoming nearest first, past latest first
export function dayLabel(date: string, language: string): string     // e.g. "Mon, 12 Oct 2026"; built from local midnight
```

  Routes under `/admin/:slug`, each wrapped in `FeatureRoute name="training" fallback="history"`: `trainings` → `TrainingsPage`, `trainings/:trainingId` → `TrainingViewPage`. Tab key `'training'`, label `nav.training`, between History and Coach Board, shown only with `useFeature('training')`; `activeTab` returns `'training'` for `trainings`. Icon path: `M4 5h16v14H4zM10 9l5 3-5 3z`.

- [ ] **Step 1: Write the failing tests.**
  - `trainingDays.test.ts`: `localToday(new Date(2026, 9, 13, 0, 30))` is `'2026-10-13'` (Review Focus 4: built from local date parts, never `toISOString`); `groupByDay` with dates `10-10, 10-12, 10-12, 10-14, 10-20` and today `2026-10-12` gives today = the two of 10-12, upcoming = `[10-14, 10-20]`, past = `[10-10]`; with two past dates, the later comes first; `dayLabel('2026-10-12', 'en')` contains `12` and `Oct`.
  - `TrainingsPage` (fake time `2026-10-12T10:00` local): headings `Today`, `Upcoming`, `Past` appear only for groups that have rows; a row shows the title, or the day label when the title is null, plus `3 videos`, and links to `/admin/eagles/trainings/<id>`; another league's training is not shown; `New training` links to `/admin/eagles/trainings/new`; none → `No trainings yet`; a failed load shows Retry.
  - `TrainingViewPage` at `/admin/eagles/trainings/t1`: title (or day label), then videos numbered `1`, `2` in saved order, each with its title and type name; `Edit` links to `/admin/eagles/trainings/t1/edit`; clicking `Play` on the second after the first leaves exactly one `iframe`, titled with the second; no videos → `No videos in this training` and the Edit link; a training of another league or an unknown id → `Page not found`.
  - `AdminLayout.test.tsx`: with all features the tabs are `['Home', 'Players', 'History', 'Training', 'Coach Board']` and the phone bar is `repeat(5, minmax(0, 1fr))`; with `['cards']` still three; with `['training']` four and `/admin/eagles/trainings/t1` marks Training current.
  - `routes.test.tsx`: stub the two pages; `/admin/eagles/trainings` shows `TrainingsPage` with the feature and lands on history without it (mirror "coach board off sends lineups to history").
- [ ] **Step 2: Run** `npx vitest run src/utils/trainingDays.test.ts src/pages/admin/TrainingsPage.test.tsx src/pages/admin/TrainingViewPage.test.tsx src/layouts src/routes/routes.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the util, the two pages, the tab and the routes. `TrainingViewPage` renders `NotAvailablePage kind="page" embedded` for a missing training.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat: a coach sees the league's trainings and plays their videos`.

---

### Task 8: Training builder

**Files:**
- Create: `src/pages/admin/TrainingBuilderPage.tsx`, `TrainingBuilderPage.test.tsx`
- Modify: `src/router.tsx`, `src/routes/routes.test.tsx`, both locale files (remaining `training.*`)

**Interfaces:**
- Consumes: Task 4 (`fetchCatalog`, `fetchTraining`, `saveTraining`, `deleteTraining`), Task 3 (`youtubeThumbnail`), Task 7 (`localToday`).
- Produces: routes `trainings/new` and `trainings/:trainingId/edit` (same page; `trainings/new` is declared before `trainings/:trainingId`), both behind the `training` `FeatureRoute`.

Page state: `date: string`, `title: string`, `picked: string[]` (video ids in order). Catalog rows are buttons with `aria-pressed`; they do not play.

- [ ] **Step 1: Write the failing tests** (fake database with two types and four videos; one type has no videos).
  - New: the date field holds today's local date; the catalog shows each type that has videos as a heading with its videos, in catalog order, and not the empty type; an empty catalog shows `No videos in the catalog yet`.
  - Clicking videos B then A lists `1 B`, `2 A` under `Picked videos` and sets `aria-pressed="true"` on both; clicking B in the catalog again removes it; `Remove` on a picked row does the same; `Move up` on the second picked row swaps the two.
  - `Save` with title `  ` and picks `[B, A]` sends one `save_training` rpc with `p_id: null`, `p_league_id: 'L1'`, the date, `p_title: ''` and `p_video_ids: [B, A]` (Review Focus 5: the database turns a blank title into none), then shows the route `/admin/eagles/trainings/<returned id>`.
  - **While Save is running (`db.holds['rpc:save_training']`) the button is disabled and a second click sends no second rpc** (Review Focus 3).
  - Save with no picks is allowed. A failed save (`rpcResults.save_training` with an error) stays on the page with the fields and picks unchanged.
  - Edit (`/admin/eagles/trainings/t1/edit`): loads the saved date, title and picks in order; Save sends `p_id: 't1'`; `Delete training` asks `Delete this training?`, and confirming deletes it and goes to `/admin/eagles/trainings`; an unknown id shows `Page not found`. The new page has no Delete button.
  - `routes.test.tsx`: `/admin/eagles/trainings/new` renders the builder stub, not the view stub.
- [ ] **Step 2: Run** `npx vitest run src/pages/admin/TrainingBuilderPage.test.tsx src/routes/routes.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the page and the two routes.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat: a coach builds a training by picking videos from the catalog`.

---

### Task 9: Backup, full check, pull request, rollout

**Files:**
- Modify: `scripts/backup.ts`

- [ ] **Step 1:** Add to `TABLES` in `scripts/backup.ts`: `training_types: ['id']`, `training_videos: ['id']`, `trainings: ['id']`, `training_items: ['training_id', 'video_id']`.
- [ ] **Step 2: Run** `npm test` and `npm run build`. Expected: every test passes; the build finishes with no type errors.
- [ ] **Step 3: Run** `bash scripts/rehearse.sh` once more. Expected: `TENANCY TESTS PASSED`.
- [ ] **Step 4: Commit** `chore: the backup includes the training tables`, push, and open a draft pull request to `main` titled `feat: training catalog and daily trainings`.
- [ ] **Step 5: Stop and ask the user** before touching the live project. There is no local database, so the browser check needs the migration on the live one; it only adds, and the deployed app does not use the new tables.
- [ ] **Step 6: After their go-ahead** (spec §8): `supabase db push --linked --dry-run`, then `supabase db push --linked --yes`; then `supabase functions deploy create-admin`.
- [ ] **Step 7: Browser check** with `npm run dev`, phone-sized window, in English and Arabic. Superadmin: tick Training for a test admin; add a type and two videos, play one, edit one, reorder, delete one. Coach with `training`: build today's training with two videos, reorder, save, play both (only one plays at a time), edit, delete. Coach without `training`: no tab; `/admin/<slug>/trainings` lands on History. Remove the test data afterwards.
- [ ] **Step 8:** Mark the pull request ready and report to the user; merging it deploys the app through Vercel. After the deploy the superadmin fills the catalog and ticks **Training** for the admins who should have it.
