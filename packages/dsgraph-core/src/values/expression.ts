import { converter, interpolate } from 'culori'
import { isPlainObject } from '../path.js'
import {
  type ColorValue,
  colorToCss,
  colorToDtcg,
  cssColorToDtcg,
  fromCulori,
  looseColor,
  toCulori,
} from './color.js'

/**
 * Values computed from other values, as token-set and value/type JSON sources write them:
 * arithmetic (`{space.base} * 2`), a color with a new alpha (`rgba({color.ink}, 0.5)`) and color
 * modifiers. Not part of DTCG 2025.10; adapters mark the tokens that use them
 * (`$extensions["dev.dsgraph"].expression`, `.colorModifier`).
 */

export interface Quantity {
  value: number
  /** `''` for a plain number. */
  unit: string
}

const UNITS = new Set(['', 'px', 'rem', 'em', '%', 'ms', 's', 'deg', 'pt', 'vw', 'vh', 'ch', 'ex'])
const round = (n: number) => Math.round(n * 1e6) / 1e6

/** Evaluates `+ - * /` and parentheses over numbers with units; undefined if not arithmetic. */
export function evaluateMath(text: string): Quantity | undefined {
  const src = text.replace(/calc\(/gi, '(')
  const tokens: Array<Quantity | string> = []
  const re = /\s*(?:((?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([a-z%]*)|([-+*/()]))/iy
  let i = 0
  while (i < src.length) {
    if (/^\s*$/.test(src.slice(i))) break
    re.lastIndex = i
    const m = re.exec(src)
    if (!m) return undefined
    i = re.lastIndex
    if (m[3]) tokens.push(m[3])
    else {
      const unit = m[2]!.toLowerCase()
      if (!UNITS.has(unit)) return undefined
      tokens.push({ value: Number(m[1]), unit })
    }
  }
  if (tokens.length === 0) return undefined
  let pos = 0
  const peek = () => tokens[pos]
  const combine = (op: string, a: Quantity, b: Quantity): Quantity | undefined => {
    switch (op) {
      case '+':
      case '-': {
        if (a.unit && b.unit && a.unit !== b.unit) return undefined
        return { value: op === '+' ? a.value + b.value : a.value - b.value, unit: a.unit || b.unit }
      }
      case '*':
        if (a.unit && b.unit) return undefined
        return { value: a.value * b.value, unit: a.unit || b.unit }
      default:
        if (b.value === 0) return undefined
        if (!b.unit) return { value: a.value / b.value, unit: a.unit }
        if (a.unit === b.unit) return { value: a.value / b.value, unit: '' }
        return undefined
    }
  }
  const factor = (): Quantity | undefined => {
    const t = peek()
    if (t === '-' || t === '+') {
      pos++
      const f = factor()
      return f && (t === '-' ? { value: -f.value, unit: f.unit } : f)
    }
    if (t === '(') {
      pos++
      const e = expr()
      if (peek() !== ')') return undefined
      pos++
      return e
    }
    if (typeof t === 'object') {
      pos++
      return t
    }
    return undefined
  }
  const term = (): Quantity | undefined => {
    let a = factor()
    while (a && (peek() === '*' || peek() === '/')) {
      const op = tokens[pos++] as string
      const b = factor()
      a = b && combine(op, a, b)
    }
    return a
  }
  function expr(): Quantity | undefined {
    let a = term()
    while (a && (peek() === '+' || peek() === '-')) {
      const op = tokens[pos++] as string
      const b = term()
      a = b && combine(op, a, b)
    }
    return a
  }
  const result = expr()
  if (!result || pos !== tokens.length || !Number.isFinite(result.value)) return undefined
  return { value: round(result.value), unit: result.unit }
}

/** Text that stands for a resolved value inside an expression; undefined if it has none. */
export function serializeForExpression(v: unknown): string | undefined {
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.every((x) => typeof x === 'string') ? v.join(', ') : undefined
  if (!isPlainObject(v)) return undefined
  if (typeof v.value === 'number' && typeof v.unit === 'string') return `${v.value}${v.unit}`
  const color = looseColor(v)
  return color ? colorToCss(color) : undefined
}

export type ExpressionHint = 'color' | 'dimension' | 'number' | undefined

/** `rgba(<color>, <alpha>)`: a color with a new alpha, as token-set files write it. */
function colorWithAlpha(text: string): Record<string, unknown> | undefined {
  const m = /^rgba?\((.+),\s*(\d*\.?\d+%?)\s*\)$/is.exec(text.trim())
  if (!m) return undefined
  const base = looseColor(m[1]!)
  if (!base || /^[\d.\s,%]+$/.test(m[1]!)) return undefined
  const alpha = m[2]!.endsWith('%') ? Number.parseFloat(m[2]!) / 100 : Number(m[2])
  if (!(alpha >= 0 && alpha <= 1)) return undefined
  const { hex: _hex, ...rest } = base
  return colorToDtcg({ ...rest, alpha })
}

/**
 * Evaluates expression text (references already substituted) into a DTCG value: a color, a
 * dimension `{ value, unit }` or a number. Undefined when the text is neither.
 * A unitless result of a dimension takes `defaultUnit` (token sets: px).
 */
export function evaluateExpression(text: string, hint: ExpressionHint, defaultUnit?: string): unknown {
  if (hint === 'color' || /^(rgba?|hsla?|#)/i.test(text.trim())) {
    const color = colorWithAlpha(text) ?? cssColorToDtcg(text)
    if (color) return color
    if (hint === 'color') return undefined
  }
  const q = evaluateMath(text)
  if (!q) return undefined
  if (hint === 'number' && q.unit === '%') return round(q.value / 100)
  if (q.unit === '') {
    if (hint === 'dimension' && defaultUnit) return { value: q.value, unit: defaultUnit }
    return q.value
  }
  return { value: q.value, unit: q.unit }
}

export interface ColorModifier {
  type: 'lighten' | 'darken' | 'mix' | 'alpha'
  amount: number
  /** `lch`, `hsl`, `srgb` or `p3`; other values fall back to OKLCH lightness. */
  space: string
  /** The color to mix with. */
  with?: ColorValue
}

// biome-ignore lint/suspicious/noExplicitAny: culori color objects are loosely typed
type CuloriColor = any
const conv = (mode: string) => converter(mode as 'rgb') as unknown as (c: CuloriColor) => CuloriColor
const OUT_SPACE: Record<string, string> = { lch: 'lch', hsl: 'hsl', srgb: 'rgb', p3: 'p3' }
const toLch = conv('lch')
const toHsl = conv('hsl')
const toRgb = conv('rgb')
const toP3 = conv('p3')
const toOklch = conv('oklch')
const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/**
 * Applies a token-set color modifier (lighten, darken, mix, alpha, with the formulas the common token
 * build tools use) and
 * returns a DTCG color object in the modifier's space.
 */
export function modifyColor(base: ColorValue, mod: ColorModifier): Record<string, unknown> | undefined {
  const a = mod.amount
  if (!Number.isFinite(a)) return undefined
  const c = toCulori(base)
  let out: CuloriColor
  const up = mod.type === 'lighten'
  switch (mod.type) {
    case 'lighten':
    case 'darken': {
      if (mod.space === 'lch') {
        const x = toLch(c)
        const l = x.l ?? 0
        out = {
          ...x,
          l: up ? Math.min(100, l + (100 - l) * a) : Math.max(0, l - l * a),
          c: Math.max(0, (x.c ?? 0) - a * (x.c ?? 0)),
        }
      } else if (mod.space === 'hsl') {
        const x = toHsl(c)
        const l = x.l ?? 0
        out = { ...x, l: up ? Math.min(1, l + (1 - l) * a) : Math.max(0, l - l * a) }
      } else if (mod.space === 'srgb' || mod.space === 'p3') {
        const x = mod.space === 'p3' ? toP3(c) : toRgb(c)
        const f = (v: number) => (up ? Math.min(1, v + a * (1 - v)) : Math.max(0, v - a * v))
        out = { ...x, r: f(x.r), g: f(x.g), b: f(x.b) }
      } else {
        const x = toOklch(c)
        out = { ...x, l: clamp01((x.l ?? 0) * (up ? 1 + a : 1 - a)) }
      }
      break
    }
    case 'mix': {
      if (!mod.with) return undefined
      const mode = OUT_SPACE[mod.space] ?? 'rgb'
      out = interpolate([c, toCulori(mod.with)], mode as 'rgb')(clamp01(a))
      break
    }
    case 'alpha':
      out = { ...c, alpha: clamp01(a) }
      break
    default:
      return undefined
  }
  const target = OUT_SPACE[mod.space]
  if (target) out = conv(target)(out)
  return colorToDtcg(fromCulori(out))
}
