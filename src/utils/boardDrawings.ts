// Arrows and zones on the coach board. Positions are fractions of the pitch (x across, y down);
// a zone's radius is a fraction of the pitch width. The pitch is 2:3, so 1 unit of y = 1.5 of x.

import { TEAM_COLORS } from '../lib/teamColors'
import type { TeamColor } from '../lib/types'

export const DRAW_COLORS = { white: '#ffffff', yellow: '#facc15', red: '#ef4444', blue: '#3b82f6' } as const
export type DrawColor = keyof typeof DRAW_COLORS
export type DrawTool = 'move' | 'pass' | 'run' | 'zone' | 'erase'

export type Shape =
  | { id: string; kind: 'arrow'; dashed: boolean; color: DrawColor; x1: number; y1: number; x2: number; y2: number }
  | { id: string; kind: 'zone'; color: DrawColor; cx: number; cy: number; r: number }
  // A team's name written on the board. Not drawn by hand: a board made from the team builder
  // gets one above each team's row. It stays put, and comes off with the eraser.
  | { id: string; kind: 'label'; team: TeamColor; text: string; x: number; y: number }

export type Label = Extract<Shape, { kind: 'label' }>

// Undo and Clear act on what was drawn by hand; team names stay until they are erased
const drawn = (s: Shape) => s.kind !== 'label'
export const hasDrawn = (shapes: Shape[]) => shapes.some(drawn)
export const clearDrawn = (shapes: Shape[]) => shapes.filter((s) => !drawn(s))
export function undoDrawn(shapes: Shape[]): Shape[] {
  const last = shapes.map(drawn).lastIndexOf(true)
  return last < 0 ? shapes : shapes.filter((_, i) => i !== last)
}

interface Point { x: number; y: number }

const HEIGHT_RATIO = 1.5
const MIN_ARROW = 0.04
const MIN_ZONE = 0.03

const round = (n: number) => Math.round(n * 10000) / 10000
const span = (a: Point, b: Point) => Math.hypot(b.x - a.x, (b.y - a.y) * HEIGHT_RATIO)

export function shapeFromDrag(tool: DrawTool, a: Point, b: Point, color: DrawColor, id: string): Shape | null {
  if (tool === 'pass' || tool === 'run') {
    if (span(a, b) < MIN_ARROW) return null
    return { id, kind: 'arrow', dashed: tool === 'run', color, x1: round(a.x), y1: round(a.y), x2: round(b.x), y2: round(b.y) }
  }
  if (tool === 'zone') {
    const r = span(a, b)
    if (r < MIN_ZONE) return null
    return { id, kind: 'zone', color, cx: round(a.x), cy: round(a.y), r: round(r) }
  }
  return null
}

const unit = (v: unknown) => typeof v === 'number' && v >= 0 && v <= 1

// Saved drawings come back as JSON; anything malformed is dropped rather than breaking the board.
export function parseDrawings(raw: unknown): Shape[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((s): s is Shape => {
    if (!s || typeof s !== 'object') return false
    const o = s as Record<string, unknown>
    if (typeof o.id !== 'string') return false
    if (o.kind === 'label') {
      return TEAM_COLORS.includes(o.team as TeamColor) && typeof o.text === 'string' && o.text.trim().length > 0 && unit(o.x) && unit(o.y)
    }
    if (!(typeof o.color === 'string' && o.color in DRAW_COLORS)) return false
    if (o.kind === 'arrow') return typeof o.dashed === 'boolean' && [o.x1, o.y1, o.x2, o.y2].every(unit)
    if (o.kind === 'zone') return [o.cx, o.cy].every(unit) && typeof o.r === 'number' && o.r > 0 && o.r <= 2
    return false
  })
}
