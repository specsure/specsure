import { isPlainObject } from '../path.js'
import { invalid, lenient, type ValueContext } from './context.js'

export interface DimensionValue {
  value: number
  unit: string
}

export const STANDARD_UNITS = new Set(['px', 'rem'])
const LEGACY_DIMENSION = /^\s*(-?(?:\d+\.?\d*|\.\d+))\s*(px|rem|em|%|pt|dp|sp|vw|vh|ch|ex)?\s*$/

export function toPx(d: DimensionValue, remBase: number): number | undefined {
  if (d.unit === 'px') return d.value
  if (d.unit === 'rem') return d.value * remBase
  return undefined
}

export function canonicalDimension(raw: unknown, ctx: ValueContext): DimensionValue | undefined {
  let value: DimensionValue | undefined
  if (isPlainObject(raw)) {
    if (typeof raw.value !== 'number' || !Number.isFinite(raw.value) || typeof raw.unit !== 'string')
      return invalid(ctx, 'dtcg/invalid-dimension', 'Dimension must be { value: number, unit: string }')
    value = { value: raw.value, unit: raw.unit }
  } else if (typeof raw === 'string' || typeof raw === 'number') {
    const m = LEGACY_DIMENSION.exec(String(raw))
    if (!m) return invalid(ctx, 'dtcg/invalid-dimension', `"${String(raw)}" is not a valid dimension`)
    const n = Number(m[1])
    const unit = m[2] ?? (n === 0 ? 'px' : '')
    if (unit === '') return invalid(ctx, 'dtcg/invalid-dimension', `Dimension "${String(raw)}" has no unit`)
    if (!lenient(ctx, 'dtcg/legacy-syntax', `Dimension "${String(raw)}" must be an object { value, unit }`))
      return undefined
    value = { value: n, unit }
  } else {
    return invalid(ctx, 'dtcg/invalid-dimension', 'Dimension must be an object')
  }
  if (!STANDARD_UNITS.has(value.unit)) {
    if (
      !lenient(
        ctx,
        'dtcg/invalid-unit',
        `Unit "${value.unit}" is not allowed; use "px" or "rem"`,
        'nonstandard-unit',
      )
    )
      return undefined
  }
  return value
}
