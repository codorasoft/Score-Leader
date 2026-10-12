import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Player } from '../lib/types'
import { clampSpot, type BoardSpot } from '../utils/board'
import { DRAW_COLORS, shapeFromDrag, type BoardText, type DrawColor, type DrawTool, type Label, type Shape } from '../utils/boardDrawings'
import { styleMap } from '../lib/teamColors'

const colorDot = styleMap('dot')

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

// Shapes are stored as 0..1 of the pitch; the SVG uses the pitch's 100 x 150 units.
export function ShapeView({ shape, onErase, eraseLabel }: { shape: Shape; onErase?: () => void; eraseLabel?: string }) {
  // Team names and free text are text, placed over the pitch by the board itself
  if (shape.kind === 'label' || shape.kind === 'text') return null
  const color = DRAW_COLORS[shape.color]
  const erasable = onErase
    ? { onClick: onErase, role: 'button', 'aria-label': eraseLabel, className: 'cursor-pointer', style: { pointerEvents: 'auto' as const } }
    : {}
  if (shape.kind === 'zone') {
    return (
      <circle {...erasable} cx={shape.cx * 100} cy={shape.cy * 150} r={shape.r * 100}
        fill={color} fillOpacity={0.22} stroke={color} strokeOpacity={0.9} strokeWidth={0.7} />
    )
  }
  const x1 = shape.x1 * 100, y1 = shape.y1 * 150, x2 = shape.x2 * 100, y2 = shape.y2 * 150
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const head = 4.5
  const spread = 0.45
  const tip = `${x2},${y2} ${x2 - head * Math.cos(angle - spread)},${y2 - head * Math.sin(angle - spread)} ${x2 - head * Math.cos(angle + spread)},${y2 - head * Math.sin(angle + spread)}`
  // Stop the line just short of the tip so the dashes don't poke through the arrowhead
  const lx = x2 - head * 0.7 * Math.cos(angle)
  const ly = y2 - head * 0.7 * Math.sin(angle)
  return (
    <g {...erasable}>
      {onErase && <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={6} />}
      <line x1={x1} y1={y1} x2={lx} y2={ly} stroke={color} strokeWidth={1.3} strokeLinecap="round"
        strokeDasharray={shape.dashed ? '3 2.2' : undefined} />
      <polygon points={tip} fill={color} />
    </g>
  )
}

interface Props {
  // Guests are typed names (not in the Players list) and get a dashed grey ring
  players: { player: Pick<Player, 'id' | 'name' | 'photo_url'>; x: number; y: number; guest?: boolean }[]
  onMove: (playerId: string, spot: BoardSpot) => void
  tool?: DrawTool
  color?: DrawColor
  drawings?: Shape[]
  onAddShape?: (shape: Shape) => void
  onEraseShape?: (id: string) => void
  // The text tool: a tap on the pitch says where a new text goes (the page asks what it says)
  onPlaceText?: (spot: BoardSpot) => void
  // The move tool also drags free text
  onMoveShape?: (id: string, spot: BoardSpot) => void
  // A tap on a free text (with the move tool or the text tool) asks to change it
  onEditText?: (id: string) => void
}

// A press that ends this close (in screen pixels) to where it began is a tap, not a drag.
// A finger is never perfectly still, so anything tighter turns taps into tiny drags.
const TAP_SLOP = 10

// Free board: drag players anywhere with the Move tool; with a drawing tool, drag on the pitch
// to draw an arrow or zone; with the text tool, tap where a text should go; with the eraser, tap a
// drawing to remove it.
export function PitchBoard({ players, onMove, tool = 'move', color = 'white', drawings = [], onAddShape, onEraseShape, onPlaceText, onMoveShape, onEditText }: Props) {
  const { t } = useTranslation()
  const pitchRef = useRef<HTMLDivElement>(null)
  // The gesture in progress lives in refs so a fast press-move-release (before React re-renders)
  // is never lost; the state copies only drive what is drawn on screen.
  const dragRef = useRef<{ playerId: string; spot: BoardSpot } | null>(null)
  const sketchRef = useRef<{ from: BoardSpot; to: BoardSpot } | null>(null)
  const [dragging, setDragging] = useState<{ playerId: string; spot: BoardSpot } | null>(null)
  const [sketch, setSketch] = useState<{ from: BoardSpot; to: BoardSpot } | null>(null)
  const setDrag = (d: typeof dragging) => { dragRef.current = d; setDragging(d) }
  const setSketchBoth = (k: typeof sketch) => { sketchRef.current = k; setSketch(k) }
  const drawing = tool === 'pass' || tool === 'run' || tool === 'zone'
  // A free text being dragged; kept apart from players so the two never share a gesture
  const textDragRef = useRef<{ id: string; spot: BoardSpot } | null>(null)
  const [textDragging, setTextDragging] = useState<{ id: string; spot: BoardSpot } | null>(null)
  const setTextDrag = (d: typeof textDragging) => { textDragRef.current = d; setTextDragging(d) }
  // Where the press on a text began, and whether it ended as a drag: the browser sends a click
  // after a drag too, and that click must not open the editor
  const pressRef = useRef<{ x: number; y: number } | null>(null)
  const draggedRef = useRef(false)

  const pointToSpot = (e: React.PointerEvent): BoardSpot => {
    const rect = pitchRef.current!.getBoundingClientRect()
    return clampSpot({ x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height })
  }

  const preview = sketch && shapeFromDrag(tool, sketch.from, sketch.to, color, 'preview')
  const labels = drawings.filter((d): d is Label => d.kind === 'label')
  const texts = drawings.filter((d): d is BoardText => d.kind === 'text')
  // A dark plate keeps every colour readable on the grass
  const textLook = 'absolute -translate-x-1/2 -translate-y-1/2 max-w-[70%] rounded-md bg-black/60 px-2 py-0.5 text-[13px] font-bold leading-tight text-center break-words'
  const labelLook = 'absolute z-[6] -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 whitespace-nowrap rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-bold text-white'

  return (
    <div ref={pitchRef} className="relative w-full aspect-[2/3] rounded-xl overflow-hidden shadow-lg" dir="ltr">
      <PitchMarkings />

      <svg viewBox="0 0 100 150" preserveAspectRatio="none" className="absolute inset-0 w-full h-full z-[5] pointer-events-none">
        {drawings.map((s) => (
          <ShapeView key={s.id} shape={s} eraseLabel={t('board.removeDrawing')}
            onErase={tool === 'erase' && onEraseShape ? () => onEraseShape(s.id) : undefined} />
        ))}
        {preview && <ShapeView shape={preview} />}
      </svg>

      {/* Team names: under the players, and something to press only for the eraser */}
      {labels.map((l) => {
        const place = { left: `${l.x * 100}%`, top: `${l.y * 100}%` }
        const content = <><span className={`w-2 h-2 rounded-full shrink-0 ${colorDot[l.team] ?? 'bg-gray-400'}`} aria-hidden="true" />{l.text}</>
        return tool === 'erase' && onEraseShape
          ? <button key={l.id} type="button" dir="auto" aria-label={t('board.removeLabel', { name: l.text })} onClick={() => onEraseShape(l.id)} className={`${labelLook} cursor-pointer`} style={place}>{content}</button>
          : <div key={l.id} dir="auto" className={`${labelLook} pointer-events-none`} style={place}>{content}</div>
      })}

      {/* Free text: dragged or tapped with the move tool, tapped with the text tool, pressed by the
          eraser, otherwise just shown */}
      {texts.map((s) => {
        const isDragged = textDragging?.id === s.id
        const spot = isDragged ? textDragging.spot : { x: s.x, y: s.y }
        const style = { left: `${spot.x * 100}%`, top: `${spot.y * 100}%`, color: DRAW_COLORS[s.color] }
        if (tool === 'erase' && onEraseShape) {
          return <button key={s.id} type="button" dir="auto" aria-label={t('board.removeLabel', { name: s.text })} onClick={() => onEraseShape(s.id)} className={`${textLook} z-[6] cursor-pointer`} style={style}>{s.text}</button>
        }
        if (tool === 'text' && onEditText) {
          // Above the layer that places new text, so a tap here changes this text instead
          return <button key={s.id} type="button" dir="auto" onClick={() => onEditText(s.id)} className={`${textLook} z-[31] cursor-pointer`} style={style}>{s.text}</button>
        }
        if (tool === 'move' && onMoveShape) {
          return (
            <button
              key={s.id}
              type="button"
              dir="auto"
              className={`${textLook} select-none touch-none cursor-grab ${isDragged ? 'z-20 scale-110' : 'z-[6]'}`}
              style={style}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId)
                pressRef.current = { x: e.clientX, y: e.clientY }
                draggedRef.current = false
                setTextDrag({ id: s.id, spot: { x: s.x, y: s.y } })
              }}
              onPointerMove={(e) => { if (textDragRef.current?.id === s.id) setTextDrag({ id: s.id, spot: pointToSpot(e) }) }}
              onPointerUp={(e) => {
                if (textDragRef.current?.id !== s.id) return
                setTextDrag(null)
                const from = pressRef.current
                // A tap leaves the text where it is; the click that follows opens it
                if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) <= TAP_SLOP) return
                draggedRef.current = true
                onMoveShape(s.id, pointToSpot(e))
              }}
              onPointerCancel={() => setTextDrag(null)}
              onClick={() => {
                if (draggedRef.current) { draggedRef.current = false; return }
                onEditText?.(s.id)
              }}
            >
              {s.text}
            </button>
          )
        }
        return <div key={s.id} dir="auto" className={`${textLook} z-[6] pointer-events-none`} style={style}>{s.text}</div>
      })}

      {players.map(({ player, x, y, guest }) => {
        const isDragged = dragging?.playerId === player.id
        const spot = isDragged ? dragging.spot : { x, y }
        return (
          <button
            key={player.id}
            type="button"
            aria-label={guest ? t('lineups.guestLabel', { name: player.name }) : player.name}
            // The spot is the centre of the circle (22px down from its top), as in the shared image, so a
            // name on two lines hangs lower instead of lifting its token out of line with the others
            className={`absolute -translate-x-1/2 -translate-y-[22px] flex flex-col items-center select-none touch-none transition-transform ${isDragged ? 'z-20 scale-110' : 'z-10'} ${tool !== 'move' ? 'pointer-events-none' : ''}`}
            style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%` }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              setDrag({ playerId: player.id, spot: { x, y } })
            }}
            onPointerMove={(e) => { if (dragRef.current?.playerId === player.id) setDrag({ playerId: player.id, spot: pointToSpot(e) }) }}
            onPointerUp={(e) => {
              if (dragRef.current?.playerId !== player.id) return
              setDrag(null)
              onMove(player.id, pointToSpot(e))
            }}
            onPointerCancel={() => setDrag(null)}
          >
            <span className={`w-11 h-11 rounded-full border-[3px] overflow-hidden flex items-center justify-center font-bold text-white shadow-lg cursor-grab ${guest ? 'border-dashed border-gray-300 bg-gray-600' : 'border-white bg-gray-800'}`}>
              {player.photo_url
                ? <img src={player.photo_url} alt="" draggable={false} className="w-full h-full object-cover" />
                : player.name.charAt(0).toUpperCase()}
            </span>
            <span className="mt-0.5 max-w-[72px] text-center leading-tight break-words text-[10px] font-semibold text-white bg-black/55 rounded px-1">
              {player.name}
            </span>
          </button>
        )
      })}

      {tool === 'text' && (
        <div
          aria-label={t('board.drawingArea')}
          className="absolute inset-0 z-30 touch-none cursor-text"
          onPointerUp={(e) => onPlaceText?.(pointToSpot(e))}
        />
      )}

      {drawing && (
        <div
          aria-label={t('board.drawingArea')}
          className="absolute inset-0 z-30 touch-none cursor-crosshair"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            const at = pointToSpot(e)
            setSketchBoth({ from: at, to: at })
          }}
          onPointerMove={(e) => { if (sketchRef.current) setSketchBoth({ ...sketchRef.current, to: pointToSpot(e) }) }}
          onPointerUp={(e) => {
            const started = sketchRef.current
            setSketchBoth(null)
            if (!started) return
            const shape = shapeFromDrag(tool, started.from, pointToSpot(e), color, crypto.randomUUID())
            if (shape) onAddShape?.(shape)
          }}
          onPointerCancel={() => setSketchBoth(null)}
        />
      )}
    </div>
  )
}
