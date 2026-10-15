import { isPlainObject } from '../path.js'
import { canonicalColor } from './color.js'
import { invalid, lenient, type ValueContext } from './context.js'
import { canonicalDimension, type DimensionValue } from './dimension.js'

export const STANDARD_TYPES = new Set([
  'color',
  'dimension',
  'fontFamily',
  'fontWeight',
  'duration',
  'cubicBezier',
  'number',
  'strokeStyle',
  'border',
  'transition',
  'shadow',
  'gradient',
  'typography',
])

/** dsgraph-internal types that are not DTCG types but are expected from some sources (no diagnostic). */
export const INTERNAL_TYPES = new Set(['css-expression'])

const FONT_WEIGHTS: Record<string, number> = {
  thin: 100,
  hairline: 100,
  'extra-light': 200,
  'ultra-light': 200,
  light: 300,
  normal: 400,
  regular: 400,
  book: 400,
  medium: 500,
  'semi-bold': 600,
  'demi-bold': 600,
  bold: 700,
  'extra-bold': 800,
  'ultra-bold': 800,
  black: 900,
  heavy: 900,
  'extra-black': 950,
  'ultra-black': 950,
}
const LOOSE_FONT_WEIGHTS = new Map(Object.entries(FONT_WEIGHTS).map(([k, v]) => [k.replace(/-/g, ''), v]))

const STROKE_STYLES = new Set(['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'outset', 'inset'])
const LINE_CAPS = new Set(['round', 'butt', 'square'])

/**
 * Validates a fully resolved value (no references left) against its type and returns
 * the canonical form, or undefined if invalid. Non-standard input is accepted only when not strict.
 */
export function canonicalValue(type: string, raw: unknown, ctx: ValueContext): unknown {
  switch (type) {
    case 'color':
      return canonicalColor(raw, ctx)
    case 'dimension':
      return canonicalDimension(raw, ctx)
    case 'fontFamily':
      return fontFamily(raw, ctx)
    case 'fontWeight':
      return fontWeight(raw, ctx)
    case 'duration':
      return duration(raw, ctx)
    case 'cubicBezier':
      return cubicBezier(raw, ctx)
    case 'number':
      return numberValue(raw, ctx)
    case 'strokeStyle':
      return strokeStyle(raw, ctx)
    case 'border':
      return composite(raw, ctx, 'border', { color: 'color', width: 'dimension', style: 'strokeStyle' })
    case 'transition':
      return composite(raw, ctx, 'transition', {
        duration: 'duration',
        delay: 'duration',
        timingFunction: 'cubicBezier',
      })
    case 'shadow':
      return shadow(raw, ctx)
    case 'gradient':
      return gradient(raw, ctx)
    case 'typography':
      return typography(raw, ctx)
    case 'css-expression':
      return typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : raw
    default:
      return raw
  }
}

function fontFamily(raw: unknown, ctx: ValueContext): string[] | undefined {
  if (typeof raw === 'string') return [raw]
  if (Array.isArray(raw) && raw.length > 0 && raw.every((f) => typeof f === 'string')) return raw as string[]
  return invalid(ctx, 'dtcg/invalid-font-family', 'fontFamily must be a string or an array of strings')
}

function fontWeight(raw: unknown, ctx: ValueContext): number | undefined {
  if (typeof raw === 'number') {
    if (raw >= 1 && raw <= 1000) return raw
    return invalid(ctx, 'dtcg/invalid-font-weight', `fontWeight ${raw} is outside [1, 1000]`)
  }
  if (typeof raw === 'string') {
    const exact = FONT_WEIGHTS[raw]
    if (exact !== undefined) return exact
    const loose = LOOSE_FONT_WEIGHTS.get(raw.toLowerCase().replace(/[\s_-]/g, ''))
    if (loose !== undefined) {
      if (!lenient(ctx, 'dtcg/invalid-font-weight', `fontWeight "${raw}" must be lowercase and hyphenated`))
        return undefined
      return loose
    }
    if (/^\d+$/.test(raw)) {
      if (!lenient(ctx, 'dtcg/legacy-syntax', `fontWeight "${raw}" must be a number`)) return undefined
      return fontWeight(Number(raw), ctx)
    }
  }
  return invalid(ctx, 'dtcg/invalid-font-weight', `"${String(raw)}" is not a valid fontWeight`)
}

function duration(raw: unknown, ctx: ValueContext): { value: number; unit: string } | undefined {
  if (isPlainObject(raw) && typeof raw.value === 'number' && (raw.unit === 'ms' || raw.unit === 's'))
    return { value: raw.value, unit: raw.unit }
  if (typeof raw === 'string') {
    const m = /^\s*(-?\d*\.?\d+)\s*(ms|s)\s*$/.exec(raw)
    if (m && lenient(ctx, 'dtcg/legacy-syntax', `Duration "${raw}" must be an object { value, unit }`))
      return { value: Number(m[1]), unit: m[2]! }
  }
  return invalid(ctx, 'dtcg/invalid-duration', 'Duration must be { value: number, unit: "ms" | "s" }')
}

export const durationMs = (d: { value: number; unit: string }): number =>
  d.unit === 's' ? d.value * 1000 : d.value

function cubicBezier(raw: unknown, ctx: ValueContext): number[] | undefined {
  let arr = raw
  if (typeof raw === 'string') {
    const m = /^\s*cubic-bezier\(([^)]*)\)\s*$/.exec(raw)
    if (m && lenient(ctx, 'dtcg/legacy-syntax', `cubicBezier "${raw}" must be an array of 4 numbers`))
      arr = m[1]!.split(',').map((s) => Number(s.trim()))
  }
  if (
    !Array.isArray(arr) ||
    arr.length !== 4 ||
    !arr.every((n) => typeof n === 'number' && Number.isFinite(n))
  )
    return invalid(ctx, 'dtcg/invalid-cubic-bezier', 'cubicBezier must be an array of 4 numbers')
  const [x1, , x2] = arr as number[]
  if (x1! < 0 || x1! > 1 || x2! < 0 || x2! > 1)
    return invalid(ctx, 'dtcg/invalid-cubic-bezier', 'cubicBezier x coordinates must be within [0, 1]')
  return arr as number[]
}

function numberValue(raw: unknown, ctx: ValueContext): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) {
    if (lenient(ctx, 'dtcg/legacy-syntax', `Number "${raw}" must be a JSON number`)) return Number(raw)
    return undefined
  }
  return invalid(ctx, 'dtcg/invalid-number', 'Value must be a JSON number')
}

function strokeStyle(raw: unknown, ctx: ValueContext): unknown {
  if (typeof raw === 'string') {
    if (STROKE_STYLES.has(raw)) return raw
    return invalid(ctx, 'dtcg/invalid-stroke-style', `"${raw}" is not a valid strokeStyle`)
  }
  if (isPlainObject(raw) && Array.isArray(raw.dashArray) && typeof raw.lineCap === 'string') {
    if (!LINE_CAPS.has(raw.lineCap))
      return invalid(
        ctx,
        'dtcg/invalid-stroke-style',
        `lineCap "${raw.lineCap}" must be round, butt or square`,
      )
    const dashArray: DimensionValue[] = []
    for (const d of raw.dashArray) {
      const v = canonicalDimension(d, ctx)
      if (v === undefined) return undefined
      dashArray.push(v)
    }
    return { dashArray, lineCap: raw.lineCap }
  }
  return invalid(ctx, 'dtcg/invalid-stroke-style', 'strokeStyle must be a keyword or { dashArray, lineCap }')
}

function composite(
  raw: unknown,
  ctx: ValueContext,
  name: string,
  fields: Record<string, string>,
): Record<string, unknown> | undefined {
  if (!isPlainObject(raw)) return invalid(ctx, `dtcg/invalid-${name}`, `${name} value must be an object`)
  const out: Record<string, unknown> = {}
  for (const [field, type] of Object.entries(fields)) {
    if (raw[field] === undefined) return invalid(ctx, `dtcg/invalid-${name}`, `${name} is missing "${field}"`)
    const v = canonicalValue(type, raw[field], ctx)
    if (v === undefined) return undefined
    out[field] = v
  }
  for (const key of Object.keys(raw))
    if (!(key in fields)) ctx.diag.warn(`dtcg/invalid-${name}`, `Unknown ${name} property "${key}"`, ctx.loc)
  return out
}

function shadow(raw: unknown, ctx: ValueContext): unknown[] | undefined {
  // A reference to another shadow token inside the array resolves to that token's value,
  // which may itself be an array of layers; it is inlined as layers.
  const layers = Array.isArray(raw) ? raw.flat() : [raw]
  const out: unknown[] = []
  for (const layer of layers) {
    if (!isPlainObject(layer)) return invalid(ctx, 'dtcg/invalid-shadow', 'Each shadow must be an object')
    const { inset, alpha, ...rest } = layer
    // A missing spread is common in the wild (build tool examples) and means 0.
    if (rest.spread === undefined && rest.blur !== undefined) {
      if (!lenient(ctx, 'dtcg/shadow-missing-spread', 'shadow is missing "spread"; read as 0'))
        return undefined
      rest.spread = { value: 0, unit: 'px' }
    }
    const v = composite(rest, ctx, 'shadow', {
      color: 'color',
      offsetX: 'dimension',
      offsetY: 'dimension',
      blur: 'dimension',
      spread: 'dimension',
    })
    if (v === undefined) return undefined
    if (inset !== undefined && typeof inset !== 'boolean')
      return invalid(ctx, 'dtcg/invalid-shadow', 'inset must be a boolean')
    // Some exports give a layer its opacity next to a shared color: `{ color: "{gray.12}", alpha: 0.04 }`.
    if (alpha !== undefined) {
      if (typeof alpha !== 'number' || alpha < 0 || alpha > 1)
        return invalid(ctx, 'dtcg/invalid-shadow', 'alpha must be a number from 0 to 1')
      if (!lenient(ctx, 'dtcg/legacy-syntax', 'shadow "alpha" is not DTCG; read as the color\'s alpha'))
        return undefined
      const color = (v as { color?: unknown }).color
      if (isPlainObject(color)) (v as { color: unknown }).color = { ...color, alpha }
    }
    out.push({ ...v, inset: inset === true })
  }
  return out
}

function gradient(raw: unknown, ctx: ValueContext): unknown[] | undefined {
  if (!Array.isArray(raw)) return invalid(ctx, 'dtcg/invalid-gradient', 'gradient must be an array of stops')
  const out: unknown[] = []
  // References to other gradient tokens resolve to arrays of stops; they are inlined as stops.
  for (const stop of raw.flat()) {
    if (!isPlainObject(stop))
      return invalid(ctx, 'dtcg/invalid-gradient', 'Each gradient stop must be an object')
    const color = canonicalValue('color', stop.color, ctx)
    const position = canonicalValue('number', stop.position, ctx)
    if (color === undefined || position === undefined) return undefined
    out.push({ color, position: Math.min(1, Math.max(0, position as number)) })
  }
  return out
}

function typography(raw: unknown, ctx: ValueContext): Record<string, unknown> | undefined {
  if (!isPlainObject(raw))
    return invalid(ctx, 'dtcg/invalid-typography', 'typography value must be an object')
  const out: Record<string, unknown> = {}
  const fields: Record<string, string> = {
    fontFamily: 'fontFamily',
    fontSize: 'dimension',
    fontWeight: 'fontWeight',
    letterSpacing: 'dimension',
  }
  for (const [field, type] of Object.entries(fields)) {
    if (raw[field] === undefined) {
      if (!lenient(ctx, 'dtcg/typography-missing-field', `typography is missing "${field}"`)) return undefined
      continue
    }
    const v = canonicalValue(type, raw[field], ctx)
    if (v === undefined) return undefined
    out[field] = v
  }
  const lh = raw.lineHeight
  if (lh === undefined) {
    if (!lenient(ctx, 'dtcg/typography-missing-field', 'typography is missing "lineHeight"')) return undefined
  } else if (typeof lh === 'number') {
    out.lineHeight = lh
  } else {
    const ratio = legacyLineHeight(lh, out.fontSize as DimensionValue | undefined)
    if (ratio === undefined)
      return invalid(ctx, 'dtcg/invalid-typography', 'lineHeight must be a number (multiplier of fontSize)')
    if (!lenient(ctx, 'dtcg/legacy-syntax', 'lineHeight must be a unitless multiplier of fontSize'))
      return undefined
    out.lineHeight = ratio
  }
  return out
}

function legacyLineHeight(lh: unknown, fontSize: DimensionValue | undefined): number | undefined {
  let value: number | undefined
  let unit: string | undefined
  if (isPlainObject(lh) && typeof lh.value === 'number' && typeof lh.unit === 'string') {
    value = lh.value
    unit = lh.unit
  } else if (typeof lh === 'string') {
    const m = /^\s*(\d*\.?\d+)\s*(px|rem|%)?\s*$/.exec(lh)
    if (m) {
      value = Number(m[1])
      unit = m[2]
    }
  }
  if (value === undefined) return undefined
  if (unit === undefined) return value
  if (unit === '%') return value / 100
  if (fontSize && fontSize.unit === unit && fontSize.value !== 0) return value / fontSize.value
  return undefined
}
