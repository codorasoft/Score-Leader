import type { Player } from './types'
import type { PlayerCard } from '../utils/playerCard'
import { TIER_STYLE } from '../components/PlayerCardView'
import { DRAW_COLORS, type Shape } from '../utils/boardDrawings'
import { styleMap, teamStyle } from './teamColors'

const FONT = '"Segoe UI", system-ui, -apple-system, Roboto, "Noto Sans Arabic", sans-serif'

const toBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))

// Phones: share sheet with the image (pick Messenger). Elsewhere: download the PNG.
export async function shareCanvas(canvas: HTMLCanvasElement, fileName: string, title: string): Promise<'shared' | 'downloaded' | 'failed'> {
  const blob = await toBlob(canvas)
  if (!blob) return 'failed'
  const file = new File([blob], fileName, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
      return 'shared'
    } catch {
      return 'failed'
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'downloaded'
}

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

const fitText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, weight = 800) => {
  let s = size
  do { ctx.font = `${weight} ${s}px ${FONT}`; s -= 2 } while (ctx.measureText(text).width > maxWidth && s > 12)
}

// Photos come from our own storage, which allows cross-origin use; anything else falls back to the initial
const loadPhoto = (url: string | null) => new Promise<HTMLImageElement | null>((resolve) => {
  if (!url) return resolve(null)
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => resolve(img)
  img.onerror = () => resolve(null)
  img.src = url
})

export async function drawPlayerCard(player: Player, card: PlayerCard): Promise<HTMLCanvasElement> {
  const photo = await loadPhoto(player.photo_url)
  const W = 600
  const H = 840
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const style = TIER_STYLE[card.tier]

  ctx.fillStyle = '#111827'
  ctx.fillRect(0, 0, W, H)
  const grad = ctx.createLinearGradient(0, 0, W, H)
  grad.addColorStop(0, style.from)
  grad.addColorStop(1, style.to)
  roundRect(ctx, 30, 30, W - 60, H - 60, 40)
  ctx.fillStyle = grad
  ctx.fill()

  ctx.fillStyle = style.ink
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.font = `900 150px ${FONT}`
  ctx.fillText(String(card.overall), 80, 210)
  ctx.font = `800 48px ${FONT}`
  ctx.fillText(player.position, 86, 270)

  ctx.beginPath()
  ctx.arc(W - 160, 170, 95, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.15)'
  ctx.fill()
  if (photo) {
    ctx.save()
    ctx.clip()
    ctx.drawImage(photo, W - 255, 75, 190, 190)
    ctx.restore()
  }
  ctx.fillStyle = style.ink
  ctx.textAlign = 'center'
  if (!photo) {
    ctx.font = `900 110px ${FONT}`
    ctx.fillText(player.name.charAt(0).toUpperCase(), W - 160, 208)
  }

  fitText(ctx, player.name, W - 140, 56)
  ctx.fillText(player.name, W / 2, 380)
  ctx.fillStyle = 'rgba(0,0,0,0.2)'
  ctx.fillRect(90, 410, W - 180, 4)

  ctx.fillStyle = style.ink
  card.attributes.forEach((a, i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = col === 0 ? 110 : W / 2 + 40
    const y = 500 + row * 90
    ctx.textAlign = 'left'
    ctx.font = `700 40px ${FONT}`
    ctx.fillText(a.key, x, y)
    ctx.textAlign = 'right'
    ctx.font = `900 52px ${FONT}`
    ctx.fillText(String(a.value), x + 200, y)
  })

  ctx.textAlign = 'center'
  ctx.font = `700 28px ${FONT}`
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillText('ScoreLeader', W / 2, H - 70)
  return canvas
}

export interface SessionImageData {
  title: string
  subtitle: string
  rtl: boolean
  sections: { heading: string; lines: { text: string; dot?: string; bold?: boolean }[] }[]
  footer: string
}

const DOT = styleMap('hex')

export function drawSessionImage(data: SessionImageData): HTMLCanvasElement {
  const W = 1080
  const PAD = 80
  const lineH = 58
  const height = 300 + data.sections.reduce((n, s) => n + 90 + s.lines.length * lineH, 0) + 120
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = Math.max(1080, height)
  const ctx = canvas.getContext('2d')!
  ctx.direction = data.rtl ? 'rtl' : 'ltr'
  const startX = data.rtl ? W - PAD : PAD
  const align: CanvasTextAlign = data.rtl ? 'right' : 'left'

  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height)
  bg.addColorStop(0, '#0b1220')
  bg.addColorStop(1, '#1e293b')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, canvas.height)

  ctx.textAlign = align
  ctx.fillStyle = '#ffffff'
  fitText(ctx, data.title, W - PAD * 2, 72, 900)
  ctx.fillText(data.title, startX, 150)
  ctx.font = `500 38px ${FONT}`
  ctx.fillStyle = '#94a3b8'
  ctx.fillText(data.subtitle, startX, 215)

  let y = 320
  for (const section of data.sections) {
    ctx.fillStyle = '#facc15'
    ctx.font = `800 40px ${FONT}`
    ctx.fillText(section.heading, startX, y)
    y += 70
    for (const line of section.lines) {
      let x = startX
      if (line.dot) {
        ctx.beginPath()
        ctx.arc(data.rtl ? x - 12 : x + 12, y - 14, 12, 0, Math.PI * 2)
        ctx.fillStyle = DOT[line.dot] ?? '#9ca3af'
        ctx.fill()
        x = data.rtl ? x - 40 : x + 40
      }
      ctx.fillStyle = '#e5e7eb'
      ctx.font = `${line.bold ? 800 : 500} 38px ${FONT}`
      ctx.fillText(line.text, x, y, W - PAD * 2 - 40)
      y += lineH
    }
    y += 30
  }

  ctx.textAlign = 'center'
  ctx.fillStyle = '#64748b'
  ctx.font = `600 30px ${FONT}`
  ctx.fillText(data.footer, W / 2, canvas.height - 60)
  return canvas
}

// A name as lines no wider than maxWidth, broken at spaces. A word is never split, so a single
// word can still be wider than the line.
export function wrapLines(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = []
  for (const word of text.trim().split(/\s+/)) {
    const last = lines[lines.length - 1]
    if (last !== undefined && measure(`${last} ${word}`) <= maxWidth) lines[lines.length - 1] = `${last} ${word}`
    else lines.push(word)
  }
  return lines
}

// Widest a player's name gets on the board image: five players across leave 192 each
const NAME_WIDTH = 172

// The substitutes of a board image: a column of this width for every eight, right of the pitch
const BENCH_WIDTH = 220
const BENCH_ROWS = 8

// Full pitch from above with every player where the admin placed them, and the substitutes in
// a column beside it. Without substitutes the image is as it always was.
export async function drawBoardImage(data: {
  title: string
  subtitle: string
  players: { name: string; photo_url: string | null; x: number; y: number; guest?: boolean }[]
  // Those beside the pitch, in their order, and the heading over them
  substitutes?: { name: string; photo_url: string | null; guest?: boolean }[]
  substitutesTitle?: string
  drawings?: Shape[]
  footer: string
}): Promise<HTMLCanvasElement> {
  const BOARD_W = 1080
  const substitutes = data.substitutes ?? []
  const W = BOARD_W + Math.ceil(substitutes.length / BENCH_ROWS) * BENCH_WIDTH
  const PITCH_X = 60
  const PITCH_Y = 170
  const PW = BOARD_W - PITCH_X * 2
  const PH = PW * 1.5
  const H = PITCH_Y + PH + 90
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#0b1220'
  ctx.fillRect(0, 0, W, H)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffffff'
  fitText(ctx, data.title, W - 120, 64, 900)
  ctx.fillText(data.title, W / 2, 80)
  ctx.font = `500 34px ${FONT}`
  ctx.fillStyle = '#94a3b8'
  ctx.fillText(data.subtitle, W / 2, 132)

  // Grass stripes and markings, same 100 x 150 proportions as the on-screen pitch
  const u = PW / 100
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = i % 2 ? '#15803d' : '#16a34a'
    ctx.fillRect(PITCH_X, PITCH_Y + i * 15 * u, PW, 15 * u)
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.lineWidth = 0.6 * u
  const rect = (x: number, y: number, w: number, h: number) => ctx.strokeRect(PITCH_X + x * u, PITCH_Y + y * u, w * u, h * u)
  rect(3, 3, 94, 144); rect(25, 3, 50, 20); rect(38, 3, 24, 7); rect(25, 127, 50, 20); rect(38, 140, 24, 7)
  ctx.beginPath()
  ctx.moveTo(PITCH_X + 3 * u, PITCH_Y + 75 * u)
  ctx.lineTo(PITCH_X + 97 * u, PITCH_Y + 75 * u)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(PITCH_X + 50 * u, PITCH_Y + 75 * u, 11 * u, 0, Math.PI * 2)
  ctx.stroke()

  // Arrows, zones and text go under the players, the same as on screen (sizes in pitch units, u)
  for (const shape of data.drawings ?? []) {
    if (shape.kind === 'label') {
      // A team's name in a dark pill, led by its colour dot (on the right for right-to-left text)
      ctx.font = `700 30px ${FONT}`
      const dot = 9, gap = 12, pad = 18
      const w = pad * 2 + dot * 2 + gap + ctx.measureText(shape.text).width
      const cx = PITCH_X + shape.x * PW, cy = PITCH_Y + shape.y * PH
      const side = /[\u0590-\u08FF]/.test(shape.text) ? -1 : 1
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      roundRect(ctx, cx - w / 2, cy - 24, w, 48, 24)
      ctx.fill()
      ctx.fillStyle = teamStyle(shape.team).hex
      ctx.beginPath()
      ctx.arc(cx - side * (w / 2 - pad - dot), cy, dot, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.fillText(shape.text, cx + side * (dot + gap / 2), cy + 10)
      continue
    }
    const color = DRAW_COLORS[shape.color]
    if (shape.kind === 'text') {
      // Free text on a dark plate, centred on its spot, broken into lines that stay on the pitch
      const size = 36, lineH = 44, padX = 18, padY = 10
      ctx.font = `700 ${size}px ${FONT}`
      const lines = wrapLines(shape.text, PW * 0.7 - padX * 2, (s) => ctx.measureText(s).width)
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX * 2
      const h = lines.length * lineH + padY * 2
      const cx = PITCH_X + shape.x * PW, cy = PITCH_Y + shape.y * PH
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 14)
      ctx.fill()
      ctx.fillStyle = color
      lines.forEach((line, n) => ctx.fillText(line, cx, cy - h / 2 + padY + lineH * n + size - 4))
      continue
    }
    if (shape.kind === 'zone') {
      ctx.beginPath()
      ctx.arc(PITCH_X + shape.cx * PW, PITCH_Y + shape.cy * PH, shape.r * PW, 0, Math.PI * 2)
      ctx.globalAlpha = 0.22
      ctx.fillStyle = color
      ctx.fill()
      ctx.globalAlpha = 0.9
      ctx.lineWidth = 0.7 * u
      ctx.strokeStyle = color
      ctx.stroke()
      ctx.globalAlpha = 1
      continue
    }
    const x1 = PITCH_X + shape.x1 * PW, y1 = PITCH_Y + shape.y1 * PH
    const x2 = PITCH_X + shape.x2 * PW, y2 = PITCH_Y + shape.y2 * PH
    const angle = Math.atan2(y2 - y1, x2 - x1)
    const head = 4.5 * u
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = 1.3 * u
    ctx.lineCap = 'round'
    ctx.setLineDash(shape.dashed ? [3 * u, 2.2 * u] : [])
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2 - head * 0.7 * Math.cos(angle), y2 - head * 0.7 * Math.sin(angle))
    ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(x2, y2)
    ctx.lineTo(x2 - head * Math.cos(angle - 0.45), y2 - head * Math.sin(angle - 0.45))
    ctx.lineTo(x2 - head * Math.cos(angle + 0.45), y2 - head * Math.sin(angle + 0.45))
    ctx.closePath()
    ctx.fill()
  }

  // A player's circle (photo or initial) centred on cx, cy, with the name under it. Sizes are
  // those of a player on the pitch (r 46), smaller in step for a smaller circle.
  type Token = { name: string; photo_url: string | null; guest?: boolean }
  const drawToken = (p: Token, photo: HTMLImageElement | null, cx: number, cy: number, r: number) => {
    const k = r / 46
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = p.guest ? '#4b5563' : '#1f2937'
    ctx.fill()
    if (photo) {
      ctx.save()
      ctx.clip()
      ctx.drawImage(photo, cx - r, cy - r, r * 2, r * 2)
      ctx.restore()
    } else {
      ctx.fillStyle = '#ffffff'
      ctx.font = `800 ${Math.round(44 * k)}px ${FONT}`
      ctx.fillText(p.name.charAt(0).toUpperCase(), cx, cy + Math.round(16 * k))
    }
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.lineWidth = Math.round(7 * k)
    ctx.strokeStyle = p.guest ? '#d1d5db' : '#ffffff'
    ctx.setLineDash(p.guest ? [14, 9] : [])
    ctx.stroke()
    ctx.setLineDash([])

    // The whole name, on as many lines as it needs, so neighbours never cover each other's
    // letters; only a single word wider than the line is made smaller
    let size = Math.round(28 * k)
    ctx.font = `800 ${size}px ${FONT}`
    const width = (text: string) => ctx.measureText(text).width
    const lines = wrapLines(p.name, NAME_WIDTH, width)
    let widest = Math.max(...lines.map(width))
    if (widest > NAME_WIDTH) {
      size = Math.max(14, Math.floor(size * NAME_WIDTH / widest))
      ctx.font = `800 ${size}px ${FONT}`
      widest = Math.max(...lines.map(width))
    }
    const lineH = Math.round(size * 1.2)
    const top = cy + r + 6
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    roundRect(ctx, cx - widest / 2 - 10, top, widest + 20, lines.length * lineH + 6, 10)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    lines.forEach((line, n) => ctx.fillText(line, cx, top + lineH * n + size + 1))
  }

  const photos = await Promise.all([...data.players, ...substitutes].map((p) => loadPhoto(p.photo_url)))
  data.players.forEach((p, i) => drawToken(p, photos[i], PITCH_X + p.x * PW, PITCH_Y + p.y * PH, 46))

  // The substitutes, from the top down; the ninth starts a second column
  const benchX = (column: number) => BOARD_W - PITCH_X + 20 + BENCH_WIDTH / 2 + column * BENCH_WIDTH
  if (substitutes.length > 0 && data.substitutesTitle) {
    ctx.fillStyle = '#94a3b8'
    ctx.font = `700 30px ${FONT}`
    ctx.fillText(data.substitutesTitle, benchX(0), PITCH_Y + 40)
  }
  substitutes.forEach((p, i) => {
    drawToken(p, photos[data.players.length + i], benchX(Math.floor(i / BENCH_ROWS)), PITCH_Y + 130 + (i % BENCH_ROWS) * 160, 38)
  })

  ctx.fillStyle = '#64748b'
  ctx.font = `600 28px ${FONT}`
  ctx.fillText(data.footer, W / 2, H - 30)
  return canvas
}

export interface LeaderboardImageData {
  league: string
  title: string
  period: string
  subtitle: string
  stat: string
  rtl: boolean
  rows: { rank: number; name: string; photo_url: string | null; position: string; value: number }[]
  footer: string
}

const MEDAL = [
  { ring: '#facc15', glow: 'rgba(250,204,21,0.35)', ink: '#422006' },
  { ring: '#e2e8f0', glow: 'rgba(226,232,240,0.25)', ink: '#1e293b' },
  { ring: '#fb923c', glow: 'rgba(251,146,60,0.28)', ink: '#431407' },
]
const medalOf = (rank: number) => MEDAL[rank - 1] ?? null

// The leaderboard as a poster: the top three on a podium (first in the middle, raised, with a
// crown), then everyone else as numbered rows. Rows follow the reading direction.
export async function drawLeaderboardImage(data: LeaderboardImageData): Promise<HTMLCanvasElement> {
  const W = 1080
  const PAD = 64
  const podium = data.rows.slice(0, 3)
  const rest = data.rows.slice(3)
  const ROW_H = 92
  const PODIUM_FLOOR = 1150
  const LIST_Y = 1200
  const H = Math.max(1350, LIST_Y + rest.length * (ROW_H + 14) + 150)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.direction = data.rtl ? 'rtl' : 'ltr'
  const photos = await Promise.all(data.rows.map((r) => loadPhoto(r.photo_url)))

  // Night-pitch background: deep navy, faint mowing stripes, a floodlight glow over the podium
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#0b1324')
  bg.addColorStop(1, '#050a14')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  for (let i = 0; i * 120 < H; i++) {
    if (i % 2) continue
    ctx.fillStyle = 'rgba(34,197,94,0.035)'
    ctx.fillRect(0, i * 120, W, 120)
  }
  const glow = ctx.createRadialGradient(W / 2, 640, 40, W / 2, 640, 600)
  glow.addColorStop(0, 'rgba(250,204,21,0.16)')
  glow.addColorStop(1, 'rgba(250,204,21,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, PODIUM_FLOOR + 100)

  // Header
  ctx.textAlign = 'center'
  ctx.fillStyle = '#facc15'
  ctx.font = `800 28px ${FONT}`
  ctx.fillText(data.league.toUpperCase(), W / 2, 92)
  ctx.fillStyle = '#ffffff'
  fitText(ctx, data.title, W - PAD * 2, 76, 900)
  ctx.fillText(data.title, W / 2, 178)

  // Period and stat as two pills side by side
  ctx.font = `700 30px ${FONT}`
  const pills = [
    { text: data.period, fill: 'rgba(255,255,255,0.08)', ink: '#e2e8f0' },
    { text: data.stat, fill: '#facc15', ink: '#1c1917' },
  ]
  const pillW = pills.map((p) => ctx.measureText(p.text).width + 52)
  let px = W / 2 - (pillW[0] + pillW[1] + 16) / 2
  pills.forEach((p, i) => {
    roundRect(ctx, px, 214, pillW[i], 54, 27)
    ctx.fillStyle = p.fill
    ctx.fill()
    ctx.fillStyle = p.ink
    ctx.fillText(p.text, px + pillW[i] / 2, 252)
    px += pillW[i] + 16
  })
  ctx.fillStyle = '#94a3b8'
  ctx.font = `500 28px ${FONT}`
  ctx.fillText(data.subtitle, W / 2, 318)

  const avatar = (row: LeaderboardImageData['rows'][number], photo: HTMLImageElement | null, cx: number, cy: number, r: number, ring: string | null) => {
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = '#1e293b'
    ctx.fill()
    if (photo) {
      ctx.save()
      ctx.clip()
      ctx.drawImage(photo, cx - r, cy - r, r * 2, r * 2)
      ctx.restore()
    } else {
      ctx.fillStyle = '#cbd5e1'
      ctx.font = `800 ${Math.round(r * 0.95)}px ${FONT}`
      ctx.textAlign = 'center'
      ctx.fillText(row.name.charAt(0).toUpperCase(), cx, cy + r * 0.33)
    }
    if (ring) {
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.lineWidth = Math.max(4, r * 0.09)
      ctx.strokeStyle = ring
      ctx.stroke()
    }
  }

  // Podium: 2nd, 1st, 3rd from the left (mirrored for right-to-left)
  const slots = [
    { index: 1, cx: W / 2 - 320, top: 800, r: 92 },
    { index: 0, cx: W / 2, top: 730, r: 118 },
    { index: 2, cx: W / 2 + 320, top: 840, r: 84 },
  ].map((s) => (data.rtl ? { ...s, cx: W - s.cx } : s))
  for (const slot of slots) {
    const row = podium[slot.index]
    if (!row) continue
    const medal = medalOf(row.rank) ?? MEDAL[2]
    const cy = slot.top - slot.r - 70
    // Block under the player, lit from above
    const bw = 270
    const block = ctx.createLinearGradient(0, slot.top, 0, PODIUM_FLOOR)
    block.addColorStop(0, 'rgba(255,255,255,0.12)')
    block.addColorStop(1, 'rgba(255,255,255,0.02)')
    roundRect(ctx, slot.cx - bw / 2, slot.top, bw, PODIUM_FLOOR - slot.top, 22)
    ctx.fillStyle = block
    ctx.fill()

    ctx.beginPath()
    ctx.arc(slot.cx, cy, slot.r + 18, 0, Math.PI * 2)
    ctx.fillStyle = medal.glow
    ctx.fill()
    avatar(row, photos[slot.index], slot.cx, cy, slot.r, medal.ring)
    if (row.rank === 1) {
      // A drawn crown, so it looks the same on every phone
      const base = cy - slot.r - 14, w = 96, h = 56
      ctx.beginPath()
      ctx.moveTo(slot.cx - w / 2, base)
      ctx.lineTo(slot.cx - w / 2, base - h * 0.55)
      ctx.lineTo(slot.cx - w / 4, base - h * 0.25)
      ctx.lineTo(slot.cx, base - h)
      ctx.lineTo(slot.cx + w / 4, base - h * 0.25)
      ctx.lineTo(slot.cx + w / 2, base - h * 0.55)
      ctx.lineTo(slot.cx + w / 2, base)
      ctx.closePath()
      ctx.fillStyle = medal.ring
      ctx.fill()
    }
    // Rank badge on the avatar's lower edge
    ctx.beginPath()
    ctx.arc(slot.cx, cy + slot.r, 26, 0, Math.PI * 2)
    ctx.fillStyle = medal.ring
    ctx.fill()
    ctx.fillStyle = medal.ink
    ctx.font = `900 30px ${FONT}`
    ctx.textAlign = 'center'
    ctx.fillText(String(row.rank), slot.cx, cy + slot.r + 11)

    ctx.fillStyle = '#ffffff'
    const lines = wrapLines(row.name, bw - 30, (s) => { ctx.font = `800 34px ${FONT}`; return ctx.measureText(s).width }).slice(0, 2)
    ctx.font = `800 34px ${FONT}`
    lines.forEach((line, n) => ctx.fillText(line, slot.cx, slot.top + 52 + n * 40))
    const valueY = slot.top + 52 + lines.length * 40 + 56
    ctx.fillStyle = medal.ring
    ctx.font = `900 ${row.rank === 1 ? 72 : 60}px ${FONT}`
    ctx.fillText(String(row.value), slot.cx, valueY)
    ctx.fillStyle = '#94a3b8'
    ctx.font = `600 24px ${FONT}`
    ctx.fillText(data.stat, slot.cx, valueY + 36)
  }

  // Everyone else
  const start = data.rtl ? W - PAD : PAD
  const end = data.rtl ? PAD : W - PAD
  const dir = data.rtl ? -1 : 1
  rest.forEach((row, i) => {
    const y = LIST_Y + i * (ROW_H + 14)
    roundRect(ctx, PAD, y, W - PAD * 2, ROW_H, 20)
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.08)'
    ctx.fill()
    const mid = y + ROW_H / 2
    ctx.fillStyle = '#64748b'
    ctx.font = `900 34px ${FONT}`
    ctx.textAlign = 'center'
    ctx.fillText(String(row.rank), start + dir * 44, mid + 12)
    avatar(row, photos[i + 3], start + dir * 118, mid, 30, null)
    ctx.textAlign = data.rtl ? 'right' : 'left'
    ctx.fillStyle = '#f1f5f9'
    fitText(ctx, row.name, 560, 34, 700)
    ctx.fillText(row.name, start + dir * 168, mid + 3)
    ctx.fillStyle = '#64748b'
    ctx.font = `600 22px ${FONT}`
    ctx.fillText(row.position, start + dir * 168, mid + 32)
    ctx.textAlign = data.rtl ? 'left' : 'right'
    ctx.fillStyle = '#ffffff'
    ctx.font = `900 42px ${FONT}`
    ctx.fillText(String(row.value), end - dir * 32, mid + 15)
  })

  ctx.textAlign = 'center'
  ctx.fillStyle = '#475569'
  ctx.font = `700 28px ${FONT}`
  ctx.fillText(data.footer, W / 2, H - 56)
  return canvas
}
