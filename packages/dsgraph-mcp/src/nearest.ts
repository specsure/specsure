import { cssValueToToken } from '@dsgraph/adapters'
import { canonicalValue, DiagnosticBag, type NearestToken, nearestTokens } from '@dsgraph/core'

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

/** Tokens nearest to a value in one context; see `nearestTokens` in `@dsgraph/core`. */
export const nearest = nearestTokens
export type Match = NearestToken
