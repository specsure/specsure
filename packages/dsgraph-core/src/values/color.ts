import { converter, formatCss, formatHex, parse as parseCss } from 'culori'
import { isPlainObject } from '../path.js'
import { invalid, lenient, type ValueContext } from './context.js'

export interface ColorValue {
  space: ColorSpace
  /** `null` stands for the CSS `none` keyword. */
  components: (number | null)[]
  alpha: number
  hex?: string
}

export const COLOR_SPACES = [
  'srgb',
  'srgb-linear',
  'hsl',
  'hwb',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'display-p3',
  'a98-rgb',
  'prophoto-rgb',
  'rec2020',
  'xyz-d65',
  'xyz-d50',
] as const
export type ColorSpace = (typeof COLOR_SPACES)[number]

/** DTCG color space → culori mode, channel keys and per-channel scale (DTCG value = culori value × scale). */
const MODES: Record<
  ColorSpace,
  { mode: string; keys: [string, string, string]; scale: [number, number, number] }
> = {
  srgb: { mode: 'rgb', keys: ['r', 'g', 'b'], scale: [1, 1, 1] },
  'srgb-linear': { mode: 'lrgb', keys: ['r', 'g', 'b'], scale: [1, 1, 1] },
  hsl: { mode: 'hsl', keys: ['h', 's', 'l'], scale: [1, 100, 100] },
  hwb: { mode: 'hwb', keys: ['h', 'w', 'b'], scale: [1, 100, 100] },
  lab: { mode: 'lab', keys: ['l', 'a', 'b'], scale: [1, 1, 1] },
  lch: { mode: 'lch', keys: ['l', 'c', 'h'], scale: [1, 1, 1] },
  oklab: { mode: 'oklab', keys: ['l', 'a', 'b'], scale: [1, 1, 1] },
  oklch: { mode: 'oklch', keys: ['l', 'c', 'h'], scale: [1, 1, 1] },
  'display-p3': { mode: 'p3', keys: ['r', 'g', 'b'], scale: [1, 1, 1] },
  'a98-rgb': { mode: 'a98', keys: ['r', 'g', 'b'], scale: [1, 1, 1] },
  'prophoto-rgb': { mode: 'prophoto', keys: ['r', 'g', 'b'], scale: [1, 1, 1] },
  rec2020: { mode: 'rec2020', keys: ['r', 'g', 'b'], scale: [1, 1, 1] },
  'xyz-d65': { mode: 'xyz65', keys: ['x', 'y', 'z'], scale: [1, 1, 1] },
  'xyz-d50': { mode: 'xyz50', keys: ['x', 'y', 'z'], scale: [1, 1, 1] },
}
const SPACE_BY_MODE = new Map(Object.entries(MODES).map(([space, m]) => [m.mode, space as ColorSpace]))

// biome-ignore lint/suspicious/noExplicitAny: culori color objects are loosely typed
type CuloriColor = any

export function toCulori(c: ColorValue): CuloriColor {
  const m = MODES[c.space]
  const out: Record<string, unknown> = { mode: m.mode, alpha: c.alpha }
  m.keys.forEach((k, i) => {
    const v = c.components[i]
    if (v !== null && v !== undefined) out[k] = v / m.scale[i]!
  })
  return out
}

export function fromCulori(obj: CuloriColor): ColorValue {
  let space = SPACE_BY_MODE.get(obj.mode)
  let src = obj
  if (!space) {
    space = 'srgb'
    src = converter('rgb')(obj)
  }
  const m = MODES[space]
  const components = m.keys.map((k, i) => (typeof src[k] === 'number' ? src[k] * m.scale[i]! : null))
  const value: ColorValue = { space, components, alpha: typeof src.alpha === 'number' ? src.alpha : 1 }
  if (space === 'srgb') value.hex = formatHex(src)
  return value
}

/** culori's parser, which throws on some non-color input (e.g. `clamp(…)`): undefined instead. */
function parse(css: string): CuloriColor {
  try {
    return parseCss(css)
  } catch {
    return undefined
  }
}

const toOklabConv = converter('oklab')
const toRgbConv = converter('rgb')

export function toOklab(c: ColorValue): [number, number, number] {
  const o = toOklabConv(toCulori(c)) as unknown as { l?: number; a?: number; b?: number }
  return [o.l ?? 0, o.a ?? 0, o.b ?? 0]
}

/** sRGB hex (clamped) for display and hex-mismatch checks. */
export function colorToHex(c: ColorValue): string {
  return formatHex(toRgbConv(toCulori(c))) ?? '#000000'
}

export function isInSrgbGamut(c: ColorValue): boolean {
  const rgb = toRgbConv(toCulori(c)) as unknown as { r: number; g: number; b: number }
  const eps = 1e-4
  return [rgb.r, rgb.g, rgb.b].every((v) => v >= -eps && v <= 1 + eps)
}

/** ΔE in OKLab, scaled ×100 so that ~1 is a just-noticeable difference. */
export function deltaEOK(a: ColorValue, b: ColorValue): number {
  const [l1, a1, b1] = toOklab(a)
  const [l2, a2, b2] = toOklab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2) * 100
}

/** Parses any CSS Color 4 string into a DTCG 2025.10 color object; undefined if not a color. */
export function cssColorToDtcg(css: string): Record<string, unknown> | undefined {
  const parsed = parse(css.trim())
  if (!parsed) return undefined
  return colorToDtcg(fromCulori(parsed))
}

/** A color as a DTCG 2025.10 color object. */
export function colorToDtcg(c: ColorValue): Record<string, unknown> {
  const out: Record<string, unknown> = {
    colorSpace: c.space,
    components: c.components.map((v) => (v === null ? 'none' : v)),
  }
  if (c.alpha !== 1) out.alpha = c.alpha
  if (c.hex) out.hex = c.hex
  return out
}

/** A CSS string or a DTCG color object as a color, without diagnostics; undefined if neither. */
export function looseColor(raw: unknown): ColorValue | undefined {
  if (typeof raw === 'string') {
    const parsed = parse(raw.trim())
    return parsed ? fromCulori(parsed) : undefined
  }
  if (!isPlainObject(raw) || !Array.isArray(raw.components) || raw.components.length !== 3) return undefined
  if (!(COLOR_SPACES as readonly string[]).includes(raw.colorSpace as string)) return undefined
  const components = raw.components.map((c) => (typeof c === 'number' ? c : null))
  const alpha = typeof raw.alpha === 'number' ? raw.alpha : 1
  return { space: raw.colorSpace as ColorSpace, components, alpha }
}

/** CSS text for a color: hex for opaque sRGB, CSS Color 4 otherwise. */
export function colorToCss(c: ColorValue): string {
  if (c.space === 'srgb' && c.alpha === 1) return colorToHex(c)
  return formatCss(toCulori(c)) ?? colorToHex(c)
}

/**
 * A color that references another color and applies its own opacity:
 * `{ "components": "{color.brand}", "alpha": 0.5 }`, as Figma variables export it.
 * Not DTCG 2025.10: an error in strict mode, a flag otherwise.
 */
function composedColor(raw: Record<string, unknown>, ctx: ValueContext): ColorValue | undefined {
  const base = looseColor(raw.components)
  if (!base) return invalid(ctx, 'dtcg/invalid-color', 'components must be an array of 3 values')
  let alpha = raw.alpha ?? 1
  if (typeof alpha === 'string' && /^\s*\d*\.?\d+%\s*$/.test(alpha)) alpha = Number.parseFloat(alpha) / 100
  if (typeof alpha !== 'number' || alpha < 0 || alpha > 1)
    return invalid(ctx, 'dtcg/invalid-color', 'alpha must be a number between 0 and 1')
  if (ctx.strict) {
    ctx.diag.error(
      'dtcg/composed-color',
      'A color with a referenced base and its own alpha is not DTCG 2025.10',
      ctx.loc,
    )
    return undefined
  }
  ctx.flags.add('composed-color')
  const { hex: _hex, ...rest } = base
  return { ...rest, alpha: base.alpha * alpha }
}

export function canonicalColor(raw: unknown, ctx: ValueContext): ColorValue | undefined {
  if (typeof raw === 'string') {
    const parsed = parse(raw)
    if (!parsed) return invalid(ctx, 'dtcg/invalid-color', `"${raw}" is not a valid color`)
    if (!lenient(ctx, 'dtcg/legacy-syntax', `Color "${raw}" is a string; DTCG 2025.10 requires an object`))
      return undefined
    return fromCulori(parsed)
  }
  if (!isPlainObject(raw)) return invalid(ctx, 'dtcg/invalid-color', 'Color value must be an object')
  if (raw.colorSpace === undefined && raw.components !== undefined && !Array.isArray(raw.components))
    return composedColor(raw, ctx)
  const space = raw.colorSpace
  if (typeof space !== 'string' || !(COLOR_SPACES as readonly string[]).includes(space))
    return invalid(ctx, 'dtcg/invalid-color-space', `Unsupported colorSpace "${String(space)}"`)
  const comps = raw.components
  if (!Array.isArray(comps) || comps.length !== 3)
    return invalid(ctx, 'dtcg/invalid-color', 'components must be an array of 3 values')
  const components: (number | null)[] = []
  for (const c of comps) {
    if (c === 'none') components.push(null)
    else if (typeof c === 'number' && Number.isFinite(c)) components.push(c)
    else return invalid(ctx, 'dtcg/invalid-color', 'Each component must be a number or "none"')
  }
  let alpha = 1
  if (raw.alpha !== undefined) {
    if (typeof raw.alpha !== 'number' || raw.alpha < 0 || raw.alpha > 1)
      return invalid(ctx, 'dtcg/invalid-color', 'alpha must be a number between 0 and 1')
    alpha = raw.alpha
  }
  const value: ColorValue = { space: space as ColorSpace, components, alpha }
  if (raw.hex !== undefined) {
    if (typeof raw.hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.hex)) value.hex = raw.hex.toLowerCase()
    else ctx.diag.warn('dtcg/invalid-hex', 'hex fallback must use 6-digit CSS hex notation', ctx.loc)
  }
  return value
}
