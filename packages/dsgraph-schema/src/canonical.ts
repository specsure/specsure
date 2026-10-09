/**
 * Canonical JSON (RFC 8785 style): object keys sorted by UTF-16 code units,
 * no insignificant whitespace, numbers rounded to 6 decimal places first.
 */

const PRECISION = 1e6

/** Rounds a number to 6 decimal places; normalizes -0 to 0. */
export function roundNumber(n: number): number {
  if (!Number.isFinite(n)) return n
  const r = Math.round(n * PRECISION) / PRECISION
  return Object.is(r, -0) ? 0 : r
}

/** Returns a deep copy where every number is rounded and object keys are sorted. */
export function normalize(value: unknown): unknown {
  if (typeof value === 'number') return roundNumber(value)
  if (Array.isArray(value)) return value.map(normalize)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key]
      if (v !== undefined) out[key] = normalize(v)
    }
    return out
  }
  return value
}

export function canonicalize(value: unknown): string {
  return JSON.stringify(normalize(value))
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Hash of a snapshot or changeset: sha256 of canonical JSON without `hash` and `meta`. */
export async function contentHash(doc: Record<string, unknown>): Promise<string> {
  const { hash: _hash, meta: _meta, ...rest } = doc
  return `sha256:${await sha256Hex(canonicalize(rest))}`
}
