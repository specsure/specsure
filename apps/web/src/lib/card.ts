import type { ColorValue, Level } from '@dsgraph/core'
import { cssColor } from './view'

export interface CardData {
  title: string
  from: string
  to: string
  level: Level
  /** Shown in this order; zero counts are skipped. */
  counts: Array<[label: string, n: number]>
  colors: Array<{ before: ColorValue; after: ColorValue }>
  /** The diff had no changes at all. */
  empty: boolean
}

export const CARD = { width: 1200, height: 630 }

// Dark tokens of the site (Mockplate family): the card reads well in feeds in both themes.
const C = {
  bg: '#0c0c0e',
  ink: '#ededf0',
  ink2: '#a8a8b0',
  ink3: '#8b8b94',
  hairline: 'rgba(255, 255, 255, 0.09)',
  accent: '#ff6363',
}
const LEVEL_COLOR: Record<Level, string> = {
  major: '#ff6369',
  minor: '#f5a524',
  patch: '#a8a8b0',
  none: '#8b8b94',
}
const LEVEL_LABEL: Record<Level, string> = {
  major: 'MAJOR',
  minor: 'MINOR',
  patch: 'PATCH',
  none: 'NO IMPACT',
}

const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'

function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text
  let s = text
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1)
  return `${s}…`
}

/** Draws the share card: package, versions, suggested bump, counts and changed colors. */
export function drawCard(canvas: HTMLCanvasElement, d: CardData, scale = 1): void {
  const { width: W, height: H } = CARD
  canvas.width = W * scale
  canvas.height = H * scale
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)
  const pad = 72

  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, W, H)
  // Dot grid, as on the app chrome.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'
  for (let gx = 24; gx < W; gx += 24) for (let gy = 24; gy < H; gy += 24) ctx.fillRect(gx, gy, 1.5, 1.5)

  ctx.textBaseline = 'alphabetic'
  // The mark: "before" in ink, "after" in red, shifted.
  ctx.fillStyle = C.ink
  ctx.beginPath()
  ctx.roundRect(pad, pad - 14, 16, 8.4, 4.2)
  ctx.fill()
  ctx.fillStyle = C.accent
  ctx.beginPath()
  ctx.roundRect(pad + 6.4, pad - 4.8, 16, 8.4, 4.2)
  ctx.fill()
  ctx.fillStyle = C.ink3
  ctx.font = `500 24px ${SANS}`
  ctx.fillText('Token Diff', pad + 32, pad + 8)

  // Bump badge, top right.
  const badge = d.empty ? 'NO CHANGES' : LEVEL_LABEL[d.level]
  ctx.font = `700 26px ${SANS}`
  const bw = ctx.measureText(badge).width + 40
  ctx.fillStyle = d.empty ? C.ink3 : LEVEL_COLOR[d.level]
  ctx.beginPath()
  ctx.roundRect(W - pad - bw, pad - 26, bw, 50, 25)
  ctx.fill()
  ctx.fillStyle = C.bg
  ctx.fillText(badge, W - pad - bw + 20, pad + 8)

  ctx.fillStyle = C.ink
  ctx.font = `700 64px ${SANS}`
  ctx.fillText(fit(ctx, d.title, W - pad * 2), pad, pad + 100)

  ctx.font = `500 36px ${MONO}`
  ctx.fillStyle = C.ink2
  ctx.fillText(fit(ctx, `${d.from}  →  ${d.to}`, W - pad * 2), pad, pad + 160)

  // Counts.
  const counts = d.counts.filter(([, n]) => n > 0).slice(0, 5)
  let x = pad
  const cy = pad + 270
  for (const [label, n] of counts) {
    ctx.fillStyle = C.ink
    ctx.font = `700 64px ${SANS}`
    const nw = ctx.measureText(String(n)).width
    ctx.fillText(String(n), x, cy)
    ctx.fillStyle = C.ink3
    ctx.font = `500 24px ${SANS}`
    ctx.fillText(label, x, cy + 36)
    x += Math.max(nw, ctx.measureText(label).width) + 64
  }

  // Changed colors: before on top, after below.
  const colors = d.colors.slice(0, 10)
  if (colors.length) {
    const size = 62
    const gap = 12
    const y = H - pad - size * 2 + 8
    ctx.fillStyle = C.ink3
    ctx.font = `500 20px ${SANS}`
    ctx.fillText('Changed colors, before and after', pad, y - 16)
    colors.forEach((c, i) => {
      const sx = pad + i * (size + gap)
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(sx, y, size, size * 2 - 8, 12)
      ctx.clip()
      ctx.fillStyle = cssColor(c.before)
      ctx.fillRect(sx, y, size, size - 4)
      ctx.fillStyle = cssColor(c.after)
      ctx.fillRect(sx, y + size - 4, size, size - 4)
      ctx.fillStyle = C.bg
      ctx.fillRect(sx, y + size - 5, size, 2)
      ctx.restore()
      ctx.strokeStyle = C.hairline
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(sx + 0.5, y + 0.5, size - 1, size * 2 - 9, 12)
      ctx.stroke()
    })
  }

  ctx.fillStyle = C.ink3
  ctx.font = `500 22px ${SANS}`
  const foot = 'specsure.app · dsgraph'
  ctx.fillText(foot, W - pad - ctx.measureText(foot).width, H - pad + 10)
}

export const canvasBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not render the card'))), 'image/png'),
  )
