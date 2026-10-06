import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { clampOffset, minZoom, photoPlacement, MAX_ZOOM, type Offset } from '../lib/photoCrop'

const VIEW = 280
const OUTPUT_PX = 512
const JPEG_QUALITY = 0.85
const ZOOM_STEP = 0.25
// Parts of the circle the photo doesn't cover; same colour as the avatar background (gray-700)
const BACKGROUND = '#374151'

interface Props {
  // An object URL for a newly picked file, or the player's saved photo URL
  src: string
  onCancel: () => void
  onDone: (photo: Blob) => void
}

// Frame a photo inside the round avatar: drag any part of it to the centre, pinch / slider / wheel to zoom in or out.
export function PhotoCropper({ src, onCancel, onDone }: Props) {
  const { t } = useTranslation()
  const imgRef = useRef<HTMLImageElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [failed, setFailed] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 })

  useEffect(() => { setSize(null); setFailed(false); setZoom(1); setOffset({ x: 0, y: 0 }) }, [src])

  const apply = (nextZoom: number, nextOffset: Offset) => {
    if (!size) return
    const z = Math.min(MAX_ZOOM, Math.max(minZoom(size.w, size.h), nextZoom))
    setZoom(z)
    setOffset(clampOffset(nextOffset, size.w, size.h, VIEW, z))
  }

  const distance = () => {
    const [a, b] = [...pointers.current.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    if (pointers.current.size >= 2) {
      const before = distance()
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (before > 0) apply(zoom * (distance() / before), offset)
    } else {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      apply(zoom, { x: offset.x + e.clientX - prev.x, y: offset.y + e.clientY - prev.y })
    }
  }

  const done = () => {
    const img = imgRef.current
    if (!img || !size) return
    // Draw exactly what the viewer shows, scaled up to the saved size
    const k = OUTPUT_PX / VIEW
    const p = photoPlacement(size.w, size.h, VIEW, zoom, offset)
    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT_PX
    canvas.height = OUTPUT_PX
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = BACKGROUND
    ctx.fillRect(0, 0, OUTPUT_PX, OUTPUT_PX)
    ctx.drawImage(img, p.left * k, p.top * k, p.width * k, p.height * k)
    canvas.toBlob((blob) => { if (blob) onDone(blob) }, 'image/jpeg', JPEG_QUALITY)
  }

  const shown = size ? photoPlacement(size.w, size.h, VIEW, zoom, offset) : { left: 0, top: 0, width: VIEW, height: VIEW }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4" onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-labelledby="crop-title" className="bg-gray-800 rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h2 id="crop-title" className="text-lg font-bold mb-1">{t('photo.adjustTitle')}</h2>
        <p className="text-xs text-gray-400 mb-3">{t('photo.adjustHelp')}</p>

        <div
          className="relative mx-auto overflow-hidden rounded-lg bg-gray-700 touch-none select-none cursor-grab"
          style={{ width: VIEW, height: VIEW }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }) }}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => pointers.current.delete(e.pointerId)}
          onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
          onWheel={(e) => apply(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), offset)}
        >
          <img
            ref={imgRef}
            src={src}
            alt=""
            crossOrigin={src.startsWith('blob:') ? undefined : 'anonymous'}
            draggable={false}
            onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            onError={() => setFailed(true)}
            className="absolute max-w-none pointer-events-none"
            style={{
              width: shown.width,
              height: shown.height,
              left: shown.left,
              top: shown.top,
              visibility: size ? 'visible' : 'hidden',
            }}
          />
          {/* Round frame: everything outside the circle is dimmed */}
          <div className="absolute inset-0 rounded-full pointer-events-none border-2 border-white/80" style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' }} />
          {failed && <p className="absolute inset-0 flex items-center justify-center text-sm text-red-300 p-6 text-center">{t('photo.loadFailed')}</p>}
        </div>

        <div className="flex items-center gap-3 mt-4">
          <button type="button" onClick={() => apply(zoom - ZOOM_STEP, offset)} aria-label={t('photo.zoomOut')} className="w-9 h-9 rounded-lg bg-gray-700 text-lg font-bold">−</button>
          <input
            type="range" min={size ? minZoom(size.w, size.h) : 1} max={MAX_ZOOM} step={0.01} value={zoom}
            onChange={(e) => apply(Number(e.target.value), offset)}
            aria-label={t('photo.zoom')}
            className="flex-1 accent-blue-500"
          />
          <button type="button" onClick={() => apply(zoom + ZOOM_STEP, offset)} aria-label={t('photo.zoomIn')} className="w-9 h-9 rounded-lg bg-gray-700 text-lg font-bold">+</button>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4">
          <button type="button" onClick={onCancel} className="py-2.5 rounded-lg bg-gray-700 font-semibold text-sm">{t('common.cancel')}</button>
          <button type="button" onClick={() => apply(1, { x: 0, y: 0 })} className="py-2.5 rounded-lg bg-gray-700 font-semibold text-sm">↺ {t('photo.reset')}</button>
          <button type="button" onClick={done} disabled={!size} className="py-2.5 rounded-lg bg-blue-600 font-semibold text-sm disabled:opacity-50">{t('photo.use')}</button>
        </div>
      </div>
    </div>
  )
}
