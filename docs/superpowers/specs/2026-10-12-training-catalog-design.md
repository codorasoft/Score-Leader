# Training catalog and daily trainings — Design Spec

**Date:** 2026-10-12
**Status:** Approved in conversation; awaiting written review

## 1. Goal

A coach wants to open the app at the pitch and see what the team trains today, as a list of
drill videos that play inside the app. The videos come from one catalog that the superadmin
maintains for every league, so each coach picks from ready material instead of collecting links.

Decisions made with the superadmin:

- The **superadmin** owns one catalog: training types (for example warm-up, passing, shooting), and inside each type, videos added by YouTube link. The catalog is shared by all leagues.
- An **admin (coach)** builds a training for a date in their own league by picking several catalog videos.
- **Only the signed-in coach** sees a training and shows it on their own phone. There is no public link and no player access.
- Videos are **YouTube embeds played in the page**. No video files are stored by the app.
- Training is a **switchable feature** (`training`), off until the superadmin turns it on for an admin.
- A training **points to** catalog videos; it does not copy them. Fixing a title or link in the catalog fixes it in every training.

**Success criteria:**

- The superadmin can add, rename, reorder and delete types and videos.
- A link that is not a YouTube video link is refused, in the app and in the database.
- A coach with `training` can create, edit and delete trainings in their own leagues only, and can play every picked video without leaving the app.
- An admin without `training` sees no Training tab, cannot read the catalog, and cannot read or write trainings, even by calling the API directly.
- Visitors (not signed in) can read none of it.

## 2. Data

### `training_types` (catalog, global)

| Column | Type / check | Notes |
|---|---|---|
| `id` | uuid PK, `gen_random_uuid()` | |
| `name` | text, trimmed length 1–80 | any language |
| `sort_order` | int NOT NULL | list order, lowest first |
| `created_at` | timestamptz, `now()` | |

### `training_videos` (catalog, global)

| Column | Type / check | Notes |
|---|---|---|
| `id` | uuid PK, `gen_random_uuid()` | |
| `type_id` | uuid NOT NULL → `training_types(id)` ON DELETE CASCADE | indexed |
| `title` | text, trimmed length 1–120 | typed by the superadmin |
| `youtube_id` | text, CHECK `~ '^[A-Za-z0-9_-]{11}$'` | the video ID only, never the link |
| `sort_order` | int NOT NULL | order inside the type |
| `created_at` | timestamptz, `now()` | |

`UNIQUE (type_id, youtube_id)`: the same video cannot be added twice to one type, but may sit in two types.

### `trainings` (per league)

| Column | Type / check | Notes |
|---|---|---|
| `id` | uuid PK, `gen_random_uuid()` | |
| `league_id` | uuid NOT NULL → `leagues(id)` ON DELETE CASCADE | set by the app; indexed with `training_date` |
| `training_date` | date NOT NULL | the day of the training |
| `title` | text NULL, trimmed length 1–80 when set | optional; the date is shown when empty |
| `created_at`, `updated_at` | timestamptz, `now()` | |

Several trainings may share a date.

### `training_items` (videos picked for a training)

| Column | Type / check | Notes |
|---|---|---|
| `training_id` | uuid NOT NULL → `trainings(id)` ON DELETE CASCADE | |
| `video_id` | uuid NOT NULL → `training_videos(id)` ON DELETE CASCADE | indexed |
| `position` | int NOT NULL, ≥ 0 | order in the training |
| `league_id` | uuid NOT NULL → `leagues(id)` ON DELETE CASCADE | copied from the training by the existing `set_league_from_parent('trainings', 'training_id')` trigger |

Primary key `(training_id, video_id)`: a video appears once per training.

Deleting a catalog video (or a type, which deletes its videos) removes it from every training that used it. The training itself stays, possibly with fewer or no videos. Deleting a league deletes its trainings.

### Feature key

`training` is added as the 15th key in `supabase/functions/_shared/features.ts` (no dependency on another feature) and in the database function `valid_features`, replaced with `CREATE OR REPLACE`. No existing profile changes: nobody has `training` until the superadmin ticks it.

### Saving a training

One database function, `save_training(p_id uuid, p_league_id uuid, p_date date, p_title text, p_video_ids uuid[])`, running with the caller's rights (so the rules in §3 apply), in one transaction:

1. `p_id` NULL: insert the training into `p_league_id`. Otherwise update `training_date`, `title`, `updated_at` of that training (`p_league_id` is ignored; a training never changes league) and raise an error when no row was updated, which is the case for a training that does not exist or belongs to someone else.
2. Delete the training's items and insert one per entry of `p_video_ids`, `position` = its place in the array. An id that is no longer in the catalog is skipped (the video was deleted while the coach was building), and an id given twice keeps its first place only.
3. Return the training id.

A title that is empty or only spaces is stored as no title.

This way a failed save never leaves a training with half its videos.

## 3. Database rules

One new helper, `caller_has_feature(p_feature text)` (SQL, STABLE, SECURITY DEFINER, empty `search_path`, like the existing helpers): true when the caller has an enabled `admin` profile whose `features` contain the key.

| Table | Read | Write |
|---|---|---|
| `training_types`, `training_videos` | `is_superadmin()` or `caller_has_feature('training')` | `is_superadmin()` only |
| `trainings` | `owns_league(league_id)` and `league_has_feature(league_id, 'training')` | the same |
| `training_items` | the same as `trainings`; plus `is_superadmin()` for read only | the same as `trainings` |

All policies are `TO authenticated`; `anon` has none, so visitors read nothing. The superadmin reads `training_items` only to count how many trainings use a video before deleting it (§5); the superadmin cannot read `trainings` or change either table.

## 4. YouTube handling

`src/utils/youtube.ts`, pure functions:

- `parseYouTubeId(input)` returns the 11-character ID or `null`. Accepted hosts: `youtube.com`, `www.youtube.com`, `m.youtube.com`, `music.youtube.com`, `youtube-nocookie.com`, `www.youtube-nocookie.com`, `youtu.be`. Accepted shapes: `/watch?v=ID`, `/shorts/ID`, `/embed/ID`, `/live/ID`, and `youtu.be/ID`. Extra query parameters (`t`, `si`, `list`, …) are ignored. A missing `https://` is tolerated. Anything else, including a bare ID or a playlist link without a video, returns `null`.
- `youtubeThumbnail(id)` → `https://i.ytimg.com/vi/<id>/hqdefault.jpg`.
- `youtubeEmbedUrl(id)` → `https://www.youtube-nocookie.com/embed/<id>?autoplay=1&playsinline=1&rel=0`.
- `youtubeWatchUrl(id)` → `https://www.youtube.com/watch?v=<id>`.

`src/components/TrainingVideo.tsx` shows one video:

- **Before a tap:** the thumbnail (16:9, lazy-loaded) with a play button. If the thumbnail fails to load, a grey box with the play button.
- **After a tap:** the thumbnail is replaced by the YouTube iframe, which starts playing. The iframe has `allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"`, `allowFullScreen`, a `title` (the video title) and `referrerPolicy="strict-origin-when-cross-origin"` (YouTube refuses embeds that send no referrer).
- **One player at a time:** the page holding the list keeps the id of the playing video; starting another returns the first to its thumbnail.
- **Fallback link:** under every video, "Open on YouTube" opens `youtubeWatchUrl` in a new tab. When the owner has blocked embedding, or the video was removed or made private, YouTube shows its own message inside the player and this link is the way out. The app does not check video availability itself.

Known limits, accepted: videos need an internet connection; YouTube may show ads.

## 5. Superadmin screens

`SuperLayout` gets a third tab, **Training**.

| Path | Page |
|---|---|
| `/super/training` | Training types |
| `/super/training/:typeId` | Videos of one type |

**Training types** (`src/pages/super/TrainingTypesPage.tsx`): each row shows the name and its video count and opens the type. A field with an Add button creates a type at the end of the list. Each row has move up / move down. Empty state: "No training types yet".

**Videos of one type** (`src/pages/super/TrainingTypePage.tsx`):

- Header: back to the list; the type name with Rename; Delete type.
- Add form: YouTube link and title. While the link is valid its thumbnail is shown as a preview. Add is disabled until the link parses and the title is not empty. A video already in this type shows "This video is already in this type".
- Each row: `TrainingVideo` (so the superadmin can check that it plays), the title with Edit (title and link), move up / move down, Delete.
- **Delete video** asks for confirmation and says "Used in N trainings; it will be removed from them" when N > 0. **Delete type** asks for confirmation with the number of videos it holds.

Moving a row swaps its `sort_order` with its neighbour's. A new row gets the highest `sort_order` plus one.

## 6. Coach screens

`AdminLayout` gets a **Training** tab, shown only with `training` (between History and Coach Board). All routes sit under `/admin/:slug` behind `FeatureRoute name="training" fallback="history"`.

| Path | Page |
|---|---|
| `trainings` | List |
| `trainings/new` | Builder (new) |
| `trainings/:trainingId` | View |
| `trainings/:trainingId/edit` | Builder (edit) |

**List** (`TrainingsPage.tsx`): a "+ New training" button and three groups, each hidden when empty: **Today**, **Upcoming** (nearest first), **Past** (latest first). "Today" is the device's local date. A row shows the title (or the formatted date when there is none), the date, and the video count, and opens the View. Empty state: "No trainings yet".

**Builder** (`TrainingBuilderPage.tsx`):

- Date (today by default on a new training) and optional title.
- **Picked videos** at the top, numbered, each with move up / move down and Remove.
- **Catalog** below, grouped by type in catalog order; a type with no videos is not shown. Each video is a row with thumbnail and title; tapping it ticks or unticks it. A ticked video is added at the end of the picked list. Videos do not play here.
- Save calls `save_training` and opens the View. Save is allowed with no videos picked.
- On an existing training: Delete training, with confirmation.
- Empty catalog: "No videos in the catalog yet".

**View** (`TrainingViewPage.tsx`), what the coach shows at the pitch: the title and date, an Edit button, then the picked videos in order, each numbered with its `TrainingVideo`, its title and its type name. A training with no videos shows "No videos in this training" and the Edit button. An unknown id shows the existing "Page not found".

Loading and load failure use the patterns of the existing pages (a loading line; "Could not load" with Retry). A refused or failed save shows the existing error toast and keeps the form as typed. There is no offline queue for trainings: building and viewing need a connection.

All texts are added to `src/locales/en.json` and `src/locales/ar.json`; the layout follows the page direction (RTL in Arabic) like the rest of the app.

## 7. Code layout

| File | Purpose |
|---|---|
| `supabase/migrations/20261012000001_training.sql` | tables, indexes, trigger, `valid_features`, `caller_has_feature`, `save_training`, policies |
| `supabase/functions/_shared/features.ts` | add `training` |
| `src/utils/youtube.ts` | link parsing and URLs (§4) |
| `src/lib/trainingApi.ts` | every query: catalog read and write, training list, one training with its videos, save, delete, use count of a video |
| `src/components/TrainingVideo.tsx` | thumbnail that becomes the player (§4) |
| `src/pages/super/TrainingTypesPage.tsx`, `TrainingTypePage.tsx` | §5 |
| `src/pages/admin/TrainingsPage.tsx`, `TrainingBuilderPage.tsx`, `TrainingViewPage.tsx` | §6 |
| `src/router.tsx`, `src/layouts/SuperLayout.tsx`, `src/layouts/AdminLayout.tsx` | routes and tabs |
| `scripts/backup.ts` | add the four tables to its table list |

## 8. Rollout

The migration only adds, so the deployed app keeps working at every step.

1. Rehearse with `scripts/rehearse.sh` (migration plus database rules tests in a rolled-back transaction).
2. Apply the migration.
3. Redeploy the `create-admin` Edge Function: it shares the feature list, and the old copy would refuse a new admin that has `training`.
4. Deploy the app.
5. The superadmin fills the catalog and ticks **Training** for the admins who should have it.

## 9. Testing

1. **`src/utils/youtube.test.ts`:** every accepted link shape and host; extra parameters; missing scheme; refused inputs (other sites, look-alike hosts such as `youtube.com.evil.com`, bare ID, playlist-only link, wrong ID length, empty text).
2. **Database rules** (added to `supabase/tests/tenancy.test.sql`):
   - `valid_features` accepts all 15 keys.
   - An admin cannot insert, update or delete catalog rows; the superadmin can.
   - An admin without `training` reads no catalog rows; with it, reads them. Visitors read none.
   - Admin A creates a training in their league; admin B cannot read, change or delete it, and cannot create one in A's league.
   - With `training` removed from A, A can neither read nor write trainings.
   - `training_items.league_id` is filled from the training.
   - `save_training` replaces the items in the given order; called for another admin's league, it fails and changes nothing.
   - Deleting a catalog video removes its items and keeps the training; deleting the league removes its trainings and items (the four tables join the existing "no rows left after the league is deleted" lists where they carry `league_id`).
   - A `youtube_id` that is not 11 valid characters is rejected.
3. **Feature list:** the existing feature tests cover 15 keys; the checklist shows Training.
4. **Component and page tests** (vitest, with the existing fake Supabase):
   - `TrainingVideo`: no iframe before the tap; the right embed URL after; the fallback link.
   - Catalog pages: add refused for a bad link; duplicate message; delete confirmation with the use count.
   - Builder: pick several, reorder, save sends the ids in order; edit loads the saved picks.
   - View: videos in saved order; only one player at a time.
   - Tabs and routes: no Training tab and a redirect to history without `training`.
5. **Browser check** on a phone-sized screen, in English and Arabic: superadmin adds a type and videos; a coach with the feature builds today's training and plays two videos; a coach without the feature sees nothing.

## 10. Out of scope

- Players or visitors opening a training (public link).
- Coaches adding their own videos or types.
- Notes per video (sets, minutes) or a note on the training.
- Copying a previous training.
- Filling in the title automatically from YouTube.
- Videos from other sites, or uploaded video files.
- Offline building or viewing.
- Catalog names in two languages (a name is one text, in whatever language it is typed).
