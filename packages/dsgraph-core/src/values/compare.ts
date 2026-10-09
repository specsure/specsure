import { canonicalize } from '@dsgraph/schema'
import { isPlainObject } from '../path.js'
import { durationMs } from './canonical.js'
import { type ColorValue, deltaEOK } from './color.js'
import { type DimensionValue, toPx } from './dimension.js'

export type CompareResult =
  | { result: 'equal' }
  | { result: 'notation' }
  | { result: 'changed'; delta?: Record<string, unknown> }

export interface CompareOptions {
  remBase: number
  /** ΔE_OK×100 below which two colors are considered equal. */
  equalDeltaE: number
}

export const DEFAULT_COMPARE: CompareOptions = { remBase: 16, equalDeltaE: 0.01 }

const EQUAL: CompareResult = { result: 'equal' }
const NOTATION: CompareResult = { result: 'notation' }
const sameJson = (a: unknown, b: unknown) => canonicalize(a) === canonicalize(b)
const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d

const COMPOSITE_FIELDS: Record<string, Record<string, string>> = {
  border: { color: 'color', width: 'dimension', style: 'strokeStyle' },
  transition: { duration: 'duration', delay: 'duration', timingFunction: 'cubicBezier' },
  typography: {
    fontFamily: 'fontFamily',
    fontSize: 'dimension',
    fontWeight: 'fontWeight',
    letterSpacing: 'dimension',
    lineHeight: 'number',
  },
  shadowLayer: {
    color: 'color',
    offsetX: 'dimension',
    offsetY: 'dimension',
    blur: 'dimension',
    spread: 'dimension',
    inset: 'boolean',
  },
  gradientStop: { color: 'color', position: 'number' },
}

/** Compares two canonical values of the same type. */
export function compareValues(
  type: string | null,
  a: unknown,
  b: unknown,
  opts: CompareOptions = DEFAULT_COMPARE,
): CompareResult {
  if (a === null || a === undefined || b === null || b === undefined)
    return a === b || (a == null && b == null) ? EQUAL : { result: 'changed' }
  switch (type) {
    case 'color':
      return compareColor(a as ColorValue, b as ColorValue, opts)
    case 'dimension':
      return compareDimension(a as DimensionValue, b as DimensionValue, opts)
    case 'duration': {
      const da = a as { value: number; unit: string }
      const db = b as { value: number; unit: string }
      const diff = durationMs(db) - durationMs(da)
      if (Math.abs(diff) > 1e-6) return { result: 'changed', delta: { ms: round(diff) } }
      return sameJson(a, b) ? EQUAL : NOTATION
    }
    case 'number':
    case 'fontWeight': {
      const diff = (b as number) - (a as number)
      return Math.abs(diff) < 1e-6 ? EQUAL : { result: 'changed', delta: { by: round(diff) } }
    }
    case 'fontFamily': {
      const norm = (f: string[]) => f.map((s) => s.replace(/['"]/g, '').trim().toLowerCase())
      if (sameJson(a, b)) return EQUAL
      return sameJson(norm(a as string[]), norm(b as string[])) ? NOTATION : { result: 'changed' }
    }
    case 'border':
    case 'transition':
    case 'typography':
      return compareFields(a, b, COMPOSITE_FIELDS[type]!, opts)
    case 'shadow':
      return compareList(a as unknown[], b as unknown[], COMPOSITE_FIELDS.shadowLayer!, opts, 'layers')
    case 'gradient':
      return compareList(a as unknown[], b as unknown[], COMPOSITE_FIELDS.gradientStop!, opts, 'stops')
    default:
      return sameJson(a, b) ? EQUAL : { result: 'changed' }
  }
}

function compareColor(a: ColorValue, b: ColorValue, opts: CompareOptions): CompareResult {
  const dE = deltaEOK(a, b)
  const dAlpha = b.alpha - a.alpha
  if (dE < opts.equalDeltaE && Math.abs(dAlpha) < 0.001) {
    const sameNotation = a.space === b.space && sameJson(a.components, b.components) && a.alpha === b.alpha
    return sameNotation ? EQUAL : NOTATION
  }
  const delta: Record<string, unknown> = { deltaEOK: round(dE, 2) }
  if (Math.abs(dAlpha) >= 0.001) delta.deltaAlpha = round(dAlpha, 3)
  return { result: 'changed', delta }
}

function compareDimension(a: DimensionValue, b: DimensionValue, opts: CompareOptions): CompareResult {
  const pa = toPx(a, opts.remBase)
  const pb = toPx(b, opts.remBase)
  if (pa === undefined || pb === undefined) {
    if (a.unit !== b.unit) return { result: 'changed', delta: { unit: `${a.unit} → ${b.unit}` } }
    const diff = b.value - a.value
    return Math.abs(diff) < 1e-6 ? EQUAL : { result: 'changed', delta: { [a.unit]: round(diff) } }
  }
  const diff = pb - pa
  if (Math.abs(diff) < 1e-6) return a.unit === b.unit && a.value === b.value ? EQUAL : NOTATION
  const delta: Record<string, unknown> = { px: round(diff) }
  if (pa !== 0) delta.ratio = round(diff / pa)
  return { result: 'changed', delta }
}

function compareFields(
  a: unknown,
  b: unknown,
  fields: Record<string, string>,
  opts: CompareOptions,
): CompareResult {
  if (!isPlainObject(a) || !isPlainObject(b)) return sameJson(a, b) ? EQUAL : { result: 'changed' }
  const changed: string[] = []
  let notation = false
  for (const [field, type] of Object.entries(fields)) {
    const r =
      type === 'boolean'
        ? a[field] === b[field]
          ? EQUAL
          : ({ result: 'changed' } as CompareResult)
        : compareValues(type, a[field], b[field], opts)
    if (r.result === 'changed') changed.push(field)
    else if (r.result === 'notation') notation = true
  }
  if (changed.length > 0) return { result: 'changed', delta: { fields: changed } }
  return notation ? NOTATION : EQUAL
}

function compareList(
  a: unknown[],
  b: unknown[],
  fields: Record<string, string>,
  opts: CompareOptions,
  label: string,
): CompareResult {
  if (a.length !== b.length) return { result: 'changed', delta: { [label]: `${a.length} → ${b.length}` } }
  let notation = false
  const changed: string[] = []
  a.forEach((item, i) => {
    const r = compareFields(item, b[i], fields, opts)
    if (r.result === 'changed') changed.push(`${i}`)
    else if (r.result === 'notation') notation = true
  })
  if (changed.length > 0) return { result: 'changed', delta: { [label]: changed } }
  return notation ? NOTATION : EQUAL
}
