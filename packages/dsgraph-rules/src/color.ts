import { type ColorValue, toCulori } from '@dsgraph/core'
import { converter } from 'culori'

const toRgb = converter('rgb')
type Rgba = [number, number, number, number]

/** sRGB channels (0–1, clamped) and alpha of a canonical color value. */
export function rgba(c: ColorValue): Rgba {
  const rgb = toRgb(toCulori(c)) as unknown as { r?: number; g?: number; b?: number }
  const clamp = (v: number | undefined) => Math.min(1, Math.max(0, v ?? 0))
  return [clamp(rgb.r), clamp(rgb.g), clamp(rgb.b), c.alpha]
}

/** Composites `top` over an opaque `bottom`. */
function over(top: Rgba, bottom: [number, number, number]): [number, number, number] {
  return [0, 1, 2].map((i) => top[i]! * top[3] + bottom[i]! * (1 - top[3])) as [number, number, number]
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG 2.x contrast ratio of text over a surface; translucent surfaces sit on white. */
export function contrastRatio(text: ColorValue, surface: ColorValue): number {
  const bg = over(rgba(surface), [1, 1, 1])
  const fg = over(rgba(text), bg)
  const [l1, l2] = [luminance(fg), luminance(bg)].sort((a, b) => b - a) as [number, number]
  return (l1 + 0.05) / (l2 + 0.05)
}
