import { clampOffset, minZoom, photoPlacement, MAX_ZOOM } from './photoCrop'

const portrait = { w: 1000, h: 1600 }
const VIEW = 280
// Screen positions to the nearest 1/1000 px (floating-point leftovers don't matter on screen)
const rounded = (p: Record<string, number>) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Math.round(v * 1000) / 1000 + 0]))

describe('photoPlacement', () => {
  it('starts with the photo filling the circle, centred', () => {
    // 1000 px wide shown at 280 px: 0.28 screen px per photo px, so 1600 tall = 448 px
    expect(rounded(photoPlacement(portrait.w, portrait.h, VIEW, 1, { x: 0, y: 0 }))).toEqual({ left: 0, top: -84, width: 280, height: 448 })
  })

  it('is twice as big at 2x and follows the drag', () => {
    expect(rounded(photoPlacement(portrait.w, portrait.h, VIEW, 2, { x: 70, y: -10 }))).toEqual({ left: -70, top: -318, width: 560, height: 896 })
  })
})

describe('clampOffset', () => {
  it('lets a player standing at the edge of the photo be moved to the centre of the circle', () => {
    // At 1x the photo is exactly as wide as the circle; it can still move sideways by half its width,
    // which puts its left or right edge on the circle's centre
    expect(clampOffset({ x: 500, y: 0 }, portrait.w, portrait.h, VIEW, 1)).toEqual({ x: 140, y: 0 })
    const moved = photoPlacement(portrait.w, portrait.h, VIEW, 1, { x: 140, y: 0 })
    expect(moved.left).toBe(VIEW / 2)
  })

  it('never lets the photo leave the centre of the circle', () => {
    expect(clampOffset({ x: -500, y: -500 }, portrait.w, portrait.h, VIEW, 1)).toEqual({ x: -140, y: -224 })
    expect(clampOffset({ x: 30, y: -40 }, portrait.w, portrait.h, VIEW, 1)).toEqual({ x: 30, y: -40 })
  })
})

describe('minZoom', () => {
  it('lets the whole photo fit inside the frame', () => {
    expect(minZoom(portrait.w, portrait.h)).toBe(0.625)
    expect(photoPlacement(portrait.w, portrait.h, VIEW, minZoom(portrait.w, portrait.h), { x: 0, y: 0 }).height).toBe(VIEW)
  })

  it('is 1 for a square photo', () => {
    expect(minZoom(800, 800)).toBe(1)
  })
})

it('allows zooming in up to 4x', () => {
  expect(MAX_ZOOM).toBe(4)
})
