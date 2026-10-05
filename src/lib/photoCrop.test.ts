import { cropRect, clampOffset, MAX_ZOOM } from './photoCrop'

const portrait = { w: 1000, h: 1600 }
const VIEW = 280

describe('cropRect', () => {
  it('starts on the centre square of the photo', () => {
    expect(cropRect(portrait.w, portrait.h, VIEW, 1, { x: 0, y: 0 })).toEqual({ sx: 0, sy: 300, size: 1000 })
  })

  it('shows a smaller area when zoomed in', () => {
    expect(cropRect(portrait.w, portrait.h, VIEW, 2, { x: 0, y: 0 })).toEqual({ sx: 250, sy: 550, size: 500 })
  })

  it('moving the photo right reveals more of its left side', () => {
    // At 2x the photo is drawn at 0.56 px per photo pixel, so 70 screen px = 125 photo px
    expect(cropRect(portrait.w, portrait.h, VIEW, 2, { x: 70, y: 0 })).toEqual({ sx: 125, sy: 550, size: 500 })
  })
})

describe('clampOffset', () => {
  it('never lets the photo leave a gap inside the circle', () => {
    // At 1x the portrait photo is exactly as wide as the circle, so it can only move up and down
    expect(clampOffset({ x: 50, y: 200 }, portrait.w, portrait.h, VIEW, 1)).toEqual({ x: 0, y: 84 })
    expect(clampOffset({ x: -500, y: -500 }, portrait.w, portrait.h, VIEW, 2)).toEqual({ x: -140, y: -308 })
  })
})

it('allows zooming in up to 4x', () => {
  expect(MAX_ZOOM).toBe(4)
})
