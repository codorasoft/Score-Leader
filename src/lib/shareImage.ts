import type { Player } from './types'
import type { PlayerCard } from '../utils/playerCard'
import { TIER_STYLE } from '../components/PlayerCardView'

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

export function drawPlayerCard(player: Player, card: PlayerCard): HTMLCanvasElement {
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

  // Initial in a circle (photos from other sites can't be drawn into a shareable image)
  ctx.beginPath()
  ctx.arc(W - 160, 170, 95, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.15)'
  ctx.fill()
  ctx.fillStyle = style.ink
  ctx.textAlign = 'center'
  ctx.font = `900 110px ${FONT}`
  ctx.fillText(player.name.charAt(0).toUpperCase(), W - 160, 208)

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

const DOT: Record<string, string> = { green: '#22c55e', blue: '#3b82f6', yellow: '#facc15' }

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
