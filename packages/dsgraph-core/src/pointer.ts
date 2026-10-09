/** JSON Pointer helpers (RFC 6901). */

export const escapeSegment = (s: string): string => s.replace(/~/g, '~0').replace(/\//g, '~1')
export const unescapeSegment = (s: string): string => s.replace(/~1/g, '/').replace(/~0/g, '~')

export function toPointer(segments: readonly (string | number)[]): string {
  return segments.map((s) => `/${escapeSegment(String(s))}`).join('')
}

/** Parses `#/a/b`, `/a/b` or `#` into segments; returns null for invalid syntax. */
export function parsePointer(pointer: string): string[] | null {
  let p = pointer
  if (p.startsWith('#')) p = p.slice(1)
  if (p === '') return []
  if (!p.startsWith('/')) return null
  return p.slice(1).split('/').map(unescapeSegment)
}

export function getAt(value: unknown, segments: readonly string[]): { found: boolean; value: unknown } {
  let cur: unknown = value
  for (const seg of segments) {
    if (Array.isArray(cur)) {
      if (!/^(0|[1-9]\d*)$/.test(seg)) return { found: false, value: undefined }
      const i = Number(seg)
      if (i >= cur.length) return { found: false, value: undefined }
      cur = cur[i]
    } else if (cur !== null && typeof cur === 'object' && Object.hasOwn(cur, seg)) {
      cur = (cur as Record<string, unknown>)[seg]
    } else {
      return { found: false, value: undefined }
    }
  }
  return { found: true, value: cur }
}
