import { type ColorValue, colorToHex, type SourceMeta } from '@dsgraph/core'

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

const plain = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : JSON.stringify(value)

/**
 * Short human-readable form of a canonical value. Never throws: a value that does not have the
 * shape of its type (a source error) is shown as it is.
 */
export function formatValue(type: string | null, value: unknown): string {
  try {
    return formatTyped(type, value)
  } catch {
    return plain(value)
  }
}

function formatTyped(type: string | null, value: unknown): string {
  if (value === null || value === undefined) return '—'
  switch (type) {
    case 'color': {
      if (!isObj(value) || !Array.isArray(value.components)) return plain(value)
      const c = value as unknown as ColorValue
      const hex = colorToHex(c)
      // A translucent sRGB color reads best as CSS writes it: rgb(0 0 0 / 8%).
      if (c.alpha < 1 && c.space === 'srgb') {
        const [r, g, b] = c.components.map((x) => Math.round(Number(x) * 255))
        return `rgb(${r} ${g} ${b} / ${Math.round(c.alpha * 100)}%)`
      }
      const alpha = c.alpha < 1 ? ` ${Math.round(c.alpha * 100)}%` : ''
      return c.space === 'srgb' ? hex : `${hex}${alpha} (${c.space})`
    }
    case 'dimension':
    case 'duration': {
      const d = value as { value: number; unit: string }
      return `${d.value}${d.unit}`
    }
    case 'fontFamily':
      return (value as string[]).join(', ')
    case 'cubicBezier':
      return `cubic-bezier(${(value as number[]).join(', ')})`
    case 'shadow':
      // As CSS writes it: zeros without units, a zero spread left out.
      return (value as Array<Record<string, unknown>>)
        .map((l) => {
          const len = (k: string) => {
            const d = l[k] as { value: number; unit: string } | undefined
            return !d || d.value === 0 ? '0' : `${d.value}${d.unit}`
          }
          const spread = len('spread')
          return [
            l.inset ? 'inset' : '',
            len('offsetX'),
            len('offsetY'),
            len('blur'),
            spread === '0' ? '' : spread,
            formatValue('color', l.color),
          ]
            .filter(Boolean)
            .join(' ')
        })
        .join(', ')
    case 'border': {
      const b = value as Record<string, unknown>
      return `${formatValue('dimension', b.width)} ${typeof b.style === 'string' ? b.style : 'dashed'} ${formatValue('color', b.color)}`
    }
    case 'typography': {
      const t = value as Record<string, unknown>
      return `${formatValue('fontWeight', t.fontWeight)} ${formatValue('dimension', t.fontSize)}/${t.lineHeight ?? '—'} ${formatValue('fontFamily', t.fontFamily)}`
    }
    default:
      return plain(value)
  }
}

/** Value of a changeset side (`{ raw, value }`) with the alias it came from, if any. */
export function formatSide(type: string | null, side: unknown): string {
  if (!isObj(side)) return formatValue(type, side)
  const v = formatValue(type, side.value)
  const raw = typeof side.raw === 'string' && /^\{[^{}]+\}$/.test(side.raw) ? ` ← ${side.raw}` : ''
  return `${v}${raw}`
}

export function formatDelta(delta: Record<string, unknown> | undefined): string {
  if (!delta) return ''
  const parts: string[] = []
  if (typeof delta.deltaEOK === 'number') parts.push(`ΔE ${delta.deltaEOK}`)
  if (typeof delta.deltaAlpha === 'number')
    parts.push(`α ${delta.deltaAlpha > 0 ? '+' : ''}${delta.deltaAlpha}`)
  if (typeof delta.px === 'number') parts.push(`${delta.px > 0 ? '+' : ''}${delta.px}px`)
  if (typeof delta.ms === 'number') parts.push(`${delta.ms > 0 ? '+' : ''}${delta.ms}ms`)
  if (typeof delta.by === 'number') parts.push(`${delta.by > 0 ? '+' : ''}${delta.by}`)
  if (Array.isArray(delta.fields)) parts.push(`changed: ${delta.fields.join(', ')}`)
  for (const [k, one] of [
    ['layers', 'layer'],
    ['stops', 'stop'],
  ] as const) {
    const d = delta[k]
    // A list holds the indices that changed; a string is a count change ("1 → 2").
    if (Array.isArray(d)) parts.push(`${d.length === 1 ? one : k} ${d.map((i) => Number(i) + 1).join(', ')}`)
    else if (d !== undefined) parts.push(`${k}: ${String(d)}`)
  }
  if (delta.unit !== undefined) parts.push(`unit: ${String(delta.unit)}`)
  return parts.join(', ')
}

const SHA = /^[0-9a-f]{40}$/i
/** A branch or tag with its commit, `main (7c970d9)`; a commit once and short. */
const refOf = (ref: string | undefined, commit?: string): string =>
  !ref
    ? (commit?.slice(0, 7) ?? 'HEAD')
    : SHA.test(ref)
      ? ref.slice(0, 7)
      : `${ref}${commit && commit !== ref ? ` (${commit.slice(0, 7)})` : ''}`

export function formatSource(s: SourceMeta): string {
  if (s.kind === 'npm') return `npm:${s.package}@${s.version}`
  if (s.kind === 'github') return `github:${s.repo}${s.path ? `/${s.path}` : ''}@${refOf(s.ref, s.commit)}`
  if (s.path) return s.path
  return s.kind
}

export const formatWhen = (when: Record<string, string> | null | undefined): string =>
  when && Object.keys(when).length > 0
    ? ` (${Object.entries(when)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')})`
    : ''
