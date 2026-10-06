import type { Player } from './types'
import type { PlayerCard } from '../utils/playerCard'
import { TIER_STYLE } from '../components/PlayerCardView'
import { DRAW_COLORS, type Shape } from '../utils/boardDrawings'
import { styleMap } from './teamColors'

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

// Full pitch from above with every player where the admin placed them.
export async function drawBoardImage(data: {
  title: string
  subtitle: string
  players: { name: string; photo_url: string | null; x: number; y: number; guest?: boolean }[]
  drawings?: Shape[]
  footer: string
}): Promise<HTMLCanvasElement> {
  const W = 1080
  const PITCH_X = 60
  const PITCH_Y = 170
  const PW = W - PITCH_X * 2
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

  // Arrows and zones go under the players, the same as on screen (sizes in pitch units, u)
  for (const shape of data.drawings ?? []) {
    const color = DRAW_COLORS[shape.color]
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

  const photos = await Promise.all(data.players.map((p) => loadPhoto(p.photo_url)))
  data.players.forEach((p, i) => {
    const cx = PITCH_X + p.x * PW
    const cy = PITCH_Y + p.y * PH
    const r = 46
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = p.guest ? '#4b5563' : '#1f2937'
    ctx.fill()
    if (photos[i]) {
      ctx.save()
      ctx.clip()
      ctx.drawImage(photos[i]!, cx - r, cy - r, r * 2, r * 2)
      ctx.restore()
    } else {
      ctx.fillStyle = '#ffffff'
      ctx.font = `800 44px ${FONT}`
      ctx.fillText(p.name.charAt(0).toUpperCase(), cx, cy + 16)
    }
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.lineWidth = 7
    ctx.strokeStyle = p.guest ? '#d1d5db' : '#ffffff'
    ctx.setLineDash(p.guest ? [14, 9] : [])
    ctx.stroke()
    ctx.setLineDash([])

    fitText(ctx, p.name, 200, 28, 800)
    const labelW = Math.min(210, ctx.measureText(p.name).width + 20)
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    roundRect(ctx, cx - labelW / 2, cy + r + 6, labelW, 40, 10)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.fillText(p.name, cx, cy + r + 35)
  })

  ctx.fillStyle = '#64748b'
  ctx.font = `600 28px ${FONT}`
  ctx.fillText(data.footer, W / 2, H - 30)
  return canvas
}
