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

// Saving replaces the stored board: players taken off are removed, everyone else is upserted.
export function lineupChanges(lineupId: string, savedPlayerIds: string[], current: BoardPlayer[]) {
  const keep = new Set(current.map((p) => p.playerId))
  return {
    remove: savedPlayerIds.filter((id) => !keep.has(id)),
    upsert: current.map((p) => ({ lineup_id: lineupId, player_id: p.playerId, x: p.x, y: p.y })),
  }
}

// Guests are typed names (not in the Players list), stored with the board itself.
export interface Guest { id: string; name: string; x: number; y: number }

export const GUEST_NAME_MAX = 40

export function makeGuest(name: string, spot: BoardSpot, id: string): Guest | null {
  const trimmed = name.trim().slice(0, GUEST_NAME_MAX)
  return trimmed ? { id, name: trimmed, ...spot } : null
}

const unit = (v: unknown) => typeof v === 'number' && v >= 0 && v <= 1

export function parseGuests(raw: unknown): Guest[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((g): g is Guest => {
    if (!g || typeof g !== 'object') return false
    const o = g as Record<string, unknown>
    return typeof o.id === 'string' && typeof o.name === 'string' && o.name.trim().length > 0 && unit(o.x) && unit(o.y)
  })
}
