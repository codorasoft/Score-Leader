import type { PlayerPosition } from '../lib/types'
import type { BoardSpot } from './board'

// A formation is its lines from the defence forward, each with a number of players: "4-3-2-1"
// is four lines. The goalkeeper is not written and is always there.
export const MAX_LINES = 5
export const MAX_IN_LINE = 6
export const MIN_ON_PITCH = 2
export const MAX_ON_PITCH = 11

// The same rule as the database's check on lineups.formation
const FORMATION = /^[1-6](-[1-6]){0,4}$/

// "4-3-2-1" -> [4, 3, 2, 1]; null for anything that is not one to five lines of one to six
export function parseFormation(name: unknown): number[] | null {
  if (typeof name !== 'string' || !FORMATION.test(name)) return null
  return name.split('-').map(Number)
}

export const formationName = (lines: number[]): string => lines.join('-')

// Valid lines that add up to everyone on the pitch but the goalkeeper, for a team of up to eleven
export function fitsPitch(lines: number[], onPitch: number): boolean {
  if (onPitch < MIN_ON_PITCH || onPitch > MAX_ON_PITCH) return false
  return parseFormation(formationName(lines)) !== null && lines.reduce((sum, n) => sum + n, 0) === onPitch - 1
}

// What is offered for each number of players on the pitch
const SUGGESTED: Record<number, string[]> = {
  2: ['1'],
  3: ['1-1', '2'],
  4: ['2-1', '1-2', '1-1-1'],
  5: ['2-2', '1-2-1', '2-1-1', '1-1-2'],
  6: ['2-2-1', '2-1-2', '3-2', '1-3-1'],
  7: ['2-3-1', '3-2-1', '3-1-2', '2-2-2'],
  8: ['3-3-1', '2-4-1', '3-2-2', '2-3-2'],
  9: ['3-3-2', '3-4-1', '4-3-1', '3-2-3'],
  10: ['3-4-2', '4-3-2', '4-4-1', '3-3-3'],
  11: ['4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '4-3-2-1', '5-3-2', '3-4-3', '4-1-4-1'],
}

export const suggestedFormations = (onPitch: number): string[] => SUGGESTED[onPitch] ?? []

export interface FormationSpot extends BoardSpot { role: PlayerPosition }

const KEEPER: FormationSpot = { x: 0.5, y: 0.92, role: 'GK' }
// The team plays up the pitch: the defence just ahead of its keeper, the attack in the far third
const DEFENCE_Y = 0.74
const ATTACK_Y = 0.2
// A line stays inside the touchlines by this much on each side
const SIDE = 0.08

const round = (n: number) => Math.round(n * 10000) / 10000

const roleOfLine = (line: number, lines: number): PlayerPosition => {
  if (lines === 1) return 'MID'
  if (line === 0) return 'DEF'
  return line === lines - 1 ? 'ATT' : 'MID'
}

// The goalkeeper first, then each line from the defence forward, each from left to right
export function formationSpots(lines: number[]): FormationSpot[] {
  const spots = [{ ...KEEPER }]
  lines.forEach((count, line) => {
    const y = lines.length === 1
      ? (DEFENCE_Y + ATTACK_Y) / 2
      : DEFENCE_Y - (line * (DEFENCE_Y - ATTACK_Y)) / (lines.length - 1)
    for (let i = 0; i < count; i++) {
      spots.push({ x: round(SIDE + ((1 - SIDE * 2) * (i + 0.5)) / count), y: round(y), role: roleOfLine(line, lines.length) })
    }
  })
  return spots
}
