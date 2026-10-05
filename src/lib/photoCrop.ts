// Geometry for framing a photo inside the round avatar viewer.
// At zoom 1 the photo just covers the circle; `offset` is how far (in screen px) the photo's centre
// has been dragged from the circle's centre.

export const MAX_ZOOM = 4

export interface Offset { x: number; y: number }

const scaleFor = (imgW: number, imgH: number, view: number, zoom: number) => (view / Math.min(imgW, imgH)) * zoom

// Keep the photo covering the whole circle: it can move at most by the part that sticks out.
export function clampOffset(offset: Offset, imgW: number, imgH: number, view: number, zoom: number): Offset {
  const scale = scaleFor(imgW, imgH, view, zoom)
  const maxX = Math.max(0, (imgW * scale - view) / 2)
  const maxY = Math.max(0, (imgH * scale - view) / 2)
  return {
    x: Math.round(Math.min(maxX, Math.max(-maxX, offset.x))),
    y: Math.round(Math.min(maxY, Math.max(-maxY, offset.y))),
  }
}

// The square of the original photo that is visible inside the circle.
export function cropRect(imgW: number, imgH: number, view: number, zoom: number, offset: Offset) {
  const scale = scaleFor(imgW, imgH, view, zoom)
  const left = view / 2 + offset.x - (imgW * scale) / 2
  const top = view / 2 + offset.y - (imgH * scale) / 2
  return {
    // + 0 turns -0 into 0
    sx: Math.round(-left / scale) + 0,
    sy: Math.round(-top / scale) + 0,
    size: Math.round(view / scale),
  }
}
