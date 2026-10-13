// A spot on the full pitch seen from above: x 0 (left) .. 1 (right), y 0 (top goal) .. 1 (bottom goal).
export interface BoardSpot { x: number; y: number }

const ROW_Y = [0.85, 0.7, 0.55, 0.4, 0.25, 0.1]
const COL_X = [0.2, 0.4, 0.6, 0.8]

const round = (n: number) => Math.round(n * 10000) / 10000

// New players land in tidy rows of four from the bottom up; after 24 the grid repeats slightly
// offset so tokens never sit exactly on top of each other.
export function spotForNewPlayer(index: number): BoardSpot {
  const perLayer = ROW_Y.length * COL_X.length
  const layer = Math.floor(index / perLayer) % 3
  const inLayer = index % perLayer
  return {
    x: round(COL_X[inLayer % COL_X.length] + layer * 0.05),
    y: round(ROW_Y[Math.floor(inLayer / COL_X.length)] - layer * 0.03),
  }
}

export const clampSpot = (s: BoardSpot): BoardSpot => ({
  x: round(Math.min(1, Math.max(0, s.x))),
  y: round(Math.min(1, Math.max(0, s.y))),
})

export interface BoardPlayer { playerId: string; x: number; y: number }

const ROW_MAX = 6
// How far above its row a team's name sits, as a share of the pitch's length: clear of the tokens
const LABEL_ABOVE = 0.062
const linesOf = (size: number) => Math.max(1, Math.ceil(size / ROW_MAX))

// Every team on one board: a row each from the top down, its players spread evenly across in the
// order given. A team of more than six wraps onto further lines inside its own band of the pitch.
export function spotsForTeams(teams: string[][]): BoardPlayer[] {
  return teams.flatMap((team, row) => {
    const lines = linesOf(team.length)
    const perLine = Math.ceil(team.length / lines)
    return team.map((playerId, i) => {
      const line = Math.floor(i / perLine)
      const inLine = Math.min(perLine, team.length - line * perLine)
      return {
        playerId,
        x: round(((i % perLine) + 0.5) / inLine),
        y: round((row + (line + 0.5) / lines) / teams.length),
      }
    })
  })
}

// Where each team's name goes on that board: in the middle, just above the first line of its row
export function labelSpotsForTeams(teams: string[][]): BoardSpot[] {
  return teams.map((team, row) => ({
    x: 0.5,
    y: round(Math.max(0.02, (row + 0.5 / linesOf(team.length)) / teams.length - LABEL_ABOVE)),
  }))
}

// Saving replaces the stored board: players taken off are removed, everyone else is upserted.
// `bench` is the substitutes' ids in order (players and guests together); a player's place in
// it is saved, and a player on the pitch is saved with none.
export function lineupChanges(lineupId: string, savedPlayerIds: string[], current: BoardPlayer[], bench: string[] = []) {
  const keep = new Set(current.map((p) => p.playerId))
  const place = (id: string) => { const at = bench.indexOf(id); return at === -1 ? null : at }
  return {
    remove: savedPlayerIds.filter((id) => !keep.has(id)),
    upsert: current.map((p) => ({ lineup_id: lineupId, player_id: p.playerId, x: p.x, y: p.y, bench_order: place(p.playerId) })),
  }
}

// Guests are typed names (not in the Players list), stored with the board itself. A guest among
// the substitutes has a `bench` number: the place there, in one order with the players.
export interface Guest { id: string; name: string; x: number; y: number; bench?: number }

export const GUEST_NAME_MAX = 40

export function makeGuest(name: string, spot: BoardSpot, id: string): Guest | null {
  const trimmed = name.trim().slice(0, GUEST_NAME_MAX)
  return trimmed ? { id, name: trimmed, ...spot } : null
}

const unit = (v: unknown) => typeof v === 'number' && v >= 0 && v <= 1

const benchPlace = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0

// A guest whose place on the bench is damaged is read as being on the pitch
export function parseGuests(raw: unknown): Guest[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((g): g is Guest => {
      if (!g || typeof g !== 'object') return false
      const o = g as Record<string, unknown>
      return typeof o.id === 'string' && typeof o.name === 'string' && o.name.trim().length > 0 && unit(o.x) && unit(o.y)
    })
    .map(({ id, name, x, y, bench }) => (benchPlace(bench) ? { id, name, x, y, bench } : { id, name, x, y }))
}

// The substitutes' ids in order: by their number, a player before a guest on the same number,
// then as given
export function benchOrder(players: { id: string; bench: number | null }[], guests: Guest[]): string[] {
  return [...players, ...guests.map((g) => ({ id: g.id, bench: g.bench ?? null }))]
    .filter((p): p is { id: string; bench: number } => p.bench !== null)
    .sort((a, b) => a.bench - b.bench)
    .map((p) => p.id)
}

// The guests as stored: `bench` is the place in `bench`, and absent for a guest on the pitch
export function guestsForSaving(guests: Guest[], bench: string[]): Guest[] {
  return guests.map(({ id, name, x, y }) => {
    const at = bench.indexOf(id)
    return at === -1 ? { id, name, x, y } : { id, name, x, y, bench: at }
  })
}

// Anyone on the board, player or guest
export interface Placed { id: string; x: number; y: number }

// The substitute takes the starter's spot, and the starter takes the substitute's place on the
// bench. null when the substitute is not on the bench, or the starter is on it or not on the
// board: a second tap that arrives after the swap changes nothing.
export function swapWithSubstitute(bench: string[], everyone: Placed[], subId: string, starterId: string): { bench: string[]; move: Placed } | null {
  const starter = everyone.find((p) => p.id === starterId)
  if (!starter || !bench.includes(subId) || bench.includes(starterId)) return null
  return {
    bench: bench.map((id) => (id === subId ? starterId : id)),
    move: { id: subId, x: starter.x, y: starter.y },
  }
}
