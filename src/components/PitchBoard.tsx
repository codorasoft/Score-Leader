import { useRef, useState } from 'react'
import type { Player } from '../lib/types'
import { clampSpot, type BoardSpot } from '../utils/board'

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

interface Props {
  players: { player: Player; x: number; y: number }[]
  onMove: (playerId: string, spot: BoardSpot) => void
}

// Free board: any player can be dragged anywhere on the pitch with a finger or the mouse.
export function PitchBoard({ players, onMove }: Props) {
  const pitchRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<{ playerId: string; spot: BoardSpot } | null>(null)

  const pointToSpot = (e: React.PointerEvent): BoardSpot => {
    const rect = pitchRef.current!.getBoundingClientRect()
    return clampSpot({ x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height })
  }

  return (
    <div ref={pitchRef} className="relative w-full aspect-[2/3] rounded-xl overflow-hidden shadow-lg" dir="ltr">
      <PitchMarkings />
      {players.map(({ player, x, y }) => {
        const isDragged = dragging?.playerId === player.id
        const spot = isDragged ? dragging.spot : { x, y }
        return (
          <button
            key={player.id}
            type="button"
            aria-label={player.name}
            className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center select-none touch-none transition-transform ${isDragged ? 'z-20 scale-110' : 'z-10'}`}
            style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%` }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              setDragging({ playerId: player.id, spot: { x, y } })
            }}
            onPointerMove={(e) => { if (isDragged) setDragging({ playerId: player.id, spot: pointToSpot(e) }) }}
            onPointerUp={(e) => {
              if (!isDragged) return
              setDragging(null)
              onMove(player.id, pointToSpot(e))
            }}
            onPointerCancel={() => setDragging(null)}
          >
            <span className="w-11 h-11 rounded-full border-[3px] border-white bg-gray-800 overflow-hidden flex items-center justify-center font-bold text-white shadow-lg cursor-grab">
              {player.photo_url
                ? <img src={player.photo_url} alt="" draggable={false} className="w-full h-full object-cover" />
                : player.name.charAt(0).toUpperCase()}
            </span>
            <span className="mt-0.5 max-w-[72px] truncate text-[10px] font-semibold text-white bg-black/55 rounded px-1">
              {player.name}
            </span>
          </button>
        )
      })}
    </div>
  )
}
