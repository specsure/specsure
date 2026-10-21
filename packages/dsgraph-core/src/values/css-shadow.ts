import { cssColorToDtcg } from './color.js'

/** Splits at a separator outside parentheses: `0 1px rgba(0, 0, 0, .1), 0 2px #000` by commas. */
function split(value: string, sep: RegExp): string[] {
  const out: string[] = []
  let depth = 0
  let part = ''
  for (const ch of value) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (depth === 0 && sep.test(ch)) {
      if (part.trim()) out.push(part.trim())
      part = ''
    } else part += ch
  }
  if (part.trim()) out.push(part.trim())
  return out
}

const LENGTH = /^(-?\d*\.?\d+)(px|rem|em)?$/i

/**
 * A CSS `box-shadow` written as a string (`0 1px 2px rgba(16,16,14,.06), 0 1px 1px #0000000a`) as
 * DTCG shadow layers; `none` is no layer. Undefined when it is not a shadow CSS would draw.
 */
export function cssShadow(value: string): Array<Record<string, unknown>> | undefined {
  if (value.trim().toLowerCase() === 'none') return []
  const layers: Array<Record<string, unknown>> = []
  for (const layer of split(value, /,/)) {
    let inset = false
    let color: Record<string, unknown> | undefined
    const lengths: Array<{ value: number; unit: string }> = []
    for (const p of split(layer, /\s/)) {
      if (p.toLowerCase() === 'inset') {
        inset = true
        continue
      }
      const m = LENGTH.exec(p)
      if (m && lengths.length < 4) {
        lengths.push({ value: Number(m[1]), unit: (m[2] ?? 'px').toLowerCase() })
        continue
      }
      const c = cssColorToDtcg(p)
      if (!c || color) return undefined
      color = c
    }
    if (lengths.length < 2 || !color) return undefined
    const zero = { value: 0, unit: 'px' }
    layers.push({
      color,
      offsetX: lengths[0],
      offsetY: lengths[1],
      blur: lengths[2] ?? zero,
      spread: lengths[3] ?? zero,
      ...(inset ? { inset } : {}),
    })
  }
  return layers.length ? layers : undefined
}
