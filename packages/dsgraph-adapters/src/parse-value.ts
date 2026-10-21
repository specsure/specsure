import { canonicalValue, DiagnosticBag } from '@dsgraph/core'
import { cssValueToToken } from './css-values.js'

/**
 * A value as people type it (`#3366ff`, `rgb(51 102 255)`, `12px`, `0.5rem`, `600`, `200ms`) as a
 * DTCG type and canonical value; undefined when it is not a token value. `type` settles ambiguous
 * ones (`600` as a font weight).
 */
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
