import { useRef, useState } from 'react'
import type { Player, TeamColor } from '../lib/types'
import { fromPitch, toPitch, type Side, type Spot } from '../utils/lineup'

export interface PitchTeam {
  id: string
  color: TeamColor
  players: { player: Player; spot: Spot }[]
}

export const TEAM_HEX: Record<TeamColor, string> = { green: '#22c55e', blue: '#3b82f6', yellow: '#facc15' }

interface Props {
  bottom: PitchTeam
  top: PitchTeam
  onMove: (teamId: string, playerId: string, spot: Spot) => void
}

export function PitchMarkings() {
  return (
    <svg viewBox="0 0 100 150" className="absolute inset-0 w-full h-full" preserveAspectRatio="none" aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <rect key={i} x="0" y={i * 15} width="100" height="15" fill={i % 2 ? '#15803d' : '#16a34a'} />
      ))}
      <g fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.6">
        <rect x="3" y="3" width="94" height="144" />
        <line x1="3" y1="75" x2="97" y2="75" />
        <circle cx="50" cy="75" r="11" />
        <rect x="25" y="3" width="50" height="20" />
        <rect x="38" y="3" width="24" height="7" />
        <rect x="25" y="127" width="50" height="20" />
        <rect x="38" y="140" width="24" height="7" />
        <rect x="43" y="0.5" width="14" height="2.5" />
        <rect x="43" y="147" width="14" height="2.5" />
      </g>
      <circle cx="50" cy="75" r="0.9" fill="white" />
    </svg>
  )
}

// Players are dragged inside their own half only; the spot is saved when the finger is lifted.
export function LineupPitch({ bottom, top, onMove }: Props) {
  const pitchRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<{ teamId: string; playerId: string; side: Side; spot: Spot } | null>(null)

  const pointToSpot = (e: React.PointerEvent, side: Side) => {
    const rect = pitchRef.current!.getBoundingClientRect()
    return fromPitch({ px: (e.clientX - rect.left) / rect.width, py: (e.clientY - rect.top) / rect.height }, side)
  }

  const token = (team: PitchTeam, side: Side, { player, spot }: PitchTeam['players'][number]) => {
    const isDragged = dragging?.playerId === player.id && dragging.teamId === team.id
    const { px, py } = toPitch(isDragged ? dragging.spot : spot, side)
    return (
      <button
        key={player.id}
        type="button"
        aria-label={player.name}
        className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center select-none touch-none ${isDragged ? 'z-20 scale-110' : 'z-10'} transition-transform`}
        style={{ left: `${px * 100}%`, top: `${py * 100}%` }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setDragging({ teamId: team.id, playerId: player.id, side, spot })
        }}
        onPointerMove={(e) => { if (isDragged) setDragging({ ...dragging, spot: pointToSpot(e, side) }) }}
        onPointerUp={(e) => {
          if (!isDragged) return
          const final = pointToSpot(e, side)
          setDragging(null)
          onMove(team.id, player.id, final)
        }}
        onPointerCancel={() => setDragging(null)}
      >
        <span
          className="w-11 h-11 rounded-full border-[3px] bg-gray-800 overflow-hidden flex items-center justify-center font-bold text-white shadow-lg cursor-grab"
          style={{ borderColor: TEAM_HEX[team.color] }}
        >
          {player.photo_url
            ? <img src={player.photo_url} alt="" draggable={false} className="w-full h-full object-cover" />
            : player.name.charAt(0).toUpperCase()}
        </span>
        <span className="mt-0.5 max-w-[72px] truncate text-[10px] font-semibold text-white bg-black/50 rounded px-1">
          {player.name}
        </span>
      </button>
    )
  }

  return (
    <div ref={pitchRef} className="relative w-full aspect-[2/3] rounded-xl overflow-hidden shadow-lg" dir="ltr">
      <PitchMarkings />
      {top.players.map((p) => token(top, 'top', p))}
      {bottom.players.map((p) => token(bottom, 'bottom', p))}
    </div>
  )
}
