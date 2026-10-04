# Score-Leader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a React PWA for managing weekly 5v5 football sessions — team balancing, live match tracking, awards, and public stats leaderboard.

**Architecture:** React 18 + Vite PWA frontend; Supabase (PostgreSQL + Auth + Realtime) backend. Admin zone at `/admin/*` requires Supabase Auth; public zone at `/s/:token` is read-only via RLS. Deployed to Vercel + Supabase Cloud.

**Tech Stack:** React 18, Vite 5, TypeScript (strict), TailwindCSS v3, Supabase JS v2, react-router-dom v6, @dnd-kit/core, date-fns, vite-plugin-pwa, Vitest, @testing-library/react

**Spec:** `docs/superpowers/specs/2026-10-04-score-leader-design.md`

## Global Constraints
- TypeScript strict mode — no `any`
- TailwindCSS v3 only — no inline styles or other CSS frameworks
- `@supabase/supabase-js ^2`
- react-router-dom v6
- Position values (exact): `GK | DEF | MID | ATT`
- Team color values (exact): `red | blue | yellow`
- Session status values: `draft | active | completed`
- Match status values: `pending | active | completed`
- Event type values: `goal | assist | yellow_card | red_card | penalty_goal`
- Award type values: `mvp | best_goalkeeper | best_assister | best_goalscorer | fair_play`
- Skill rating: integer 1–5 inclusive
- Red card suspension: 2 or 3 minutes only
- Max attendance per session: 15 players

## Review Focus
1. **Snake draft with fewer than 15 players** — algorithm must handle any attendance count (min 3 per team); verify no off-by-one errors with 9 or 12 players
2. **Timer resume after page reload** — `timer_elapsed_seconds` in DB is source of truth; client must compute elapsed from stored value + `timer_started_at`, not from local state
3. **Vote dedup on same device** — `getFingerprint()` must be stable across repeated calls in same browser session; second vote attempt must be silently rejected
4. **Draw on match_number > 1** — waiting team winner must be derived from `match.waiting_team_id`, not hardcoded; verify next match rotation is also correct
5. **Fair play nominee exclusion** — any player with a `red_card` event anywhere in the current session (not just the last match) must be absent from fair play nominations

---

## File Structure

```
src/
  lib/
    supabase.ts          # client singleton
    types.ts             # all TS types from schema
  utils/
    teamBalancer.ts      # snake-draft algorithm
    matchRotation.ts     # resolveMatch, setupFirstMatch
    stats.ts             # computePlayerStats
    fingerprint.ts       # browser fingerprint for vote dedup
  hooks/
    useAuth.ts
    useMatchTimer.ts
    useRealtime.ts
  components/
    AuthGuard.tsx
    GoalDialog.tsx
    CardDialog.tsx
    SuspensionCountdown.tsx
    SwapDialog.tsx
  pages/
    LoginPage.tsx
    admin/
      AdminLayout.tsx
      Dashboard.tsx
      PlayersPage.tsx
      NewSessionPage.tsx
      TeamBuilderPage.tsx
      MatchTrackerPage.tsx
      AwardsPage.tsx
      HistoryPage.tsx
    public/
      PublicLayout.tsx
      LeaderboardPage.tsx
      LiveSessionPage.tsx
      VotePage.tsx
  router.tsx
  main.tsx
  App.tsx
  test/setup.ts
supabase/
  migrations/
    001_schema.sql
    002_rls.sql
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.ts`
- Create: `src/main.tsx`, `src/App.tsx`, `src/router.tsx`, `src/test/setup.ts`

**Interfaces:**
- Produces: running dev server at `localhost:5173`; `npx vitest run` works

- [ ] **Step 1:** Scaffold project
```bash
npm create vite@latest . -- --template react-ts
```

- [ ] **Step 2:** Install runtime dependencies
```bash
npm install @supabase/supabase-js react-router-dom @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities date-fns
```

- [ ] **Step 3:** Install dev dependencies
```bash
npm install -D tailwindcss postcss autoprefixer vite-plugin-pwa vitest @testing-library/react @testing-library/jest-dom @vitejs/plugin-react jsdom
npx tailwindcss init -p
```

- [ ] **Step 4:** Configure `vite.config.ts` — add `react()` plugin; set `test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], globals: true }`

- [ ] **Step 5:** Create `src/test/setup.ts`
```ts
import '@testing-library/jest-dom'
```

- [ ] **Step 6:** Configure `tailwind.config.ts` — content: `['./src/**/*.{ts,tsx}']`

- [ ] **Step 7:** Write `src/router.tsx` — export `router` via `createBrowserRouter`. Routes: `/login`, `/admin` (AdminLayout + AuthGuard outlet), `/admin/players`, `/admin/sessions/new`, `/admin/sessions/:sessionId/teams`, `/admin/sessions/:sessionId/match/:matchId`, `/admin/sessions/:sessionId/awards`, `/admin/history`, `/s/:token`, `/s/vote/:voteToken`

- [ ] **Step 8:** Write smoke test
```ts
// src/router.test.ts
import { router } from './router'
it('defines login and admin routes', () => {
  const paths = router.routes.flatMap(r => [r.path, ...(r.children ?? []).map(c => c.path)])
  expect(paths).toContain('/login')
  expect(paths).toContain('/admin')
})
```

- [ ] **Step 9:** Run `npx vitest run src/router.test.ts` — expect PASS

- [ ] **Step 10:** Commit
```bash
git add -A
git commit -m "feat: scaffold React PWA with Vite, Tailwind, routing, and Vitest"
```

---

## Task 2: Database Schema & TypeScript Types

**Files:**
- Create: `supabase/migrations/001_schema.sql`
- Create: `supabase/migrations/002_rls.sql`
- Create: `src/lib/types.ts`

**Interfaces:**
- Produces: named type exports from `src/lib/types.ts` consumed by all other tasks

- [ ] **Step 1:** Write `supabase/migrations/001_schema.sql` — create all enums and tables:

Enums:
```sql
CREATE TYPE player_position AS ENUM ('GK','DEF','MID','ATT');
CREATE TYPE team_color AS ENUM ('red','blue','yellow');
CREATE TYPE session_status AS ENUM ('draft','active','completed');
CREATE TYPE match_status AS ENUM ('pending','active','completed');
CREATE TYPE timer_status AS ENUM ('running','paused','stopped');
CREATE TYPE event_type AS ENUM ('goal','assist','yellow_card','red_card','penalty_goal');
CREATE TYPE award_type AS ENUM ('mvp','best_goalkeeper','best_assister','best_goalscorer','fair_play');
CREATE TYPE award_decided_by AS ENUM ('auto_stat','admin_direct','vote');
```

Tables match spec section 3 exactly. All `id` columns are `uuid DEFAULT gen_random_uuid() PRIMARY KEY`.

- [ ] **Step 2:** Write `supabase/migrations/002_rls.sql` — enable RLS on every table; `anon` role gets `SELECT` only; `authenticated` role gets all operations:
```sql
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON players FOR SELECT TO anon USING (true);
CREATE POLICY "admin write" ON players FOR ALL TO authenticated USING (true);
-- repeat pattern for all 11 tables
```

- [ ] **Step 3:** Write `src/lib/types.ts` — hand-authored types matching schema exactly:
```ts
export type PlayerPosition = 'GK' | 'DEF' | 'MID' | 'ATT'
export type TeamColor = 'red' | 'blue' | 'yellow'
export type SessionStatus = 'draft' | 'active' | 'completed'
export type MatchStatus = 'pending' | 'active' | 'completed'
export type TimerStatus = 'running' | 'paused' | 'stopped'
export type EventType = 'goal' | 'assist' | 'yellow_card' | 'red_card' | 'penalty_goal'
export type AwardType = 'mvp' | 'best_goalkeeper' | 'best_assister' | 'best_goalscorer' | 'fair_play'
export type AwardDecidedBy = 'auto_stat' | 'admin_direct' | 'vote'

export interface Player {
  id: string; name: string; position: PlayerPosition; skill_rating: number
  photo_url: string | null; is_active: boolean; created_at: string
}
export interface Session {
  id: string; date: string; status: SessionStatus; share_token: string; created_at: string
}
export interface Team { id: string; session_id: string; color: TeamColor; name: string | null }
export interface Match {
  id: string; session_id: string; match_number: number
  team1_id: string; team2_id: string; waiting_team_id: string
  status: MatchStatus; team1_score: number; team2_score: number
  winner_team_id: string | null; is_draw: boolean
  draw_resolved_by: 'penalties' | 'late_team' | null
  timer_started_at: string | null; timer_elapsed_seconds: number; timer_status: TimerStatus
  created_at: string
}
export interface MatchEvent {
  id: string; match_id: string; player_id: string; team_id: string
  event_type: EventType; related_event_id: string | null; minute: number | null
  suspension_minutes: number | null; suspension_started_at: string | null
  suspension_ended_at: string | null; created_at: string
}
export interface AwardVote {
  id: string; session_id: string; award_type: 'mvp' | 'fair_play'
  status: 'open' | 'closed'; winner_player_id: string | null
  decided_by: 'admin_direct' | 'vote'; vote_token: string; created_at: string
}
export interface SessionAward {
  id: string; session_id: string; award_type: AwardType
  winner_player_id: string; decided_by: AwardDecidedBy; is_tied: boolean
}
```

- [ ] **Step 4:** Write type test
```ts
// src/lib/types.test.ts
import type { Player, Match, MatchEvent } from './types'
it('PlayerPosition literal compiles', () => {
  const p: Player['position'] = 'GK'
  expect(p).toBe('GK')
})
it('EventType includes all five values', () => {
  const types: MatchEvent['event_type'][] = ['goal','assist','yellow_card','red_card','penalty_goal']
  expect(types).toHaveLength(5)
})
```

- [ ] **Step 5:** Run `npx vitest run src/lib/types.test.ts` — expect PASS

- [ ] **Step 6:** Commit
```bash
git add supabase/ src/lib/types.ts src/lib/types.test.ts
git commit -m "feat: add database migrations and TypeScript types"
```

---

## Task 3: Supabase Client & Auth

**Files:**
- Create: `src/lib/supabase.ts`
- Create: `src/hooks/useAuth.ts`
- Create: `src/pages/LoginPage.tsx`
- Create: `src/components/AuthGuard.tsx`
- Create: `.env.local`, `.env.example`

**Interfaces:**
- Produces: `supabase` (default export from `src/lib/supabase.ts`)
- Produces: `useAuth(): { user: User | null; loading: boolean; signIn(email: string, password: string): Promise<void>; signOut(): Promise<void> }`
- Produces: `<AuthGuard />` — redirects unauthenticated users to `/login`, renders `<Outlet />` when authenticated

- [ ] **Step 1:** Create `src/lib/supabase.ts`
```ts
import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string
)
```

- [ ] **Step 2:** Create `.env.local` with actual Supabase project URL and anon key (from Supabase dashboard → Settings → API). Create `.env.example` with empty placeholder values.

- [ ] **Step 3:** Add `.env.local` to `.gitignore`

- [ ] **Step 4:** Write `src/hooks/useAuth.ts` — `useEffect` calls `supabase.auth.getSession()` on mount to set initial user; subscribes to `supabase.auth.onAuthStateChange` for updates; `signIn` calls `supabase.auth.signInWithPassword({ email, password })` and throws on error; `signOut` calls `supabase.auth.signOut()`

- [ ] **Step 5:** Write test
```ts
// src/hooks/useAuth.test.ts
import { renderHook, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}))
import { useAuth } from './useAuth'

it('loading starts true', () => {
  const { result } = renderHook(() => useAuth())
  expect(result.current.loading).toBe(true)
})
it('user is null when no session', async () => {
  const { result } = renderHook(() => useAuth())
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.user).toBeNull()
})
```

- [ ] **Step 6:** Run `npx vitest run src/hooks/useAuth.test.ts` — expect PASS

- [ ] **Step 7:** Write `src/pages/LoginPage.tsx` — email + password form, calls `signIn`, shows error string on failure, navigates to `/admin` on success

- [ ] **Step 8:** Write `src/components/AuthGuard.tsx` — if `loading` render spinner div; if `!user` render `<Navigate to="/login" replace />`; else render `<Outlet />`

- [ ] **Step 9:** Update `src/router.tsx` — wrap all `/admin/*` child routes inside `<AuthGuard>` as the element for the `/admin` route

- [ ] **Step 10:** Commit
```bash
git add src/lib/supabase.ts src/hooks/useAuth.ts src/pages/LoginPage.tsx src/components/AuthGuard.tsx src/router.tsx .env.example .gitignore
git commit -m "feat: add Supabase client, auth hook, login page, and admin route guard"
```

---

## Task 4: Players Registry

**Files:**
- Create: `src/pages/admin/AdminLayout.tsx`
- Create: `src/pages/admin/PlayersPage.tsx`

**Interfaces:**
- Consumes: `supabase`, `Player`, `PlayerPosition`
- Produces: admin nav shell with `<Outlet />`; players CRUD page

- [ ] **Step 1:** Write `src/pages/admin/AdminLayout.tsx` — nav bar with links: Dashboard (`/admin`), Players (`/admin/players`), History (`/admin/history`); renders `<Outlet />`

- [ ] **Step 2:** Write failing test
```tsx
// src/pages/admin/PlayersPage.test.tsx
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn() } }))

it('renders position badge for each position', () => {
  const positions: Player['position'][] = ['GK','DEF','MID','ATT']
  positions.forEach(pos => {
    const { unmount } = render(<PositionBadge position={pos} />)
    expect(screen.getByText(pos)).toBeInTheDocument()
    unmount()
  })
})
```

- [ ] **Step 3:** Run — expect FAIL

- [ ] **Step 4:** Implement `src/pages/admin/PlayersPage.tsx`:
  - `PositionBadge` component — colored chip for each position value
  - Fetches active players: `supabase.from('players').select('*').eq('is_active', true).order('name')`
  - Renders grid of player cards: name, `PositionBadge`, skill rating (filled circles 1–5), edit + deactivate buttons
  - "Add Player" opens dialog: fields name (required), position (select), skill_rating (1–5 range input), photo_url (optional)
  - Add → `supabase.from('players').insert(...)`, edit → `supabase.from('players').update(...).eq('id', id)`
  - Deactivate → `supabase.from('players').update({ is_active: false }).eq('id', id)`

- [ ] **Step 5:** Run — expect PASS

- [ ] **Step 6:** Commit
```bash
git add src/pages/admin/AdminLayout.tsx src/pages/admin/PlayersPage.tsx
git commit -m "feat: add admin layout and players registry with CRUD"
```

---

## Task 5: Session Creation & Attendance

**Files:**
- Create: `src/pages/admin/Dashboard.tsx`
- Create: `src/pages/admin/NewSessionPage.tsx`

**Interfaces:**
- Consumes: `supabase`, `Player`, `Session`
- Produces: dashboard linking to active session or new session; `NewSessionPage` that creates session + attendance and redirects to team builder

- [ ] **Step 1:** Write failing test
```tsx
// src/pages/admin/NewSessionPage.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'

it('disables unselected players once 15 are selected', () => {
  const players = Array.from({ length: 20 }, (_, i) =>
    ({ id: `p${i}`, name: `Player ${i}`, position: 'MID', skill_rating: 3, photo_url: null, is_active: true, created_at: '' }))
  const selected = new Set(players.slice(0, 15).map(p => p.id))
  render(<AttendancePicker players={players} selected={selected} onToggle={vi.fn()} />)
  expect(screen.getByTestId('player-p15')).toBeDisabled()
  expect(screen.getByTestId('player-p0')).not.toBeDisabled()
})
```

- [ ] **Step 2:** Run — expect FAIL

- [ ] **Step 3:** Implement `AttendancePicker` inside `src/pages/admin/NewSessionPage.tsx`:
  - Props: `players: Player[]`, `selected: Set<string>`, `onToggle(id: string): void`
  - Each player button has `data-testid="player-{id}"`
  - Button is disabled when `selected.size >= 15 && !selected.has(player.id)`
  - Shows count badge `{selected.size} / 15`

- [ ] **Step 4:** Run — expect PASS

- [ ] **Step 5:** Implement full `NewSessionPage`:
  - Step 1 UI: date input → "Start Session" creates `sessions` row (`status='draft'`, `share_token = crypto.randomUUID()`)
  - Step 2 UI: `AttendancePicker` with all active players → "Confirm" inserts `session_players` rows, navigates to `/admin/sessions/:id/teams`

- [ ] **Step 6:** Write `src/pages/admin/Dashboard.tsx` — fetches sessions, shows active session "Continue" button if exists, "New Session" button, last 3 completed sessions list

- [ ] **Step 7:** Commit
```bash
git add src/pages/admin/Dashboard.tsx src/pages/admin/NewSessionPage.tsx
git commit -m "feat: add dashboard and session creation with attendance picker (max 15)"
```

---

## Task 6: Team Balancing Algorithm & Team Builder

**Files:**
- Create: `src/utils/teamBalancer.ts`
- Create: `src/utils/teamBalancer.test.ts`
- Create: `src/pages/admin/TeamBuilderPage.tsx`

**Interfaces:**
- Produces: `balanceTeams(players: Player[]): BalanceResult`
- `BalanceResult = { teams: [Player[], Player[], Player[]]; needsGkAssignment: boolean }`

- [ ] **Step 1:** Write failing tests
```ts
// src/utils/teamBalancer.test.ts
import { balanceTeams } from './teamBalancer'
import type { Player } from '../lib/types'

const p = (id: string, pos: Player['position'], skill: number): Player =>
  ({ id, name: id, position: pos, skill_rating: skill, photo_url: null, is_active: true, created_at: '' })

it('assigns exactly one GK to each team when 3 GKs present', () => {
  const players = [p('gk1','GK',3), p('gk2','GK',3), p('gk3','GK',3),
    ...Array.from({length:12}, (_,i) => p(`f${i}`,'DEF', (i%5)+1))]
  const { teams } = balanceTeams(players)
  teams.forEach(t => expect(t.filter(pl => pl.position === 'GK')).toHaveLength(1))
})

it('sets needsGkAssignment when fewer than 3 GKs', () => {
  const players = [p('gk1','GK',3), ...Array.from({length:14}, (_,i) => p(`f${i}`,'MID',3))]
  expect(balanceTeams(players).needsGkAssignment).toBe(true)
})

it('produces 3 equal-size teams for 15 players', () => {
  const players = Array.from({length:15}, (_,i) => p(`p${i}`, i<3?'GK':'MID', (i%5)+1))
  const { teams } = balanceTeams(players)
  teams.forEach(t => expect(t).toHaveLength(5))
})

it('snake draft balances total skill within 2 points', () => {
  const players = Array.from({length:15}, (_,i) => p(`p${i}`, i<3?'GK':'ATT', (i%5)+1))
  const { teams } = balanceTeams(players)
  const sums = teams.map(t => t.reduce((a, pl) => a + pl.skill_rating, 0))
  expect(Math.max(...sums) - Math.min(...sums)).toBeLessThanOrEqual(2)
})

it('handles 9 players (3 per team)', () => {
  const players = Array.from({length:9}, (_,i) => p(`p${i}`, i<3?'GK':'MID', 3))
  const { teams } = balanceTeams(players)
  teams.forEach(t => expect(t).toHaveLength(3))
})
```

- [ ] **Step 2:** Run `npx vitest run src/utils/teamBalancer.test.ts` — expect 5 FAILs

- [ ] **Step 3:** Implement `balanceTeams` in `src/utils/teamBalancer.ts`:
  - Separate GKs (first 3 max) from field players
  - `needsGkAssignment = gks.length < 3`
  - Assign GKs to teams 0, 1, 2 (one each)
  - Sort remaining field players by `skill_rating` descending
  - Snake-draft: for player at index `i`, team index = `i % 6 < 3 ? i % 3 : 2 - (i % 3)`

- [ ] **Step 4:** Run — expect 5 PASSes

- [ ] **Step 5:** Write `src/pages/admin/TeamBuilderPage.tsx`:
  - Loads session + session_players, fetches player records
  - On mount: calls `balanceTeams`, stores result as `teams` state (3 arrays)
  - If `needsGkAssignment`: shows modal prompting admin to tap a player per team to designate as GK
  - Renders 3 columns colored red/blue/yellow, each listing their players
  - "Shuffle All" button: re-runs `balanceTeams` on same players
  - Drag-and-drop (dnd-kit): dragging player A onto player B swaps them between teams in local state
  - "Confirm Teams" button: inserts 3 `teams` rows + `team_players` rows into DB, sets session `status='active'`, creates first match via `setupFirstMatch`, navigates to `/admin/sessions/:id/match/:matchId`

- [ ] **Step 6:** Commit
```bash
git add src/utils/teamBalancer.ts src/utils/teamBalancer.test.ts src/pages/admin/TeamBuilderPage.tsx
git commit -m "feat: add snake-draft team balancer and team builder with drag-and-drop"
```

---

## Task 7: Match Rotation Logic & Timer Hook

**Files:**
- Create: `src/utils/matchRotation.ts`
- Create: `src/utils/matchRotation.test.ts`
- Create: `src/hooks/useMatchTimer.ts`

**Interfaces:**
- Produces: `setupFirstMatch(teams: Team[]): { team1Id: string; team2Id: string; waitingTeamId: string }` — random shuffle
- Produces: `resolveMatch(match: Match): { nextTeam1Id: string; nextTeam2Id: string; nextWaitingTeamId: string }` — winner stays, loser waits, waiting comes on
- Produces: `useMatchTimer(match: Match): { elapsed: number; timerStatus: TimerStatus; start(): Promise<void>; pause(): Promise<void> }`

- [ ] **Step 1:** Write failing tests
```ts
// src/utils/matchRotation.test.ts
import { resolveMatch } from './matchRotation'
import type { Match } from '../lib/types'

const base = (o: Partial<Match> = {}): Match => ({
  id:'m1', session_id:'s1', match_number:1,
  team1_id:'red', team2_id:'blue', waiting_team_id:'yellow',
  status:'completed', team1_score:0, team2_score:0,
  winner_team_id:null, is_draw:false, draw_resolved_by:null,
  timer_started_at:null, timer_elapsed_seconds:0, timer_status:'stopped', created_at:'',
  ...o
})

it('winner stays, loser sits, waiter comes on', () => {
  const next = resolveMatch(base({ team1_score:2, team2_score:1, winner_team_id:'red' }))
  expect(next.nextTeam1Id).toBe('red')
  expect(next.nextTeam2Id).toBe('yellow')
  expect(next.nextWaitingTeamId).toBe('blue')
})

it('draw on match 1 with penalty winner: winner stays, loser waits', () => {
  const next = resolveMatch(base({ is_draw:true, draw_resolved_by:'penalties', winner_team_id:'blue', match_number:1 }))
  expect(next.nextTeam1Id).toBe('blue')
  expect(next.nextTeam2Id).toBe('yellow')
  expect(next.nextWaitingTeamId).toBe('red')
})

it('draw on match > 1: waiting team won, one playing team waits', () => {
  const next = resolveMatch(base({ is_draw:true, draw_resolved_by:'late_team', winner_team_id:'yellow', match_number:2 }))
  expect(next.nextTeam1Id).toBe('yellow')
  expect(['red','blue']).toContain(next.nextWaitingTeamId)
})
```

- [ ] **Step 2:** Run — expect 3 FAILs

- [ ] **Step 3:** Implement `resolveMatch` in `src/utils/matchRotation.ts`:
  - Winner stays as `nextTeam1Id`
  - Waiting team becomes `nextTeam2Id`
  - Loser (the playing team that is not `winner_team_id`) becomes `nextWaitingTeamId`

- [ ] **Step 4:** Implement `setupFirstMatch(teams: Team[])` — Fisher-Yates shuffle of team ids, pick first two, third waits

- [ ] **Step 5:** Run — expect 3 PASSes

- [ ] **Step 6:** Write timer test
```ts
// src/hooks/useMatchTimer.test.ts
it('elapsed equals timer_elapsed_seconds when paused', () => {
  const match = { ...base(), timer_elapsed_seconds:120, timer_status:'paused' as const, timer_started_at:null }
  const { result } = renderHook(() => useMatchTimer(match))
  expect(result.current.elapsed).toBe(120)
})
```

- [ ] **Step 7:** Run — expect FAIL

- [ ] **Step 8:** Implement `useMatchTimer` in `src/hooks/useMatchTimer.ts`:
  - Computes `elapsed` as `match.timer_elapsed_seconds + (match.timer_status === 'running' ? Math.floor((Date.now() - new Date(match.timer_started_at!).getTime()) / 1000) : 0)`
  - `start()`: calls `supabase.from('matches').update({ timer_started_at: new Date().toISOString(), timer_status:'running' }).eq('id', match.id)`
  - `pause()`: computes new elapsed, calls update with `timer_elapsed_seconds: newElapsed, timer_status:'paused', timer_started_at:null`
  - Re-renders every second via `setInterval` when `timer_status === 'running'`; clears interval on unmount

- [ ] **Step 9:** Run — expect PASS

- [ ] **Step 10:** Commit
```bash
git add src/utils/matchRotation.ts src/utils/matchRotation.test.ts src/hooks/useMatchTimer.ts
git commit -m "feat: add match rotation logic and pauseable match timer hook"
```

---

## Task 8: Match Tracker Page & Event Dialogs

**Files:**
- Create: `src/pages/admin/MatchTrackerPage.tsx`
- Create: `src/components/GoalDialog.tsx`
- Create: `src/components/CardDialog.tsx`
- Create: `src/components/SuspensionCountdown.tsx`
- Create: `src/components/SwapDialog.tsx`

**Interfaces:**
- Consumes: `useMatchTimer`, `resolveMatch`, `Match`, `MatchEvent`, `Player`, `Team`
- Produces: live match UI that writes to `match_events`; triggers next match on end

- [ ] **Step 1:** Write failing test for GoalDialog
```tsx
// src/components/GoalDialog.test.tsx
it('calls onConfirm with scorerId and null assisterId when no assist selected', async () => {
  const onConfirm = vi.fn()
  render(<GoalDialog players={mockPlayers} onConfirm={onConfirm} onClose={vi.fn()} />)
  fireEvent.click(screen.getByText('Player 1'))
  fireEvent.click(screen.getByText('No assist'))
  fireEvent.click(screen.getByText('Confirm'))
  expect(onConfirm).toHaveBeenCalledWith({ scorerId: 'p1', assisterId: null })
})
```

- [ ] **Step 2:** Run — expect FAIL

- [ ] **Step 3:** Implement `GoalDialog` — step 1: pick scorer from player list; step 2: pick assister or "No assist"; confirm calls `onConfirm({ scorerId, assisterId })`

- [ ] **Step 4:** Run — expect PASS

- [ ] **Step 5:** Write failing tests for CardDialog
```tsx
// src/components/CardDialog.test.tsx
it('shows 2 min and 3 min options only for red card', () => {
  render(<CardDialog players={mockPlayers} onConfirm={vi.fn()} onClose={vi.fn()} />)
  fireEvent.click(screen.getByText('Player 1'))
  fireEvent.click(screen.getByText('Red'))
  expect(screen.getByText('2 min')).toBeInTheDocument()
  expect(screen.getByText('3 min')).toBeInTheDocument()
})
it('does not show duration picker for yellow card', () => {
  render(<CardDialog players={mockPlayers} onConfirm={vi.fn()} onClose={vi.fn()} />)
  fireEvent.click(screen.getByText('Player 1'))
  fireEvent.click(screen.getByText('Yellow'))
  expect(screen.queryByText('2 min')).not.toBeInTheDocument()
})
```

- [ ] **Step 6:** Run — expect 2 FAILs

- [ ] **Step 7:** Implement `CardDialog` — pick player; pick Yellow or Red; if Red: pick 2 or 3 min; `onConfirm({ playerId, cardType: 'yellow_card' | 'red_card', suspensionMinutes: 2 | 3 | null })`

- [ ] **Step 8:** Run — expect 2 PASSes

- [ ] **Step 9:** Implement `SuspensionCountdown` — props: `event: MatchEvent`, `onReturnEarly(): void`; counts down `(suspension_minutes! * 60) - secondsSince(suspension_started_at!)`; when ≤ 0 shows "Time up — return player"; "Return early" button calls `onReturnEarly` which updates `suspension_ended_at = now()` on the event row

- [ ] **Step 10:** Implement `SwapDialog` — props: `teams: { team: Team; players: Player[] }[]`, `onSwap(p1Id: string, p2Id: string): void`; pick player A from any team, pick player B from a different team, confirm swaps their `team_id` in `team_players`

- [ ] **Step 11:** Implement `MatchTrackerPage`:
  - Loads match by `:matchId`, subscribes to match changes via Supabase Realtime
  - Shows: large timer (MM:SS from `useMatchTimer`), Pause/Resume button, Team A score vs Team B score, waiting team label
  - Goal button → opens `GoalDialog` (auto-pauses timer while open) → on confirm inserts `match_events` rows for goal + optional assist, increments `team1_score` or `team2_score`
  - Card button → opens `CardDialog` → inserts `match_events` row
  - Swap button → opens `SwapDialog`
  - Suspended panel: shows `SuspensionCountdown` for each `red_card` event where `suspension_ended_at` is null
  - "End Match" button: detects draw, resolves per rules (penalties UI for match 1; auto-resolve for match > 1), updates match row, calls `resolveMatch`, inserts next `matches` row, navigates to new match
  - After all 3 teams have played (determined when session has had enough matches): "Go to Awards" button appears

- [ ] **Step 12:** Commit
```bash
git add src/pages/admin/MatchTrackerPage.tsx src/components/
git commit -m "feat: add match tracker with goal/card/swap dialogs and suspension countdowns"
```

---

## Task 9: Awards Screen

**Files:**
- Create: `src/pages/admin/AwardsPage.tsx`

**Interfaces:**
- Consumes: `SessionAward`, `AwardVote`, `MatchEvent`, `Player`, `supabase`
- Produces: awards page that auto-calculates stat awards, allows direct or vote-based MVP/Fair Play assignment

- [ ] **Step 1:** Write failing test for fair play exclusion
```ts
// src/pages/admin/AwardsPage.test.ts
import { getFairPlayNominees } from './AwardsPage'

it('excludes players with red cards from fair play nominees', () => {
  const players: Player[] = [
    { id:'p1', name:'A', position:'MID', skill_rating:3, photo_url:null, is_active:true, created_at:'' },
    { id:'p2', name:'B', position:'MID', skill_rating:3, photo_url:null, is_active:true, created_at:'' },
    { id:'p3', name:'C', position:'MID', skill_rating:3, photo_url:null, is_active:true, created_at:'' },
  ]
  const events: MatchEvent[] = [
    { id:'e1', match_id:'m1', player_id:'p3', team_id:'t1', event_type:'red_card',
      related_event_id:null, minute:null, suspension_minutes:2,
      suspension_started_at:null, suspension_ended_at:null, created_at:'' }
  ]
  const nominees = getFairPlayNominees(players, events)
  expect(nominees.map(p => p.id)).not.toContain('p3')
  expect(nominees).toHaveLength(2)
})
```

- [ ] **Step 2:** Run — expect FAIL

- [ ] **Step 3:** Export `getFairPlayNominees(players: Player[], events: MatchEvent[]): Player[]` from `AwardsPage.tsx` — filters out any player whose `id` appears in events where `event_type === 'red_card'`

- [ ] **Step 4:** Run — expect PASS

- [ ] **Step 5:** Implement full `AwardsPage`:
  - Fetches all `match_events` and `session_players` for the session
  - **Auto-calculates and displays:**
    - Best Goalscorer: player with most `goal` + `penalty_goal` events
    - Best Assister: player with most `assist` events
    - Best Goalkeeper: GK player whose team conceded 0 goals in the most completed matches (clean sheets)
    - Ties: flag shown, admin taps to break tie by picking winner
  - **MVP and Fair Play each have two buttons:**
    - "Pick directly" → player picker modal → inserts `session_awards` row with `decided_by='admin_direct'`
    - "Open vote" → creates `award_votes` row with `vote_token = crypto.randomUUID()`, displays shareable URL `/s/vote/:voteToken` for admin to copy into Messenger
  - "Complete Session" button: saves all `session_awards` rows, sets session `status='completed'`

- [ ] **Step 6:** Commit
```bash
git add src/pages/admin/AwardsPage.tsx
git commit -m "feat: add awards screen with auto-stats, direct pick, and vote flow"
```

---

## Task 10: Stats Engine

**Files:**
- Create: `src/utils/stats.ts`
- Create: `src/utils/stats.test.ts`

**Interfaces:**
- Produces: `computePlayerStats(events: MatchEvent[], matches: Match[], teamPlayers: { team_id: string; player_id: string }[], players: Player[], awards: SessionAward[]): PlayerStats[]`
- `PlayerStats = { player: Player; goals: number; assists: number; ga: number; cleanSheets: number; yellowCards: number; redCards: number; wins: number; matchesPlayed: number; winRate: number; mvpCount: number; fairPlayCount: number }`

- [ ] **Step 1:** Write failing tests
```ts
// src/utils/stats.test.ts
import { computePlayerStats } from './stats'

const mkEvent = (id: string, matchId: string, playerId: string, type: EventType): MatchEvent =>
  ({ id, match_id: matchId, player_id: playerId, team_id:'t1', event_type: type,
     related_event_id:null, minute:null, suspension_minutes:null,
     suspension_started_at:null, suspension_ended_at:null, created_at:'' })

const mkPlayer = (id: string, pos: PlayerPosition = 'MID'): Player =>
  ({ id, name: id, position: pos, skill_rating: 3, photo_url:null, is_active:true, created_at:'' })

it('counts goals and assists correctly', () => {
  const events = [mkEvent('e1','m1','p1','goal'), mkEvent('e2','m1','p1','goal'), mkEvent('e3','m1','p2','assist')]
  const stats = computePlayerStats(events, [], [], [mkPlayer('p1'), mkPlayer('p2')], [])
  expect(stats.find(s => s.player.id==='p1')!.goals).toBe(2)
  expect(stats.find(s => s.player.id==='p2')!.assists).toBe(1)
  expect(stats.find(s => s.player.id==='p1')!.ga).toBe(2)
  expect(stats.find(s => s.player.id==='p2')!.ga).toBe(1)
})

it('computes win rate as wins divided by matches played', () => {
  // p1 is on team 't1'; t1 won 2 of 3 completed matches
  const matches: Match[] = [
    { ...baseMatch, id:'m1', winner_team_id:'t1', status:'completed' },
    { ...baseMatch, id:'m2', winner_team_id:'t1', status:'completed' },
    { ...baseMatch, id:'m3', winner_team_id:'t2', status:'completed' },
  ]
  const teamPlayers = [{ team_id:'t1', player_id:'p1' }]
  const stats = computePlayerStats([], matches, teamPlayers, [mkPlayer('p1')], [])
  expect(stats.find(s => s.player.id==='p1')!.wins).toBe(2)
  expect(stats.find(s => s.player.id==='p1')!.matchesPlayed).toBe(3)
  expect(stats.find(s => s.player.id==='p1')!.winRate).toBeCloseTo(2/3)
})
```

- [ ] **Step 2:** Run — expect FAILs

- [ ] **Step 3:** Implement `computePlayerStats` in `src/utils/stats.ts`:
  - For each player: count goals (`goal` + `penalty_goal`), assists, yellow/red cards, wins/matchesPlayed from `matches` + `teamPlayers`, mvpCount + fairPlayCount from `awards`
  - Clean sheets: for each GK, count completed matches where their team appears in `teamPlayers` and no `goal`/`penalty_goal` events exist against that team in that match

- [ ] **Step 4:** Run — expect PASSes

- [ ] **Step 5:** Commit
```bash
git add src/utils/stats.ts src/utils/stats.test.ts
git commit -m "feat: add stats engine for goals, assists, clean sheets, win rate"
```

---

## Task 11: Public Routes — Leaderboard & Live Session

**Files:**
- Create: `src/hooks/useRealtime.ts`
- Create: `src/pages/public/PublicLayout.tsx`
- Create: `src/pages/public/LeaderboardPage.tsx`
- Create: `src/pages/public/LiveSessionPage.tsx`

**Interfaces:**
- Consumes: `computePlayerStats`; `supabase` Realtime; `Session`, `Match`, `Player` types
- Produces: `useRealtime<T>(table: string, filter: string, onInsert: (row: T) => void): void`

- [ ] **Step 1:** Write realtime hook test
```ts
// src/hooks/useRealtime.test.ts
it('subscribes to postgres_changes on the given table', () => {
  const mockSub = { unsubscribe: vi.fn() }
  const mockChannel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnValue(mockSub) }
  vi.mocked(supabase.channel).mockReturnValue(mockChannel as any)
  renderHook(() => useRealtime('matches', 'session_id=eq.s1', vi.fn()))
  expect(mockChannel.on).toHaveBeenCalledWith('postgres_changes', expect.objectContaining({ table: 'matches' }), expect.any(Function))
})
```

- [ ] **Step 2:** Run — expect FAIL

- [ ] **Step 3:** Implement `useRealtime` in `src/hooks/useRealtime.ts` — sets up channel, calls `callback` on `INSERT` events, unsubscribes on unmount

- [ ] **Step 4:** Run — expect PASS

- [ ] **Step 5:** Write `src/pages/public/PublicLayout.tsx` — minimal layout, "Score-Leader" heading, `<Outlet />`

- [ ] **Step 6:** Write `src/pages/public/LeaderboardPage.tsx`:
  - Resolves `share_token` from URL → fetches session → fetches all match_events, matches, team_players, players, session_awards for all completed sessions
  - Calls `computePlayerStats`, renders sortable table: Name, Goals, Assists, G+A, Clean Sheets, Wins, Win%, MVP, Fair Play
  - Default sort: G+A descending

- [ ] **Step 7:** Write `src/pages/public/LiveSessionPage.tsx`:
  - Resolves `share_token` → fetches active session, current active match, teams + players
  - Shows: Team A name + score vs Team B name + score, timer (read-only, increments every second client-side from `timer_elapsed_seconds` + `timer_started_at`), team lineups
  - Uses `useRealtime` on `matches` filtered by `session_id` to update scores live
  - If no active session: renders "No active session right now"

- [ ] **Step 8:** Commit
```bash
git add src/hooks/useRealtime.ts src/pages/public/
git commit -m "feat: add public leaderboard and live session pages with Supabase Realtime"
```

---

## Task 12: Vote Page, Fingerprint & Session History

**Files:**
- Create: `src/utils/fingerprint.ts`
- Create: `src/utils/fingerprint.test.ts`
- Create: `src/pages/public/VotePage.tsx`
- Create: `src/pages/admin/HistoryPage.tsx`

**Interfaces:**
- Produces: `getFingerprint(): string` — stable ~32-char string per browser
- Produces: vote page at `/s/vote/:voteToken`; history page at `/admin/history`

- [ ] **Step 1:** Write failing fingerprint test
```ts
// src/utils/fingerprint.test.ts
import { getFingerprint } from './fingerprint'
it('returns same string on repeated calls', () => {
  expect(getFingerprint()).toBe(getFingerprint())
})
it('returns a non-empty string of at least 16 chars', () => {
  expect(getFingerprint().length).toBeGreaterThanOrEqual(16)
})
```

- [ ] **Step 2:** Run — expect FAIL

- [ ] **Step 3:** Implement `getFingerprint` in `src/utils/fingerprint.ts` — concatenate `navigator.userAgent + screen.width + screen.height + Intl.DateTimeFormat().resolvedOptions().timeZone`, encode with `btoa`, return first 32 chars

- [ ] **Step 4:** Run — expect PASS

- [ ] **Step 5:** Write `src/pages/public/VotePage.tsx`:
  - Fetches `award_votes` by `vote_token` URL param, joined with `award_vote_nominations` → players
  - If `status === 'closed'`: show "Voting is closed"
  - Check `award_vote_entries` for existing entry with `voter_fingerprint = getFingerprint()` — if found, show "You have already voted" with live tally
  - Otherwise: show nominee cards, tap to vote → insert `award_vote_entries` row, then show live tally
  - Uses `useRealtime` on `award_vote_entries` filtered by `award_vote_id` for live vote count updates

- [ ] **Step 6:** Write `src/pages/admin/HistoryPage.tsx` — lists all completed sessions ordered by date desc; each row shows date, 3 team colors + player counts, match results summary, awards won

- [ ] **Step 7:** Commit
```bash
git add src/utils/fingerprint.ts src/utils/fingerprint.test.ts src/pages/public/VotePage.tsx src/pages/admin/HistoryPage.tsx
git commit -m "feat: add vote page with fingerprint dedup and session history"
```

---

## Task 13: PWA Configuration & Final Build

**Files:**
- Modify: `vite.config.ts`
- Create: `vercel.json`
- Create: `.env.example`
- Create: `public/icon-192.png`, `public/icon-512.png`

**Interfaces:**
- Produces: installable PWA; passing full test suite; successful `npm run build`

- [ ] **Step 1:** Update `vite.config.ts` — add `VitePWA` plugin:
```ts
VitePWA({
  registerType: 'autoUpdate',
  manifest: {
    name: 'Score-Leader',
    short_name: 'Score-Leader',
    description: 'Weekly 5v5 football session manager',
    theme_color: '#111827',
    background_color: '#111827',
    display: 'standalone',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
    ]
  },
  workbox: {
    runtimeCaching: [{
      urlPattern: /supabase\.co\/rest\/v1\/(players|sessions|session_awards)/,
      handler: 'StaleWhileRevalidate',
      options: { cacheName: 'supabase-read' }
    }]
  }
})
```

- [ ] **Step 2:** Create `vercel.json` for SPA routing
```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/" }] }
```

- [ ] **Step 3:** Add placeholder 192×192 and 512×512 PNG icons to `public/`

- [ ] **Step 4:** Run `npx vitest run` — expect all tests PASS

- [ ] **Step 5:** Run `npm run build` — expect success with no TypeScript errors

- [ ] **Step 6:** Commit
```bash
git add vite.config.ts vercel.json public/ .env.example
git commit -m "feat: configure PWA manifest, service worker cache, and Vercel deployment"
```

---

## Summary

| Task | Deliverable |
|---|---|
| 1 | Project scaffold, routing, test runner |
| 2 | DB schema migrations, TypeScript types |
| 3 | Supabase client, auth hook, login, route guard |
| 4 | Admin layout, players CRUD |
| 5 | Dashboard, session creation, attendance picker |
| 6 | Team balancer algorithm + team builder UI |
| 7 | Match rotation logic + pauseable timer hook |
| 8 | Match tracker with goal/card/swap/suspension dialogs |
| 9 | Awards screen: auto-stats, direct pick, vote flow |
| 10 | Stats engine (goals, assists, clean sheets, win rate) |
| 11 | Public leaderboard + live session with Realtime |
| 12 | Vote page with fingerprint dedup + session history |
| 13 | PWA config, full build, deployment ready |
