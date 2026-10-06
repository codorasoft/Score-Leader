import type { TeamColor } from './types'

// Teams get colours in this order. Red is left out: the league's teams were moved from red to green.
export const TEAM_COLORS: readonly TeamColor[] = ['green', 'blue', 'yellow', 'orange', 'purple', 'white']

interface TeamStyle {
  dot: string   // small round marker next to a team name
  card: string  // score card / team box background and border
  board: string // team builder column
  hex: string   // share images (canvas)
}

// Class names are written out in full so Tailwind generates them.
const STYLES: Record<TeamColor, TeamStyle> = {
  green: { dot: 'bg-green-500', card: 'bg-green-900/40 border-green-600', board: 'border-green-500 bg-green-900/20', hex: '#22c55e' },
  blue: { dot: 'bg-blue-500', card: 'bg-blue-900/40 border-blue-600', board: 'border-blue-500 bg-blue-900/20', hex: '#3b82f6' },
  yellow: { dot: 'bg-yellow-400', card: 'bg-yellow-900/40 border-yellow-600', board: 'border-yellow-500 bg-yellow-900/20', hex: '#facc15' },
  orange: { dot: 'bg-orange-500', card: 'bg-orange-900/40 border-orange-600', board: 'border-orange-500 bg-orange-900/20', hex: '#f97316' },
  purple: { dot: 'bg-purple-500', card: 'bg-purple-900/40 border-purple-600', board: 'border-purple-500 bg-purple-900/20', hex: '#a855f7' },
  white: { dot: 'bg-gray-100', card: 'bg-gray-100/10 border-gray-200', board: 'border-gray-200 bg-gray-100/10', hex: '#f3f4f6' },
}

export const teamStyle = (color: TeamColor): TeamStyle => STYLES[color]

// One style per colour name, for components that look colours up by name
export const styleMap = (kind: keyof TeamStyle): Record<string, string> =>
  Object.fromEntries(TEAM_COLORS.map((c) => [c, STYLES[c][kind]]))
