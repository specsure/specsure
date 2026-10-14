import { cssValueToToken } from '@dsgraph/adapters'
import {
  type ColorValue,
  canonicalize,
  canonicalValue,
  DiagnosticBag,
  type DsGraph,
  deltaEOK,
  type Input,
  type Token,
  toPx,
} from '@dsgraph/core'

/** A value typed by an agent (`#3366ff`, `12px`, `0.5rem`, `600`, `200ms`) as a DTCG type and canonical value. */
export function parseValue(text: string, type?: string): { type: string; value: unknown } | undefined {
  const entry = cssValueToToken(type ? `--${type}` : '--value', text)
  const t = type ?? entry.$type
  if (!t || t === 'css-expression') return undefined
  const ctx = {
    strict: false,
    allowNonstandardUnits: true,
    diag: new DiagnosticBag(),
    flags: new Set<string>(),
  }
  const value = canonicalValue(t, t === entry.$type ? entry.$value : text, ctx)
  return value === undefined ? undefined : { type: t, value }
}

const REM = 16

/** How far two values of a type are apart, in the unit people think in; undefined when not comparable. */
function distance(type: string, a: unknown, b: unknown): number | undefined {
  if (type === 'color') return deltaEOK(a as ColorValue, b as ColorValue)
  if (type === 'dimension') {
    const pa = toPx(a as { value: number; unit: string }, REM)
    const pb = toPx(b as { value: number; unit: string }, REM)
    if (pa !== undefined && pb !== undefined) return Math.abs(pa - pb)
  }
  if (type === 'duration') {
    const ms = (d: { value: number; unit: string }) => (d.unit === 's' ? d.value * 1000 : d.value)
    return Math.abs(ms(a as never) - ms(b as never))
  }
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b)
  return canonicalize(a) === canonicalize(b) ? 0 : undefined
}

/** Types an agent's value can stand for: a bare number may be a font weight. */
const COMPATIBLE: Record<string, string[]> = {
  number: ['number', 'fontWeight'],
  fontWeight: ['fontWeight', 'number'],
}

export interface Match {
  token: Token
  value: unknown
  distance: number
  /** Within the threshold people cannot tell apart (ΔE < 1, < 0.5px). */
  exact: boolean
}

/**
 * Tokens nearest to a value in one context. Deprecated ones go last; among equally close tokens,
 * the ones that reference another token (semantic tokens, which follow themes) come before the
 * primitives that hold the value.
 */
export function nearest(
  graph: DsGraph,
  parsed: { type: string; value: unknown },
  input: Input,
  limit: number,
): Match[] {
  const types = COMPATIBLE[parsed.type] ?? [parsed.type]
  const out: Match[] = []
  const depth = new Map<Match, number>()
  for (const token of graph.tokens({ type: types })) {
    const value = graph.value(token.id, input)
    if (value === undefined || value === null) continue
    const d = distance(token.type === parsed.type ? parsed.type : token.type!, parsed.value, value)
    if (d === undefined) continue
    const exact = parsed.type === 'color' ? d < 1 : parsed.type === 'dimension' ? d < 0.5 : d === 0
    const m: Match = { token, value, distance: Math.round(d * 100) / 100, exact }
    out.push(m)
    depth.set(m, graph.chain(token.id, input).length)
  }
  return out
    .sort(
      (a, b) =>
        Number(a.token.deprecated !== null) - Number(b.token.deprecated !== null) ||
        a.distance - b.distance ||
        depth.get(b)! - depth.get(a)! ||
        a.token.id.localeCompare(b.token.id),
    )
    .slice(0, limit)
}
