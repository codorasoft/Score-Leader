# Formations and Substitutes on the Coach Board — Design Spec

**Date:** 2026-10-13
**Status:** Awaiting review of this document

## 1. Goal

On the Coach Board the admin adds players and drags each one into place by hand. He wants
the board to do the placing: pick a formation and have the players line up in it, and keep
the substitutes beside the pitch, ready to swap in.

This covers the board editor, for a new board (`…/lineups/new`) and a saved one
(`…/lineups/:lineupId`).

Asked for by the user:

- **Suggested formations** to choose from, once the players are on the pitch.
- **A formation he builds himself**, such as 4-4-2 or 4-3-2-1.
- **The players are placed to match** the formation he chooses.
- **Any team size up to 11**, not only 5, 6 or 11 a side.
- **Suggestions always fit the number of players** on the pitch.
- **Substitutes beside the pitch.** A tap on one lists the players on the pitch, and choosing
  one swaps the two.

Assumed by the design, not yet confirmed (say so in review if any is wrong):

- **The goalkeeper is not written**, as in ordinary notation: 4-4-2 is eleven players, 2-3-1
  is seven, 2-2 is five.
- **A formation always uses exactly the players on the pitch.** The builder cannot be
  applied until it does. It never leaves an empty spot and never moves anyone to the bench by
  itself.
- **Players can still be dragged** after a formation is applied.
- **The formation and the substitutes are saved** with the board and shown in the shared
  image.

## 2. Formations

### 2.1 What a formation is

A formation is its lines from the defence forward, each with a number of players: `4-3-2-1`
is four lines. The goalkeeper is extra and always there.

- One to five lines, each of one to six players.
- It fits a pitch of *n* players when its numbers add up to *n* − 1.
- Formations exist for 2 to 11 players on the pitch. Players and guests both count.

### 2.2 Suggestions

For the number of players on the pitch, the dialog offers these and no others:

| On the pitch | Suggested |
|---|---|
| 2 | 1 |
| 3 | 1-1, 2 |
| 4 | 2-1, 1-2, 1-1-1 |
| 5 | 2-2, 1-2-1, 2-1-1, 1-1-2 |
| 6 | 2-2-1, 2-1-2, 3-2, 1-3-1 |
| 7 | 2-3-1, 3-2-1, 3-1-2, 2-2-2 |
| 8 | 3-3-1, 2-4-1, 3-2-2, 2-3-2 |
| 9 | 3-3-2, 3-4-1, 4-3-1, 3-2-3 |
| 10 | 3-4-2, 4-3-2, 4-4-1, 3-3-3 |
| 11 | 4-4-2, 4-3-3, 4-2-3-1, 3-5-2, 4-3-2-1, 5-3-2, 3-4-3, 4-1-4-1 |

### 2.3 Where the spots are

The team plays up the pitch, from the bottom goal towards the top one.

- **Goalkeeper:** x 0.5, y 0.92.
- **Lines:** spread evenly from y 0.74 (defence) to y 0.20 (attack). A formation of one line
  puts it at y 0.47.
- **Along a line** of *n* players: evenly across, between x 0.08 and x 0.92, so a single
  player is in the middle.

Each spot has a role, matched against the player's saved position (GK, DEF, MID, ATT):

- the goalkeeper's spot is GK;
- with one line, the line is MID;
- with two lines, the first is DEF and the second ATT;
- with three or more, the first is DEF, the last ATT and the ones between MID.

### 2.4 Who takes which spot

1. The goalkeeper's spot goes to a player whose position is GK. With several, the one
   nearest the bottom goal now.
2. Each line takes players of its own role, from the defence forward, until it is full.
3. The spots still empty take the players still unplaced, each spot taking the one whose
   position is closest to its role (GK, DEF, MID, ATT in that order). Guests have no position
   and are placed last.
4. Inside a line, the players are put in the order they already stand in from left to right,
   so nobody crosses the pitch for no reason.

The same players in the same places always give the same result.

### 2.5 Applying one

- Every player and guest on the pitch moves to their spot. Substitutes, arrows, zones and
  text are left alone.
- The board remembers the formation's name. It is shown on the Formation button and in the
  shared image.
- Dragging a player afterwards keeps the name: nudging a winger does not stop it being a
  4-4-2. So does a swap with a substitute.
- The name is forgotten when the number of players on the pitch changes (one added, removed,
  sent to the substitutes or brought on without a swap), because it no longer fits.
- Applying counts as an unsaved change, like any other move.

## 3. The Formation dialog

A **Formation** button sits under the drawing tools. It shows the current formation when
there is one ("Formation: 4-4-2").

- **2 to 11 on the pitch:** it opens the dialog.
- **Fewer than 2:** it is disabled, with the line "Add at least 2 players to choose a
  formation."
- **More than 11:** it is disabled, with the line "A formation takes up to 11 players. Move
  the others to the substitutes."

The dialog:

- **Heading** "Formation", and under it how many it is for: "7 players: the goalkeeper and 6
  more."
- **Suggested:** one card for each formation in the table, with its name and a small drawing
  of the pitch with a dot for every spot. A tap chooses it. The board's current formation is
  marked.
- **Build your own:** one row for each line, from the defence forward, with − and + to change
  how many play in it; **Add a line** and a remove button on each row. Above the rows, the
  name being built ("4-3-2-1"), the same small drawing, and a count: "2 players left to
  place", "All players placed" or "1 player too many". It starts from the board's current
  formation, or the first suggestion.
- **Apply** places the players and closes the dialog. It is disabled until a suggestion is
  chosen or the built formation fits exactly.
- Cancel, Escape and a tap outside close it without changing anything.
- Built like the app's other dialogs: `role="dialog"`, `aria-modal`, named by its heading.

## 4. Substitutes

### 4.1 Adding them

Next to **Add players** there is **Add substitutes**. It opens the same picker (players who
are neither on the pitch nor substitutes already, and the guest name field) under its own
heading. Those chosen go to the substitutes, in the order chosen.

Each player listed under the pitch also gets a **move to substitutes** button beside the one
that takes them off the board. This is how a board with more than 11 on the pitch gets down
to a team.

### 4.2 Beside the pitch

When the board has substitutes, a narrow column is shown beside the pitch, on the side where
the text ends (right in English, left in Arabic), headed "Subs". Each substitute is a small
round photo or initial with the name under it; a guest keeps the dashed ring. With more than
fit, the column scrolls. With no substitutes the column is not shown and the pitch keeps its
full width.

### 4.3 A tap on a substitute

It opens a dialog headed "Swap *name*":

- **The players on the pitch**, each with photo, name and position. A tap on one swaps them:
  the substitute takes that player's exact spot, and that player takes the substitute's place
  in the column. The dialog closes.
- **Put on the pitch:** the substitute joins the pitch without replacing anyone, at the next
  free spot (`spotForNewPlayer`).
- **Remove:** the substitute leaves the board.
- **Cancel**, Escape and a tap outside close it.

## 5. The shared image

- The line under the title gains the formation and the substitutes: "8 players · 3-3-1 · 3
  substitutes". The count is of players on the pitch.
- With substitutes, the image grows wider and a column headed "Substitutes" is drawn to the
  right of the pitch: the same circles as on the pitch, a little smaller, names under them.
  More than fit in one column start a second.
- With no substitutes and no formation, the image is exactly what it is today.

## 6. Database

One migration, `20261013000003_lineup_formations.sql`:

- `lineups.formation text`, empty for no formation. It must look like a formation
  (`^[1-6](-[1-6]){0,4}$`: one to five lines of one to six).
- `lineup_players.bench_order smallint`, empty for a player on the pitch, otherwise the
  place among the substitutes, from 0.

Guests are stored in the board's `guests` JSON; a guest among the substitutes gets a `bench`
number there, with the same meaning. Players and guests share one order.

Nothing else changes: the rules for who may read and write a board already cover the new
columns. A board made by the Team Builder writes neither, so its players are on the pitch
with no formation, as now.

**Order of release.** The migration goes to the live database first (after
`scripts/rehearse.sh` passes), then the app. The app in use until then ignores the new
columns.

## 7. Code layout

| File | Purpose |
|---|---|
| `src/utils/formation.ts` | Pure functions: `parseFormation`, `formationName`, `suggestedFormations(count)`, `formationSpots(lines)`, `assignToFormation(lines, players)` |
| `src/utils/board.ts` | `bench` on guests in `parseGuests`; `lineupChanges` writes `bench_order`; `swapWithSubstitute` |
| `src/components/FormationDialog.tsx` | The dialog of section 3 |
| `src/components/FormationDiagram.tsx` | The small pitch with a dot for each spot |
| `src/components/BenchColumn.tsx` | The substitutes beside the pitch |
| `src/components/BenchSwapDialog.tsx` | The dialog of section 4.3 |
| `src/components/PlayerPicker.tsx` | The picker, moved out of the editor page so it can serve both buttons |
| `src/pages/admin/LineupEditorPage.tsx` | The Formation button, the substitutes, loading and saving both |
| `src/lib/shareImage.ts` | The substitutes column in `drawBoardImage` |
| `src/locales/en.json`, `src/locales/ar.json` | The new wording |
| `supabase/migrations/20261013000003_lineup_formations.sql` | Section 6 |

In the editor, a substitute stays in the same lists as the players on the pitch; a separate
ordered list of ids says who is on the bench. The pitch shows everyone not in that list.

## 8. Testing

- **`formation.ts`:** every suggestion in the table adds up to its player count minus one;
  `parseFormation` accepts good names and refuses bad ones (no lines, six lines, a zero, a
  line of seven); the spots of 4-4-2, 2-2 and a one-line formation; roles for one, two and
  three or more lines.
- **`assignToFormation`:** the keeper goes in goal; each line takes its own role; too many
  defenders spill into midfield before attack; no keeper among the players; guests placed
  last; left-to-right order kept inside a line; the same input gives the same output.
- **`board.ts`:** a guest's `bench` survives `parseGuests` and a bad one is dropped;
  `lineupChanges` writes `bench_order`; a swap exchanges spot and bench place.
- **`FormationDialog`:** shows only the suggestions for its count; a tap and Apply returns
  that formation; the builder's count of players left; Apply disabled until it fits; adding
  and removing a line; Escape closes.
- **`BenchSwapDialog`:** lists the players on the pitch; a tap swaps; Put on the pitch and
  Remove.
- **Editor page:** the button disabled under 2 and over 11 with its line; applying moves the
  players and shows the name; the name goes when a player is added; substitutes added,
  shown beside the pitch, swapped; a saved board with a formation and substitutes loads back
  the same; saving writes `formation`, `bench_order` and the guests' `bench`.
- **`drawBoardImage`:** the canvas is wider with substitutes and unchanged without.
- **Arabic:** the dialogs and the column show their Arabic wording (`inArabic`).
- **Database:** `scripts/rehearse.sh` passes with the migration.

## 9. Out of scope

- A formation for each team on a Team Builder board that holds several teams.
- Keeping a formation he built in a list to use again on other boards.
- Dragging between the pitch and the substitutes.
- Locking players to their spots, shirt numbers, a captain.
- The other team's formation.
