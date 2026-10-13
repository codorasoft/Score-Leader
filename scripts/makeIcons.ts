// Draws the app's icon, a dark tile with a blocky white "SL" and a green line under it, and
// writes every file the page, the manifest and the notifications use. One definition for all
// sizes, so they cannot drift apart; scripts/makeIcons.test.ts holds the committed files equal
// to what is drawn here.
// Usage: node scripts/makeIcons.ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync, inflateSync } from 'node:zlib'

type Colour = [number, number, number, number]
const TILE: Colour = [0x11, 0x18, 0x27, 255]
const MARK: Colour = [255, 255, 255, 255]
const LINE: Colour = [0x22, 0xc5, 0x5e, 255]
const hex = ([r, g, b]: Colour) => `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`

// The letters on a grid of cells, two empty columns between them
const LETTERS = [
  ['####', '#...', '####', '...#', '####'], // S
  ['#...', '#...', '#...', '#...', '####'], // L
]
const LETTER_WIDTH = 4
const LETTER_GAP = 2
const COLUMNS = LETTERS.length * LETTER_WIDTH + (LETTERS.length - 1) * LETTER_GAP
const ROWS = 5
// One empty row under the letters, then a line half a cell thick
const LINE_TOP = ROWS + 1
const LINE_HEIGHT = 0.5

interface Rect { x: number; y: number; w: number; h: number; colour: Colour }

// The mark in cells, from its own top-left corner
function mark(line: boolean): { rects: Rect[]; height: number } {
  const rects: Rect[] = []
  LETTERS.forEach((rows, letter) => rows.forEach((row, y) => [...row].forEach((dot, x) => {
    if (dot === '#') rects.push({ x: letter * (LETTER_WIDTH + LETTER_GAP) + x, y, w: 1, h: 1, colour: MARK })
  })))
  if (line) rects.push({ x: 0, y: LINE_TOP, w: COLUMNS, h: LINE_HEIGHT, colour: LINE })
  return { rects, height: line ? LINE_TOP + LINE_HEIGHT : ROWS }
}

export interface TileOptions {
  // The side of one cell, as a part of the tile's side
  cell: number
  // false leaves everything but the mark see-through
  background: boolean
  line: boolean
}

// The tile as RGBA pixels, row by row. The mark is centred; edges fall on whole pixels.
export function drawTile(size: number, { cell, background, line }: TileOptions): Uint8Array {
  const pixels = new Uint8Array(size * size * 4)
  if (background) for (let i = 0; i < pixels.length; i += 4) pixels.set(TILE, i)
  const { rects, height } = mark(line)
  const side = cell * size
  const left = (size - COLUMNS * side) / 2
  const top = (size - height * side) / 2
  for (const r of rects) {
    const x1 = Math.round(left + r.x * side), x2 = Math.round(left + (r.x + r.w) * side)
    const y1 = Math.round(top + r.y * side), y2 = Math.round(top + (r.y + r.h) * side)
    for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) pixels.set(r.colour, (y * size + x) * 4)
  }
  return pixels
}

// The same tile for the browser tab, as a drawing that stays sharp at any size
export function faviconSvg(): string {
  const size = 100
  const side = 0.06 * size
  const { rects, height } = mark(true)
  const left = (size - COLUMNS * side) / 2
  const top = (size - height * side) / 2
  const n = (value: number) => String(Math.round(value * 100) / 100)
  const shapes = rects.map((r) =>
    `  <rect x="${n(left + r.x * side)}" y="${n(top + r.y * side)}" width="${n(r.w * side)}" height="${n(r.h * side)}" fill="${hex(r.colour)}"/>`)
  return [
    // crispEdges: the cells of a letter touch, and must not show a hairline between them
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">`,
    `  <rect width="${size}" height="${size}" fill="${hex(TILE)}"/>`,
    ...shapes,
    '</svg>',
    '',
  ].join('\n')
}

// ===== PNG, written by hand: 8 bits a channel, red green blue alpha, rows not filtered

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(data: Buffer): number {
  let c = 0xffffffff
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const out = Buffer.alloc(body.length + 8)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), body.length + 4)
  return out
}

export function encodePng(size: number, rgba: Uint8Array): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.set([8, 6, 0, 0, 0], 8)
  const row = size * 4
  const raw = Buffer.alloc(size * (row + 1))
  // Each row starts with its filter byte: 0, not filtered
  for (let y = 0; y < size; y++) raw.set(rgba.subarray(y * row, (y + 1) * row), y * (row + 1) + 1)
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

// Reads back a PNG written by encodePng; nothing else
export function decodePng(png: Buffer): { size: number; rgba: Uint8Array } {
  if (!png.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG')
  let size = 0
  const data: Buffer[] = []
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at)
    const type = png.toString('ascii', at + 4, at + 8)
    const body = png.subarray(at + 8, at + 8 + length)
    if (type === 'IHDR') {
      size = body.readUInt32BE(0)
      if (body.readUInt32BE(4) !== size || body[8] !== 8 || body[9] !== 6) throw new Error('not a square 8-bit RGBA PNG')
    }
    if (type === 'IDAT') data.push(body)
    at += length + 12
  }
  const raw = inflateSync(Buffer.concat(data))
  const row = size * 4
  const rgba = new Uint8Array(size * row)
  for (let y = 0; y < size; y++) {
    if (raw[y * (row + 1)] !== 0) throw new Error('a filtered row: not written by encodePng')
    rgba.set(raw.subarray(y * (row + 1) + 1, (y + 1) * (row + 1)), y * row)
  }
  return { size, rgba }
}

// ===== The files

export const ICONS: ({ path: string; size: number } & TileOptions)[] = [
  { path: 'public/icons/icon-192.png', size: 192, cell: 0.06, background: true, line: true },
  { path: 'public/icons/icon-512.png', size: 512, cell: 0.06, background: true, line: true },
  { path: 'public/apple-touch-icon.png', size: 180, cell: 0.06, background: true, line: true },
  // A phone may cut this one to a circle: the mark is smaller, inside the part that is always kept
  { path: 'public/icons/icon-maskable-512.png', size: 512, cell: 0.048, background: true, line: true },
  // Android shows this one small and in one colour in the status bar: the mark alone
  { path: 'public/icons/badge-96.png', size: 96, cell: 0.08, background: false, line: false },
]

// Only when run as a program; imported (by the test), it writes nothing
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const write = (path: string, content: Buffer | string) => {
    const file = resolve(root, path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
    console.log(`wrote ${path}`)
  }
  for (const { path, size, ...options } of ICONS) write(path, encodePng(size, drawTile(size, options)))
  write('public/favicon.svg', faviconSvg())
}
