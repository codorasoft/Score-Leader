import type { Player } from '../lib/types'

// A spot in a team's own half: x 0 (left) .. 1 (right), y 0 (own goal line) .. 1 (halfway line).
export interface Spot { x: number; y: number }
export type Side = 'bottom' | 'top'

// Outfield rows from back to front for each number of outfield players
export const ROW_LAYOUTS: Record<number, number[]> = {
  1: [1], 2: [2], 3: [2, 1], 4: [2, 2], 5: [2, 1, 2], 6: [2, 2, 2], 7: [3, 2, 2], 8: [3, 3, 2],
}
const ROW_X: Record<number, number[]> = { 1: [0.5], 2: [0.3, 0.7], 3: [0.2, 0.5, 0.8] }
// Far enough off the goal line that the name label stays on the pitch
const GOAL_SPOT: Spot = { x: 0.5, y: 0.16 }
const DEPTH = { GK: 0, DEF: 1, MID: 2, ATT: 3 } as const

const round = (n: number) => Math.round(n * 10000) / 10000
const clamp = (n: number) => round(Math.min(1, Math.max(0, n)))

const rowsFor = (n: number) => ROW_LAYOUTS[n] ?? Array.from({ length: Math.ceil(n / 3) }, (_, i) => Math.min(3, n - i * 3))

export function defaultFormation(players: Pick<Player, 'id' | 'position'>[]): Map<string, Spot> {
  const spots = new Map<string, Spot>()
  const keeper = players.find((p) => p.position === 'GK')
  if (keeper) spots.set(keeper.id, GOAL_SPOT)

  // Defenders take the back rows, attackers the front; any extra goalkeeper plays at the back
  const outfield = players.filter((p) => p !== keeper).sort((a, b) => DEPTH[a.position] - DEPTH[b.position])
  const rows = rowsFor(outfield.length)
  let next = 0
  rows.forEach((size, r) => {
    const y = rows.length === 1 ? 0.55 : 0.3 + (r * 0.5) / (rows.length - 1)
    const xs = ROW_X[size] ?? Array.from({ length: size }, (_, j) => (j + 1) / (size + 1))
    for (const x of xs) spots.set(outfield[next++].id, { x: round(x), y: round(y) })
  })
  return spots
}

// Full pitch, viewed from above: px 0..1 left→right, py 0 (top goal) .. 1 (bottom goal).
// The top team is mirrored so both teams attack towards each other.
export function toPitch(spot: Spot, side: Side) {
  return side === 'bottom'
    ? { px: round(spot.x), py: round(1 - spot.y / 2) }
    : { px: round(1 - spot.x), py: round(spot.y / 2) }
}

export function fromPitch(point: { px: number; py: number }, side: Side): Spot {
  return side === 'bottom'
    ? { x: clamp(point.px), y: clamp(2 * (1 - point.py)) }
    : { x: clamp(1 - point.px), y: clamp(2 * point.py) }
}
