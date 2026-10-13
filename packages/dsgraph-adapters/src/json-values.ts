import { cssColorToDtcg, evaluateExpression } from '@dsgraph/core'
import { cssValueToToken, splitTopLevel } from './css-values.js'

/** Which tool wrote the JSON: decides unit defaults and the type vocabulary. */
export type Dialect = 'token-sets' | 'legacy-json'

/** Types of token-set and value/type JSON → DTCG types. Others keep their own name. */
const TYPES: Record<string, string> = {
  color: 'color',
  dimension: 'dimension',
  sizing: 'dimension',
  spacing: 'dimension',
  size: 'dimension',
  borderRadius: 'dimension',
  borderWidth: 'dimension',
  fontSizes: 'dimension',
  fontSize: 'dimension',
  letterSpacing: 'dimension',
  paragraphSpacing: 'dimension',
  paragraphIndent: 'dimension',
  opacity: 'number',
  number: 'number',
  fontFamilies: 'fontFamily',
  fontFamily: 'fontFamily',
  fontWeights: 'fontWeight',
  fontWeight: 'fontWeight',
  lineHeights: 'lineHeight',
  lineHeight: 'lineHeight',
  typography: 'typography',
  boxShadow: 'shadow',
  shadow: 'shadow',
  border: 'border',
  duration: 'duration',
  time: 'duration',
  easing: 'cubicBezier',
  cubicBezier: 'cubicBezier',
  strokeStyle: 'strokeStyle',
  transition: 'transition',
  gradient: 'gradient',
}

/** `border-radius` (kebab-case types) → `borderRadius`. */
const mapKey = (t: string) => t.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase())
const mapType = (t: string) => TYPES[t] ?? TYPES[mapKey(t)] ?? t

/** Types only the token-set format uses; their presence tells it from plain value/type JSON. */
export const SET_FORMAT_TYPES = new Set([
  'sizing',
  'spacing',
  'borderRadius',
  'borderWidth',
  'fontSizes',
  'fontFamilies',
  'fontWeights',
  'lineHeights',
  'letterSpacing',
  'paragraphSpacing',
  'paragraphIndent',
  'boxShadow',
  'composition',
  'textCase',
  'textDecoration',
  'opacity',
])

const FONT_WEIGHTS: Record<string, number> = {
  thin: 100,
  hairline: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  normal: 400,
  regular: 400,
  book: 400,
  medium: 500,
  semibold: 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  black: 900,
  heavy: 900,
  extrablack: 950,
  ultrablack: 950,
}

const WHOLE_REF = /^\{[^{}]+\}$/
const NUM = /^\s*(-?(?:\d+\.?\d*|\.\d+))\s*([a-z%]*)\s*$/i
const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * References as these tools write them, in DTCG syntax: `{a.b.value}` and `{a.b.$value}` drop the
 * suffix, a whole-value `$a.b` (an early notation) becomes `{a.b}`.
 */
export function normalizeRefs(v: unknown): unknown {
  if (typeof v === 'string') {
    const s = v.replace(/\{([^{}]+?)\.\$?value\}/g, '{$1}')
    return /^\$[\w-]+(\.[\w-]+)+$/.test(s) ? `{${s.slice(1)}}` : s
  }
  if (Array.isArray(v)) return v.map(normalizeRefs)
  if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, normalizeRefs(x)]))
  return v
}

/** Conversion state for one token: whether it needs the core to evaluate expressions. */
export interface Conversion {
  dialect: Dialect
  /** Unit for unitless dimensions: px in token sets; `size` category values in value/type JSON are rem. */
  unit: string
  expression: boolean
}

const hasRefInside = (s: string) => s.includes('{') && !WHOLE_REF.test(s.trim())
const isArithmetic = (s: string) => /^[\d\s.+\-*/()a-z%]+$/i.test(s) && /\d\s*[-+*/]\s*[\d(.]/.test(s)

/** A string that stays as text for the core: a reference or an expression with references. */
function deferred(s: string, c: Conversion): string | undefined {
  if (WHOLE_REF.test(s.trim())) return s.trim()
  if (hasRefInside(s)) {
    c.expression = true
    return s
  }
  return undefined
}

function dimension(v: unknown, c: Conversion, percentAs?: 'em'): unknown {
  if (typeof v === 'number') return { value: v, unit: v === 0 ? 'px' : c.unit }
  if (typeof v !== 'string') return v
  const d = deferred(v, c)
  if (d !== undefined) return d
  const m = NUM.exec(v)
  if (m) {
    const n = Number(m[1])
    const unit = m[2]!.toLowerCase()
    if (unit === '%' && percentAs === 'em') return { value: n / 100, unit: 'em' }
    return { value: n, unit: unit || c.unit }
  }
  if (isArithmetic(v) || /^calc\(/i.test(v)) return evaluateExpression(v, 'dimension', c.unit) ?? v
  return v
}

function numberValue(v: unknown, c: Conversion): unknown {
  if (typeof v !== 'string') return v
  const d = deferred(v, c)
  if (d !== undefined) return d
  const m = NUM.exec(v)
  if (m && (m[2] === '' || m[2] === '%')) return m[2] === '%' ? Number(m[1]) / 100 : Number(m[1])
  return evaluateExpression(v, 'number') ?? v
}

function color(v: unknown, c: Conversion): unknown {
  if (typeof v !== 'string') return v
  const d = deferred(v, c)
  if (d !== undefined) return d
  return cssColorToDtcg(v) ?? (evaluateExpression(v, 'color') as Record<string, unknown> | undefined) ?? v
}

function fontFamily(v: unknown): unknown {
  if (typeof v !== 'string' || WHOLE_REF.test(v.trim())) return v
  const list = splitTopLevel(v, ',').map((f) => f.replace(/^["']|["']$/g, ''))
  return list.length === 1 ? list[0] : list
}

/** `Bold`, `Semi Bold Italic`, `700` → a number; unknown names stay as written. */
export function fontWeight(v: unknown): unknown {
  if (typeof v === 'number' || typeof v !== 'string' || WHOLE_REF.test(v.trim())) return v
  if (/^\d+$/.test(v.trim())) return Number(v)
  const key = v
    .toLowerCase()
    .replace(
      /\b(italic|oblique|(semi|extra|ultra)?\s*(condensed|compressed|expanded|extended)|narrow|wide)\b/g,
      '',
    )
    .replace(/[\s_-]/g, '')
  return FONT_WEIGHTS[key === '' ? 'regular' : key] ?? v
}

/** Line height: a percentage or a small unitless number is a multiplier; a larger one is px. */
function lineHeight(v: unknown, c: Conversion): { type: string; value: unknown } | undefined {
  if (typeof v === 'number')
    return v <= 4 ? { type: 'number', value: v } : { type: 'dimension', value: { value: v, unit: c.unit } }
  if (typeof v !== 'string') return { type: 'number', value: v }
  if (WHOLE_REF.test(v.trim())) return { type: '', value: v.trim() }
  // An expression over references is almost always a multiple of a font size: a length.
  const d = deferred(v, c)
  if (d !== undefined) return { type: 'dimension', value: d }
  if (/^auto$/i.test(v.trim())) return undefined
  const m = NUM.exec(v)
  if (!m) return { type: 'number', value: evaluateExpression(v, 'number') ?? v }
  const n = Number(m[1])
  const unit = m[2]!.toLowerCase()
  if (unit === '%') return { type: 'number', value: n / 100 }
  if (unit === '' && n <= 4) return { type: 'number', value: n }
  return { type: 'dimension', value: { value: n, unit: unit || c.unit } }
}

function typography(v: unknown, c: Conversion): unknown {
  if (!isObj(v)) return v
  const out: Record<string, unknown> = { ...v }
  if (v.fontFamily !== undefined) out.fontFamily = fontFamily(v.fontFamily)
  if (v.fontWeight !== undefined) out.fontWeight = fontWeight(v.fontWeight)
  if (v.fontSize !== undefined) out.fontSize = dimension(v.fontSize, c)
  if (v.letterSpacing !== undefined) out.letterSpacing = dimension(v.letterSpacing, c, 'em')
  if (v.lineHeight !== undefined) {
    const lh = lineHeight(v.lineHeight, c)
    if (lh) out.lineHeight = lh.value
    else delete out.lineHeight
  }
  for (const k of ['paragraphSpacing', 'paragraphIndent']) if (v[k] !== undefined) out[k] = dimension(v[k], c)
  return out
}

function shadowLayer(v: unknown, c: Conversion): unknown {
  if (!isObj(v)) return v
  const out: Record<string, unknown> = {
    color: color(v.color, c),
    offsetX: dimension(v.offsetX ?? v.x ?? 0, c),
    offsetY: dimension(v.offsetY ?? v.y ?? 0, c),
    blur: dimension(v.blur ?? 0, c),
    spread: dimension(v.spread ?? 0, c),
  }
  if (v.inset !== undefined) out.inset = v.inset
  else if (v.type === 'innerShadow') out.inset = true
  return out
}

function border(v: unknown, c: Conversion): unknown {
  if (!isObj(v)) return v
  const out: Record<string, unknown> = { ...v }
  if (v.color !== undefined) out.color = color(v.color, c)
  if (v.width !== undefined) out.width = dimension(v.width, c)
  return out
}

function duration(v: unknown): unknown {
  if (typeof v === 'number') return { value: v, unit: 'ms' }
  if (typeof v !== 'string') return v
  const m = NUM.exec(v)
  if (m && (m[2] === '' || m[2] === 'ms' || m[2] === 's')) return { value: Number(m[1]), unit: m[2] || 'ms' }
  return v
}

/** Category/type/item naming: the first path segment says what an untyped token is. */
function inferType(path: string[], v: unknown, c: Conversion): { type: string; value: unknown } {
  const category = path[0]?.toLowerCase()
  if (category === 'color' || category === 'colors') return { type: 'color', value: color(v, c) }
  if (category === 'size' || category === 'sizes')
    return { type: 'dimension', value: dimension(v, { ...c, unit: 'rem' }) }
  if (category === 'time') return { type: 'duration', value: duration(v) }
  if ((typeof v === 'string' && !v.includes('{')) || typeof v === 'number') {
    const t = cssValueToToken(path.join('-'), String(v))
    // `var(--x)` names a CSS property, not a token of this file: kept as text.
    if (t.$type === undefined || t.$type === 'css-expression' || String(v).includes('var('))
      return { type: 'other', value: v }
    return { type: t.$type, value: t.$value }
  }
  return { type: 'other', value: v }
}

/**
 * One token's value in DTCG form, by its (source) type. References and expressions with
 * references stay as text for the core; everything literal becomes a DTCG value.
 */
export function convertValue(
  sourceType: string | undefined,
  raw: unknown,
  path: string[],
  c: Conversion,
): { type?: string; value: unknown; inferred?: boolean } {
  const v = normalizeRefs(raw)
  if (sourceType === 'other' && typeof v === 'string' && WHOLE_REF.test(v.trim())) return { value: v.trim() }
  if (sourceType === 'other' && (typeof v === 'number' || (typeof v === 'string' && !v.includes('{')))) {
    // The catch-all `other` type: the value says what it is.
    const t = inferType(path, v, c)
    return t.type === 'other' ? { type: 'other', value: v } : { ...t, inferred: true }
  }
  if (sourceType === undefined) {
    if (typeof v === 'string' && v.includes('{')) {
      // An untyped alias takes its type from the target.
      deferred(v, c)
      return { value: v }
    }
    return { ...inferType(path, v, c), inferred: true }
  }
  const type = mapType(sourceType)
  // CSS that no DTCG value can hold (`clamp(…)`, `var(--x)`, gradients) is kept as text.
  const css = (value: unknown) =>
    typeof value === 'string' && !value.includes('{') ? { type: 'css-expression', value } : { type, value }
  switch (type) {
    case 'color':
      if (typeof v === 'string' && /gradient\(/i.test(v)) return { type: 'css-expression', value: v }
      return css(color(v, c))
    case 'dimension':
      return css(dimension(v, c, /letterSpacing/.test(mapKey(sourceType)) ? 'em' : undefined))
    case 'number':
      return { type, value: numberValue(v, c) }
    case 'fontFamily':
      return { type, value: fontFamily(v) }
    case 'fontWeight':
      return { type, value: fontWeight(v) }
    case 'lineHeight': {
      // A whole alias takes its type from the target (a dimension or a number).
      const lh = lineHeight(v, c)
      if (!lh) return { type: sourceType, value: v }
      return lh.type ? lh : { value: lh.value }
    }
    case 'typography':
      return { type, value: typography(v, c) }
    case 'shadow':
      return { type, value: Array.isArray(v) ? v.map((l) => shadowLayer(l, c)) : shadowLayer(v, c) }
    case 'border':
      return { type, value: border(v, c) }
    case 'duration':
      return { type, value: duration(v) }
    default:
      if (typeof v === 'string') deferred(v, c)
      return { type, value: v }
  }
}

/** A group's `$type` in DTCG terms; undefined when it depends on each value (line heights). */
export const groupType = (sourceType: string): string | undefined => {
  const t = mapType(sourceType)
  return t === 'lineHeight' ? undefined : t
}
