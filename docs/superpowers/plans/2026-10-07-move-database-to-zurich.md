# Move the Database from Singapore to Zurich: Plan

**Status:** Draft for review. Nothing has been changed yet.

## Why
The Supabase project `tunwvypccjsbzlclmxrk` is in Singapore (`ap-southeast-1`). Measured from Palestine, a round trip there takes **~196 ms**; to Zurich (`eu-central-2`) it takes **~57 ms**. The database itself answers in ~1 ms, so nearly all the waiting is distance.

An admin reload makes 4–5 database trips in a row, so it would drop from ~1.1–1.4 s of waiting to ~0.3–0.4 s. Every save (goals, cards, team changes) gets ~3× faster too.

Supabase cannot move a project to another region. So we **create a new project in Zurich, copy everything into it, then switch the app over**. The old project stays untouched as a fallback.

## What has to move (measured 2026-10-07)
| Item | Amount | How it moves |
|---|---|---|
| Database structure | 21 migrations: 40 policies, 10 functions, 13 triggers, realtime on `matches` and `match_events`, 2 storage buckets | `supabase db push` to the new project |
| Data | 13 MB in all tables (players, sessions, matches, events, awards, votes, coach boards, leagues, admin profiles) | Copy script (service key), parents before children, **same ids** |
| Logins | 2 accounts (`admin@codorasoft.com`, `info@codorasoft.com`) | Recreated with the **same user ids and the same password hashes**, so passwords don't change |
| Photos | 1 player photo, 0 league logos | Re-uploaded to the same paths; `photo_url` / `logo_url` rewritten to the new project's address |
| Server functions | `create-admin`, `delete-league`, `reset-admin-password` | `supabase functions deploy` to the new project |
| Login settings | Site URL / redirect URLs / email settings set in the dashboard | Copied by hand from the old project's dashboard |
| App settings | Vercel environment variables (database address + public key), local `.env` | Changed at the switch |

Unchanged: the website address, every share/vote/league link (ids and tokens are copied as they are), and all features.

## Phase 1: Build the Zurich project (no effect on the live app)
1. Create project **Score-Leader (Zurich)** in `eu-central-2` in the same organisation, on the free plan. The org then has 2 projects; the free limit is 2.
2. Push all migrations to it (`supabase db push --project-ref <new>`).
3. Deploy the 3 server functions to it.
4. Copy the login settings (Site URL, redirect URLs, email confirmation, rate limits) from the old dashboard to the new one.
5. **Check:** compare the old and new structure by name, not just by count. Every policy, function, trigger, realtime table and storage bucket must match. Anything created in the dashboard and missing from the migrations is added as a new migration first.

## Phase 2: Rehearsal (no effect on the live app)
1. Write `scripts/copy-project.ts`, using the existing `scripts/backup.ts` as a base. It copies logins (same ids and password hashes), all table rows (in dependency order, same ids) and storage objects, and rewrites photo/logo URLs. It ends by comparing row counts per table, old vs new, and stops on any difference.
2. Run it into the Zurich project.
3. Run the app **locally** against Zurich and check:
   - both admins can sign in with their current passwords;
   - Home, Players (with the photo), History and a past session look the same;
   - the public league page and the old session link work;
   - live updates work.
4. Clear the rehearsal data from Zurich; the real copy happens at the switch.

## Phase 3: The switch (~15 minutes, at a time with no session running and no open votes)
1. **Final backup** of the old project with `scripts/backup.ts`, to `E:\Score-Leader-backups\<time>`.
2. **Copy** with `scripts/copy-project.ts`. It must finish with every row count equal.
3. **Point the app at Zurich:** change the two Vercel environment variables (database address and public key) and redeploy. Update the local `.env` and link the CLI to the new project.
4. **Check production:**
   - sign in;
   - Home, a past session and the photo;
   - the public league page and the live link;
   - create and delete a test session.
5. **Freeze the old project:** set it read-only, so a phone still running the previous app version (which knows the old address) can't save into it. The installed app updates itself on its next load.

## After the switch
- **Signing in again:** admins have to sign in once more, because logins from the old project don't carry over. Passwords are unchanged. Public pages need no login.
- **The old project:** it stays (read-only) for **one week** as a fallback, then gets paused. Deleting it is your decision.
- **Records:** project memory and notes get updated to the new project ref.

## Rollback (at any point up to one week)
Put the old values back in the two Vercel variables, redeploy, and turn read-only off on the old project. That takes about 5 minutes. Anything saved in Zurich after the switch would need copying back, so a rollback is only worth doing early.

## What needs you
- **Approve this plan** and choose a time for Phase 3 when no session is running and no votes are open.
- **Vercel:** either change the two environment variables in the Vercel dashboard when I give you the values (2 minutes), or install and log in to the Vercel CLI (`npm i -g vercel`, then `! vercel login`) so I can do it.
- **Login settings:** copy the old project's Auth settings in the Supabase dashboard if I can't read them through the CLI.

## Risks and how they're covered
| Risk | Cover |
|---|---|
| Something in the old database isn't in the migrations | Phase 1 check compares by name; any gap becomes a migration before copying |
| Passwords don't carry over | Phase 2 rehearsal proves both admins sign in with their current passwords before the real switch |
| Data written during the switch is lost | Switch when nothing is happening; final row-count comparison; old project frozen afterwards |
| An old installed app keeps talking to Singapore | Old project is read-only after the switch; the app auto-updates on its next load |
| The new project misbehaves | Old project untouched for a week; rollback takes about 5 minutes |
