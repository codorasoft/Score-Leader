# Morning Push — Design Spec

**Date:** 2026-10-13
**Status:** Design agreed in conversation; awaiting review of this document

## 1. Goal

"Today in the app" (spec of 2026-10-13) tells the coach what is on today only when he opens
the app. This release tells him with the app closed: a notification on his phone or computer
each morning, at the hour he chose, when his schedule has something on that day.

Decisions made with the user:

- **A real push**, delivered by the browser's own push service (Web Push). No paid service.
- **The coach picks the hour**, a whole hour in his own time zone, 07:00 unless he changes it.
- **Per device:** each phone or computer is turned on by itself and has its own hour.
- **One notification for all his leagues**, and none on a day with nothing on it.
- **"Send a test now"** in the app, so the feature can be checked without waiting for morning.
- **An app icon drawn for the app** (a dark tile with a blocky white "SL" and a thin green
  line), because the icon files the app points to do not exist, and an iPhone only delivers
  a push to an app added to the home screen.
- **No new feature key:** anyone with `schedule` can turn it on.

## 2. How it works, end to end

1. **On the device, once.** The coach opens the Morning notification dialog on the schedule
   page, picks an hour and taps Turn on. The browser asks for permission and hands the app a
   push address for that device. The app saves the address with the device's time zone, the
   hour and the app's language.
2. **On the server, every 15 minutes.** A job in the database calls the server function
   `send-morning-push`.
3. **The function** finds the devices that are due (section 5), reads today's items for each
   coach, and sends one encrypted message per device to its push address.
4. **The browser maker's push service** (Google for Chrome and Android, Apple for iPhone and
   Safari, Mozilla for Firefox) delivers it. The app's service worker wakes and shows the
   notification.
5. **A tap** on the notification opens the schedule.

## 3. Data

### `push_subscriptions` (one row per device)

| Column | Type / check | Notes |
|---|---|---|
| `id` | uuid PK, `gen_random_uuid()` | |
| `user_id` | uuid NOT NULL → `admin_profiles(user_id)` ON DELETE CASCADE | the coach |
| `endpoint` | text NOT NULL UNIQUE, starts with `https://`, at most 2000 characters | the device's push address |
| `p256dh`, `auth` | text NOT NULL, at most 200 characters each | the device's keys, needed to encrypt for it |
| `time_zone` | text NOT NULL | an IANA name such as `Asia/Riyadh` |
| `notify_hour` | smallint NOT NULL, 0–23 | the hour chosen |
| `language` | text NOT NULL, `en` or `ar` | the language of the notification |
| `last_sent_on` | date NULL | the local day last handled for this device |
| `created_at`, `updated_at` | timestamptz, `now()` | |

Index on `user_id`.

### Rules

- **Read and delete:** the row's own coach only (`user_id = auth.uid()`), `authenticated` only.
- **No direct insert or update.** A row is written through
  `save_push_subscription(endpoint, p256dh, auth, time_zone, notify_hour, language)`:
  - refused unless the caller is an enabled admin with `schedule` (`caller_has_feature`);
  - the time zone must look like a zone name (letters, digits, `_`, `+`, `-`, `/`, at most
    64 characters). Whether the name is a real one is decided where it is used: the server
    function skips a device whose zone it cannot read (section 5), because the function's
    list of zones, not the database's, is the one that counts;
  - adds the row, or, when the address is already stored, updates it and makes the caller
    its owner. Knowing the address and its keys is the proof of holding the device, so a
    second coach signing in on the same browser takes the row over.
  - `last_sent_on` is kept when the owner is unchanged and cleared when the owner changes.
- Visitors, other admins and the superadmin read nothing and change nothing.
- The server function works with the service role.
- The table is not added to `scripts/backup.ts`: a row is tied to one browser and is made
  again by turning the notification on.

### The scheduled job

The migration installs `pg_cron` and `pg_net` (both available on the live project and not
yet installed; checked 2026-10-13) and adds:

- `kick_morning_push()`: does nothing while `push_subscriptions` is empty, or while either
  of two values is missing from the database's secret store (Vault): `morning_push_url` and
  `morning_push_secret`. Otherwise it posts to that address with the secret as a bearer
  token. Not callable by `anon` or `authenticated`.
- a job `morning-push` that runs `kick_morning_push()` every 15 minutes;
- a job `purge-cron-history` that once a day deletes job history older than 7 days.

No secret and no project address is written in the migration; both are put into Vault by
hand during the rollout (section 9).

## 4. The server function `send-morning-push`

Its gateway check is off (`verify_jwt = false`); it checks the caller itself, in one of two
ways:

- **The job:** the bearer token equals the function's own `MORNING_PUSH_SECRET`. It runs
  the morning round (section 5).
- **A signed-in coach, for a test:** the bearer token is the session of an enabled admin
  with `schedule`, and the body is `{ "test": true, "endpoint": "<this device's address>" }`.
  It sends to that one device of his, whatever the hour, and does not touch `last_sent_on`. With nothing on today the text
  is a sample line saying this is where the morning notification will appear.

Anything else is answered 403. Answers carry counts and a result word only, never an
address, a key or a title.

Messages are encrypted and signed with the `web-push` library, using a key pair (VAPID)
made for this app: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (the app's
web address) are function secrets.

## 5. Who is due, and what is sent

For each row whose coach is an enabled admin with `schedule`:

- Work out the local date and hour in the row's `time_zone` at this moment. A row whose
  time zone the function cannot read is skipped.
- The row **is due** when the local hour is `notify_hour` or the hour after it, on the same
  local day, and `last_sent_on` is not that local day. The second hour gives a failed send
  seven more tries; the hour after 23:00 is the next day, so for 23 the window is that one
  hour.
- A device turned on in the afternoon therefore gets its first notification the next
  morning; one turned on inside its window gets it within 15 minutes.

For each due coach, once for all his due devices:

- Read **every league he owns**: schedule items that can fall on the local date, match
  sessions dated that day, and training plans dated that day when he has `training`.
- Turn them into rows with the same rule as the popup (`todayRows`): timed items by start,
  all-day items, sessions, plans; a task already ticked as done is left out.
- **No rows:** nothing is sent; `last_sent_on` is set, so the day is not read again.
- **Rows:** one message per due device, then by the answer of the push service:
  - accepted: `last_sent_on` is set to the local date;
  - the address no longer exists (404 or 410): the row is deleted;
  - any other failure: nothing is changed, and the next run tries again.

### The notification

- **Title:** "Today: 3 items" ("Today: 1 item"); in Arabic with its plural forms.
- **Body:** up to five lines, one per row: the time when it has one, then the item's title,
  "Match session", or "Training plan" with the plan's title. With rows in more than one
  league each line starts with the league's name. Further rows become one more line,
  "+2 more". A line longer than 80 characters is cut, so the whole message stays well under
  the 4 KB the push services accept.
- **Kept for 12 hours:** a phone that is off or out of reach at the hour still gets the
  notification when it is back that day; after 12 hours the push service drops it.
- **Language and direction** follow the row's `language`.
- **Tap:** with rows in one league, that league's schedule; in several, `/admin`.
- **Tag** `today-<date>`: a second message for the same day replaces the first on the
  device instead of stacking.
- Icon and badge are the app's own (section 7).

The few words the function needs ("Today", "Match session", "Training plan", "more") are
kept beside it in both languages, and a test holds them equal to the app's locale files.

### One copy of the day logic

Which item is on which day, and the rows of a day, move from `src/utils/schedule.ts` to
`supabase/functions/_shared/scheduleDay.ts`, the folder the app and the functions already
share (as `features.ts` is). `src/utils/schedule.ts` re-exports them, so nothing that
imports from it changes.

## 6. The app

### The service worker

The generated service worker loads one more file, `push-sw.js`:

- **On a push:** shows the notification from the message. A message it cannot read still
  shows a plain notification under the app's name that opens `/admin`: an iPhone can
  withdraw the permission from an app whose pushes show nothing.
- **On a tap:** closes the notification, brings an open window of the app to the front and
  takes it to the address, or opens a new one.

### The Morning notification dialog

A bell button in the schedule page's heading row, labelled with the state ("Morning
notification: off", "…: on, 07:00"), opens the dialog. What it shows depends on the device:

| State | Shown |
|---|---|
| This browser cannot do push | one line saying so |
| iPhone or iPad, app not on the home screen | how to add it (Share, then Add to Home Screen), and that the notification is turned on from there |
| Notifications blocked for the app | that they are blocked, and that they are allowed again in the browser's or phone's settings |
| Off | the hour picker (00:00–23:00, 07:00 chosen), a line that item titles appear in the notification, and **Turn on** |
| Asked, and the question closed without an answer | stays Off, with nothing said |
| On | the hour picker (a change is saved at once), **Send a test now** and **Turn off** |

- **Turn on** asks the browser for permission, takes the device's address and saves it. A
  refusal lands in the blocked state. A failed save leaves it off and says so.
- **Turn off** deletes the row and gives the address back to the browser.
- **Send a test now** calls the function and reports "Sent" or that it could not be sent.
- Buttons are off while their request runs.

### Kept right without asking

- **On opening the admin area,** when this device is on, the app saves its address, time
  zone and language again if any of them differs from what is stored. A coach who travels,
  switches language, or whose browser renewed the address is followed without doing
  anything.
- **On signing out,** the device's row is deleted and its address given back, so a shared
  browser does not go on showing a coach's items. Without a connection the address is still
  given back locally; the next send finds it gone and deletes the row.

### Set-up values

The public half of the key pair is `VITE_VAPID_PUBLIC_KEY` in the tracked `.env.production`
(public values only) and in `.env.example`. Without it (local development) the dialog is in
the "cannot do push" state.

## 7. Icons

One script draws the tile from a single definition and writes:

| File | Use |
|---|---|
| `public/favicon.svg` | browser tab |
| `public/icons/icon-192.png`, `icon-512.png` | home screen and notification icon |
| `public/icons/icon-maskable-512.png` | Android's shaped icons (the mark kept inside the safe area) |
| `public/apple-touch-icon.png` (180) | iPhone home screen |
| `public/icons/badge-96.png` | the small white mark in Android's status bar |

The files are committed; a test holds them equal to what the script draws. The manifest
lists the three app icons; `index.html` gains the icon links and the iPhone home-screen
tags. A real logo later means replacing these files and dropping that test.

## 8. Code layout

| File | Purpose |
|---|---|
| `supabase/migrations/20261013000001_morning_push.sql` | the table and its rules, `save_push_subscription`, the extensions, `kick_morning_push`, the two jobs |
| `supabase/tests/tenancy.test.sql` | database rules tests |
| `supabase/config.toml` | `verify_jwt = false` for the function |
| `supabase/functions/_shared/scheduleDay.ts` | the day logic, moved here |
| `supabase/functions/_shared/morningPush.ts` | pure: the local clock, who is due, the notification's text, the round and the test send with their outside calls handed in |
| `supabase/functions/send-morning-push/index.ts` | checks the caller, reads and writes the database, sends with `web-push` |
| `src/utils/schedule.ts` | re-exports the day logic |
| `public/push-sw.js` | the service worker's push and tap handlers |
| `vite.config.ts`, `index.html` | load `push-sw.js`; manifest icons; icon links and iPhone tags |
| `src/lib/push.ts` | what this device can do, its state, turn on, turn off, test, keep right, forget on sign-out |
| `src/components/MorningPushDialog.tsx` | the dialog |
| `src/pages/admin/SchedulePage.tsx` | the bell button |
| `src/layouts/AdminLayout.tsx`, `src/hooks/useAuth.ts` | keep right on open; forget on sign-out |
| `scripts/makeIcons.ts`, `public/…` | the icon script and its files |
| `scripts/makePushKeys.ts` | makes the key pair and the job secret |
| `supabase/functions/_shared/morningPushData.ts` | the round's reads and writes over a database client handed in, so they are tested |
| `.env.production`, `.env.example` | the public key |
| `src/locales/en.json`, `src/locales/ar.json` | the dialog's wording |

## 9. Rollout

Steps 3 to 8 are not done without the user's go-ahead. Steps 1 and 2 belong to building:
the rehearsal runs in a transaction that is rolled back, as for earlier work, and the keys
are made on this machine only. The steps are in an order in which the app already live keeps
working at every point (the migration only adds).

1. Rehearse the migration and the database tests on the live database in a transaction
   that is rolled back (`bash scripts/rehearse.sh`).
2. Make the key pair and a random job secret. This is done while building, because the
   pull request carries the public key in `.env.production`: a script writes the private
   key and the job secret into the git-ignored `.env.zurich.local` on this machine, which
   changes nothing live.
3. Set the four function secrets (`supabase secrets set`).
4. Apply the migration (`supabase db push --linked`, dry run first).
5. Put the function's address and the job secret into Vault.
6. Deploy the function.
7. Merge the pull request; Vercel deploys the app.
8. The user turns the notification on on a phone and taps Send a test now.

Until step 5 the job does nothing; until someone turns the notification on it makes no call.

## 10. Testing

- **Day logic:** the existing tests, unchanged, now running against the shared file.
- **Who is due:** before, at and after the hour; the second hour; already handled today;
  hour 23; a time zone half an hour off (India); the two days a year the clock changes; an
  unknown time zone; a coach who lost `schedule` or was disabled.
- **The round:** two devices of one coach read the day once; several leagues; nothing
  today marks the day and sends nothing; accepted, gone and failed answers; one device's
  failure does not stop the others.
- **The test send:** only the caller's own device; a sample on an empty day; `last_sent_on`
  untouched.
- **The text:** counts and plural forms in both languages; five lines and "+N more";
  league names only with several leagues; a plan with no title; the tap address; the words
  equal to the locale files.
- **The function's door:** the job secret, a coach's session, and anything else refused.
- **Database rules:** the owner reads and deletes only his rows; no direct insert or
  update; the save function's refusals; taking a row over; another admin, the superadmin
  and visitors get nothing; deleting the coach removes his rows; `kick_morning_push` is not
  callable through the API and stays quiet without its two values.
- **Service worker:** a push shows the notification; an unreadable one shows the plain one;
  a tap focuses or opens the app at the address.
- **The app:** every dialog state; turn on (granted, refused, save failed), change of hour,
  turn off, test; kept right on open; forgotten on sign-out; the bell and its label; Arabic.
- **Icons:** the committed files equal what the script draws.

What no test here can prove is delivery by Google's and Apple's push services to a real
phone. That is step 8 of the rollout.

## 11. Out of scope

- A reminder shortly before an item's time, or more than one notification a day.
- Choosing which leagues or which kinds of item are included.
- One hour for all of a coach's devices, or a setting for it in the superadmin's pages.
- Players or visitors receiving anything.
- The store app. A phone app built by wrapping this one cannot use Web Push (the browser
  built into such an app has none) and will need Apple's and Google's own push; the table,
  the job and the round are built so that another way of sending can be added beside this
  one.
