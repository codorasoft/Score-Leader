// Geometry for framing a photo inside the round avatar viewer.
// At zoom 1 the photo just covers the circle; `offset` is how far (in screen px) the photo's centre
// has been dragged from the circle's centre. Players often stand at the side of a photo, so any part
// of it (even an edge) may be moved to the centre, and zooming out can fit the whole photo in the
// frame; whatever the photo doesn't cover is saved as the avatar background colour.

export const MAX_ZOOM = 4

export interface Offset { x: number; y: number }

const scaleFor = (imgW: number, imgH: number, view: number, zoom: number) => (view / Math.min(imgW, imgH)) * zoom

// Smallest zoom: the whole photo fits inside the frame
export const minZoom = (imgW: number, imgH: number) => Math.min(imgW, imgH) / Math.max(imgW, imgH)

// The circle's centre always stays on the photo: it can move by up to half its shown size.
export function clampOffset(offset: Offset, imgW: number, imgH: number, view: number, zoom: number): Offset {
  const scale = scaleFor(imgW, imgH, view, zoom)
  const maxX = (imgW * scale) / 2
  const maxY = (imgH * scale) / 2
  return {
    x: Math.round(Math.min(maxX, Math.max(-maxX, offset.x))),
    y: Math.round(Math.min(maxY, Math.max(-maxY, offset.y))),
  }
}

// Where the photo sits in the viewer (screen px); the saved image uses the same layout, scaled up.
export function photoPlacement(imgW: number, imgH: number, view: number, zoom: number, offset: Offset) {
  const scale = scaleFor(imgW, imgH, view, zoom)
  const width = imgW * scale
  const height = imgH * scale
  return { left: view / 2 + offset.x - width / 2, top: view / 2 + offset.y - height / 2, width, height }
}
