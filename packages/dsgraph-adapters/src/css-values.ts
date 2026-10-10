import { cssColorToDtcg } from '@dsgraph/core'

/** Splits at top-level separators, ignoring those inside parentheses and quotes. */
export function splitTopLevel(input: string, sep: ',' | ' '): string[] {
  const out: string[] = []
  let depth = 0
  let quote = ''
  let cur = ''
  for (const ch of input) {
    if (quote) {
      cur += ch
      if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '(') depth++
    else if (ch === ')') depth--
    const isSep = sep === ' ' ? /\s/.test(ch) : ch === sep
    if (isSep && depth === 0) {
      if (cur.trim() !== '') out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  if (cur.trim() !== '') out.push(cur.trim())
  return out
}

/** `var(--name)` or `var(--name, fallback)` spanning the whole value. */
export function parseVar(value: string): { name: string; fallback?: string } | undefined {
  const v = value.trim()
  if (!v.startsWith('var(') || !v.endsWith(')')) return undefined
  let depth = 0
  for (let i = 3; i < v.length; i++) {
    if (v[i] === '(') depth++
    else if (v[i] === ')') {
      depth--
      if (depth === 0 && i !== v.length - 1) return undefined
    }
  }
  const inner = v.slice(4, -1)
  const [name, ...rest] = splitTopLevel(inner, ',')
  if (!name || !/^--[\w\\.-]+$/.test(name.trim())) return undefined
  const result: { name: string; fallback?: string } = { name: name.trim() }
  if (rest.length > 0) result.fallback = rest.join(', ')
  return result
}

/** Token id for a custom property name: drops the leading `--`; dots (only possible escaped) become `_`. */
export const idFromCustomProperty = (prop: string): string => prop.replace(/^--/, '').replace(/\\?\./g, '_')

const LENGTH =
  /^(-?(?:\d+\.?\d*|\.\d+))(px|rem|em|%|vw|vh|vmin|vmax|ch|ex|pt|cqw|cqh|cqi|dvh|svh|lvh|lh|rlh)$/i
const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)$/
const DURATION = /^(-?(?:\d+\.?\d*|\.\d+))(ms|s)$/
const EASINGS: Record<string, number[]> = {
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
  linear: [0, 0, 1, 1],
}
const FONT_WEIGHT_WORDS = new Set([
  'normal',
  'bold',
  'light',
  'medium',
  'thin',
  'black',
  'regular',
  'semi-bold',
  'extra-bold',
])
const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  'ui-rounded',
  'emoji',
  'math',
])
const NON_COLORS = new Set(['inherit', 'initial', 'unset', 'revert', 'currentcolor', 'none'])

const hint = (name: string, words: RegExp) => words.test(name.toLowerCase())
const isDimensionName = (n: string) =>
  hint(
    n,
    /(space|spacing|size|radius|width|height|gap|inset|offset|gutter|padding|margin|indent|blur|spread|border-w)/,
  )

export interface TokenEntry {
  $type?: string
  $value: unknown
}

/** A sub-value inside a composite: a reference, a color or a length. */
function subValue(part: string, expect: 'color' | 'dimension'): unknown {
  const v = parseVar(part)
  if (v) return `{${idFromCustomProperty(v.name)}}`
  if (expect === 'color') return cssColorToDtcg(part)
  const m = LENGTH.exec(part)
  if (m) return { value: Number(m[1]), unit: m[2]!.toLowerCase() }
  if (part === '0') return { value: 0, unit: 'px' }
  return undefined
}

function parseShadow(value: string): unknown[] | undefined {
  const layers: unknown[] = []
  for (const layer of splitTopLevel(value, ',')) {
    const parts = splitTopLevel(layer, ' ')
    let inset = false
    let color: unknown
    const lengths: unknown[] = []
    for (const p of parts) {
      if (p.toLowerCase() === 'inset') inset = true
      else {
        const len = subValue(p, 'dimension')
        if (len !== undefined && (typeof len !== 'string' || lengths.length < 2)) lengths.push(len)
        else {
          const c = subValue(p, 'color')
          if (c === undefined || color !== undefined) return undefined
          color = c
        }
      }
    }
    if (lengths.length < 2 || lengths.length > 4 || color === undefined) return undefined
    const zero = { value: 0, unit: 'px' }
    layers.push({
      color,
      offsetX: lengths[0],
      offsetY: lengths[1],
      blur: lengths[2] ?? zero,
      spread: lengths[3] ?? zero,
      inset,
    })
  }
  return layers.length > 0 ? layers : undefined
}

/**
 * Infers a DTCG type for a custom property value. Whole `var()` becomes an alias (type comes from
 * the target); anything that cannot be represented becomes a `css-expression` that keeps its text.
 */
export function cssValueToToken(prop: string, raw: string): TokenEntry {
  const value = raw.trim()
  const name = prop.replace(/^--/, '')
  const ref = parseVar(value)
  if (ref) return { $value: `{${idFromCustomProperty(ref.name)}}` }
  const lower = value.toLowerCase()

  if (!NON_COLORS.has(lower)) {
    const color = cssColorToDtcg(value)
    if (color && !NUMBER.test(value)) return { $type: 'color', $value: color }
  }
  let m = LENGTH.exec(value)
  if (m) return { $type: 'dimension', $value: { value: Number(m[1]), unit: m[2]!.toLowerCase() } }
  m = DURATION.exec(value)
  if (m) return { $type: 'duration', $value: { value: Number(m[1]), unit: m[2]! } }
  if (NUMBER.test(value)) {
    const n = Number(value)
    if (hint(name, /weight/) && n >= 1 && n <= 1000) return { $type: 'fontWeight', $value: n }
    if (n === 0 && isDimensionName(name)) return { $type: 'dimension', $value: { value: 0, unit: 'px' } }
    return { $type: 'number', $value: n }
  }
  if (hint(name, /weight/) && FONT_WEIGHT_WORDS.has(lower)) return { $type: 'fontWeight', $value: lower }
  const bezier = /^cubic-bezier\(([^)]*)\)$/i.exec(value)
  if (bezier) {
    const nums = bezier[1]!.split(',').map((s) => Number(s.trim()))
    if (nums.length === 4 && nums.every(Number.isFinite)) return { $type: 'cubicBezier', $value: nums }
  }
  if (EASINGS[lower] && hint(name, /(ease|easing|timing|curve|motion)/))
    return { $type: 'cubicBezier', $value: EASINGS[lower] }

  const families = splitTopLevel(value, ',')
  const looksLikeStack =
    families.length > 1 &&
    families.every((f) => /^(["'][^"']+["']|[\w -]+)$/.test(f)) &&
    families.some((f) => GENERIC_FAMILIES.has(f.toLowerCase()) || /^["']/.test(f))
  if (
    looksLikeStack ||
    (hint(name, /(font-family|family|typeface|font-sans|font-serif|font-mono)/) &&
      families.length >= 1 &&
      !value.includes('('))
  ) {
    return { $type: 'fontFamily', $value: families.map((f) => f.replace(/^["']|["']$/g, '')) }
  }
  if (hint(name, /shadow|elevation/) || /\d(px|rem)?\s+-?\d/.test(value)) {
    const shadow = parseShadow(value)
    if (shadow) return { $type: 'shadow', $value: shadow }
  }
  return { $type: 'css-expression', $value: value }
}
