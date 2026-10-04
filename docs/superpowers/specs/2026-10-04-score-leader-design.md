# Score-Leader — Design Spec

**Date:** 2026-10-04  
**Author:** codorasoft  
**Status:** Approved for implementation

---

## 1. Overview

Score-Leader is a Progressive Web App (PWA) for managing weekly 5v5 football sessions among a fixed group of friends. The admin controls all session and match operations; players access a public read-only link for live scores, stats, and award voting.

**Success criteria:**
- Admin can run a full session (attendance → teams → matches → awards) from a phone without friction
- Players can view live scores and leaderboards via a shared link, no login required
- All stats accumulate over time into accurate all-time leaderboards

---

## 2. Architecture

### Stack
- **Frontend:** React 18, Vite, TypeScript, TailwindCSS — deployed as a PWA
- **Backend:** Supabase (PostgreSQL, Auth, Realtime, Row Level Security)
- **Hosting:** Vercel (frontend) + Supabase Cloud (backend) — both on free tier
- **Key libraries:** react-router-dom v6, dnd-kit (drag-and-drop), date-fns, Supabase JS v2

### Route zones
- `/admin/*` — password-protected, admin only (Supabase Auth, email + password)
- `/s/:token` — public shareable routes (read-only, no login)

### PWA
- Installable on Android/iOS via "Add to Home Screen"
- Offline support for reading stats; live match tracker requires connection

---

## 3. Data Model

### `players`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | |
| position | enum | GK / DEF / MID / ATT |
| skill_rating | int | 1–5, set once by admin |
| photo_url | text | nullable |
| is_active | bool | soft delete |
| created_at | timestamptz | |

### `sessions`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| date | date | |
| status | enum | draft / active / completed |
| share_token | text | unique, for public URL `/s/:token` |
| created_at | timestamptz | |

### `session_players`
| Column | Type | Notes |
|---|---|---|
| session_id | uuid FK | |
| player_id | uuid FK | |

### `teams`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| session_id | uuid FK | |
| color | enum | red / blue / yellow |
| name | text | nullable, optional custom name |

### `team_players`
| Column | Type | Notes |
|---|---|---|
| team_id | uuid FK | |
| player_id | uuid FK | |

### `matches`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| session_id | uuid FK | |
| match_number | int | 1-indexed within session |
| team1_id | uuid FK | |
| team2_id | uuid FK | |
| waiting_team_id | uuid FK | |
| status | enum | pending / active / completed |
| team1_score | int | default 0 |
| team2_score | int | default 0 |
| winner_team_id | uuid FK | nullable |
| is_draw | bool | default false |
| draw_resolved_by | enum | penalties / late_team / null |
| timer_started_at | timestamptz | nullable |
| timer_elapsed_seconds | int | accumulated elapsed time |
| timer_status | enum | running / paused / stopped |
| created_at | timestamptz | |

### `match_events`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| match_id | uuid FK | |
| player_id | uuid FK | |
| team_id | uuid FK | |
| event_type | enum | goal / assist / yellow_card / red_card / penalty_goal |
| related_event_id | uuid FK | nullable — links assist to its goal |
| minute | int | nullable, derived from timer |
| suspension_minutes | int | nullable — for red cards (2 or 3) |
| suspension_started_at | timestamptz | nullable |
| suspension_ended_at | timestamptz | nullable — null until lifted |
| created_at | timestamptz | |

### `award_votes`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| session_id | uuid FK | |
| award_type | enum | mvp / fair_play |
| status | enum | open / closed |
| winner_player_id | uuid FK | nullable until decided |
| decided_by | enum | admin_direct / vote |
| vote_token | text | unique UUID for shareable URL |
| created_at | timestamptz | |

### `award_vote_nominations`
| Column | Type | Notes |
|---|---|---|
| award_vote_id | uuid FK | |
| player_id | uuid FK | |

### `award_vote_entries`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| award_vote_id | uuid FK | |
| voter_fingerprint | text | browser fingerprint, one vote per device |
| player_id | uuid FK | voted for |
| created_at | timestamptz | |

### `session_awards`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| session_id | uuid FK | |
| award_type | enum | mvp / best_goalkeeper / best_assister / best_goalscorer / fair_play |
| winner_player_id | uuid FK | |
| decided_by | enum | auto_stat / admin_direct / vote |
| is_tied | bool | flag if tie was broken manually |

---

## 4. Stats (Computed, Not Stored)

All stats are derived via SQL queries from `match_events` and related tables. No separate stats table to keep in sync.

| Stat | Source |
|---|---|
| Goals | `match_events` where `event_type = 'goal'` or `'penalty_goal'` |
| Assists | `match_events` where `event_type = 'assist'` |
| G+A combined | goals + assists |
| Clean sheets | GK with 0 goals against their team in a completed match |
| Yellow cards | `match_events` where `event_type = 'yellow_card'` |
| Red cards | `match_events` where `event_type = 'red_card'` |
| MVP count | `session_awards` where `award_type = 'mvp'` |
| Fair play count | `session_awards` where `award_type = 'fair_play'` |
| Win rate | matches won / matches played (via `team_players` + `matches.winner_team_id`) |

**Tie-breaking:** when two players share the top stat value for an auto-calculated award, the app flags `is_tied = true` on `session_awards` and the admin manually selects the winner.

---

## 5. Team Balancing Algorithm

Goal: split 15 attending players into 3 balanced teams of 5, equal in skill and position mix.

1. **GK assignment:** collect all players with position = GK from attending 15. Assign one GK to each team. If fewer than 3 GKs, admin is prompted to designate a field player as GK for a team.
2. **Remaining players:** sort by `skill_rating` descending.
3. **Snake draft:** distribute remaining 12 players across 3 teams in snake order:
   - Round 1: Team A, B, C
   - Round 2: Team C, B, A
   - Round 3: Team A, B, C … (repeating)
4. This naturally balances skill totals across teams.
5. Admin can **manually swap** any two players between teams at any time (before or during a match) via drag-and-drop in the Team Builder or a tap-to-swap flow in the Match Tracker.

---

## 6. Match Rotation Rules

- Each session has 3 teams. A coin flip (random) selects the first 2 teams to play; the 3rd waits.
- **Loser sits out, winner stays, waiting team comes on.**
- **Draw resolution:**
  - **Match 1 (first match of session):** penalties shootout → admin logs penalty results → winner decided.
  - **All subsequent matches:** the team that has been waiting longer wins directly (no penalties).
- After each match, the next match is auto-configured by the app.

---

## 7. Screens

### Admin Zone (`/admin`)

| Screen | Purpose |
|---|---|
| **Dashboard** | Overview: upcoming/active session, recent results, quick-action buttons |
| **Players Registry** | Add / edit / deactivate players (name, photo, position, skill rating) |
| **New Session** | Pick date; tap players from registry to mark attendance (max 15) |
| **Team Builder** | View 3 generated teams by color; "Shuffle All" button; drag-and-drop player swap between teams |
| **Match Tracker** | Live match screen: large pauseable timer, current score, logging buttons (Goal / Card / Swap), suspended player countdowns |
| **Awards** | Post-session: auto-calculated awards shown; admin assigns MVP + Fair Play (direct or opens vote) |
| **Session History** | Past sessions with scores, teams, and awards |

### Match Tracker — Detail

- **Timer:** counts up, displayed large. Pause / Resume button. Auto-pauses when a logging dialog opens.
- **Goal dialog:** pick scorer → optionally pick assister → confirm.
- **Card dialog:** pick player → Yellow or Red → if Red: pick suspension duration (2 or 3 min) → suspension countdown starts.
- **Suspended panel:** list of suspended players with live countdown timers. Tap to "Return early."
- **Swap dialog:** pick player from one team → pick player from other team → swap confirmed.
- **End Match:** resolves draw per rules → queues next match.

### Public Zone (`/s/:token`)

| Screen | Purpose |
|---|---|
| **Leaderboard** | All-time stats: goals, assists, clean sheets, G+A, MVPs, fair play wins — filterable by season |
| **Live Session** | Current match score, team lineups, timer — updates in real time via Supabase Realtime |
| **Vote Page** (`/s/:vote_token`) | Nominee list, one-tap vote (device fingerprint), live results after voting |

---

## 8. Awards

| Award | Determined By |
|---|---|
| **MVP** | Admin picks directly **or** opens a vote (admin curates nominee list) |
| **Well-Mannered Player (Fair Play)** | Admin picks directly **or** opens a vote |
| **Best Goalkeeper** | Auto-calculated: GK with most clean sheets that session |
| **Best Assister** | Auto-calculated: player with most assists that session |
| **Best Goalscorer** | Auto-calculated: player with most goals that session |

**Vote flow:** admin opens vote → app generates shareable URL → admin pastes in Messenger → players vote once per device → admin closes vote → winner saved to `session_awards`.

**Note:** a player with a red card that session is automatically excluded from the Fair Play nominee list.

---

## 9. Security

- Admin auth: Supabase Auth (email + password).
- Public routes: Supabase Row Level Security enforces read-only at the database level.
- Vote tokens: short-lived UUID links; one vote per device via browser fingerprint.
- No player accounts required — players never log in.

---

## 10. Deployment

- **Frontend:** Vercel — auto-deploys on push to `main`.
- **Backend:** Supabase Cloud (free tier).
- **Environment variables:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` stored in Vercel project settings.
- **PWA:** manifest + service worker configured via `vite-plugin-pwa`.
