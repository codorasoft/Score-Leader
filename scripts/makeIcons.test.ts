import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { decodePng, drawTile, encodePng, faviconSvg, ICONS } from './makeIcons.ts'

const root = resolve(__dirname, '..')
const at = (rgba: Uint8Array, size: number, x: number, y: number) => Array.from(rgba.slice((y * size + x) * 4, (y * size + x) * 4 + 4))
const DARK = [0x11, 0x18, 0x27, 255], WHITE = [255, 255, 255, 255], GREEN = [0x22, 0xc5, 0x5e, 255]

it('draws a dark tile with a white SL and a green line under it', () => {
  const size = 100
  const px = drawTile(size, { cell: 0.06, background: true, line: true })
  expect(at(px, size, 2, 2)).toEqual(DARK)
  // The mark is 60 wide and 39 high (5 rows, a gap row, half a row), centred: it starts at 20, 30.5
  expect(at(px, size, 22, 33)).toEqual(WHITE)   // top-left of the S
  expect(at(px, size, 28, 39)).toEqual(DARK)    // the S's first hollow
  expect(at(px, size, 58, 33)).toEqual(WHITE)   // the L's upright
  expect(at(px, size, 70, 33)).toEqual(DARK)    // right of the L's upright
  expect(at(px, size, 50, 68)).toEqual(GREEN)   // the line
})

it('the badge is the white mark alone on nothing', () => {
  const px = drawTile(96, { cell: 0.08, background: false, line: false })
  expect(at(px, 96, 1, 1)).toEqual([0, 0, 0, 0])
  const colours = new Set<string>()
  for (let i = 0; i < px.length; i += 4) colours.add(px.slice(i, i + 4).join(','))
  expect([...colours].sort()).toEqual(['0,0,0,0', '255,255,255,255'])
})

it('the maskable icon keeps the mark inside the circle a phone may cut', () => {
  const size = 512
  const px = drawTile(size, { cell: 0.048, background: true, line: true })
  let outside = 0
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const far = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) > size * 0.4
    if (far && at(px, size, x, y).join() !== DARK.join()) outside++
  }
  expect(outside).toBe(0)
})

it('writes a PNG another program can read, and reads its own back', () => {
  const px = drawTile(64, { cell: 0.06, background: true, line: true })
  const png = encodePng(64, px)
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  expect(png.readUInt32BE(16)).toBe(64)  // width in the header
  expect(png.readUInt32BE(20)).toBe(64)  // height
  expect([png[24], png[25]]).toEqual([8, 6]) // 8 bits, red green blue alpha
  expect(decodePng(png)).toEqual({ size: 64, rgba: px })
})

it.each(ICONS)('the committed $path is what the script draws', ({ path, size, cell, background, line }) => {
  const committed = decodePng(readFileSync(resolve(root, path)))
  expect(committed.size).toBe(size)
  expect(Buffer.from(committed.rgba).equals(Buffer.from(drawTile(size, { cell, background, line })))).toBe(true)
})

it('the committed favicon is what the script draws', () => {
  // Git may check a text file out with Windows line endings
  expect(readFileSync(resolve(root, 'public/favicon.svg'), 'utf8').replace(/\r\n/g, '\n')).toBe(faviconSvg())
  expect(faviconSvg()).toContain('viewBox="0 0 100 100"')
})
