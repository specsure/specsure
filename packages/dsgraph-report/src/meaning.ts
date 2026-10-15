import { type Change, type ColorValue, toOklab } from '@dsgraph/core'

/**
 * What a change means for people who use the tokens, as reports group it: what breaks, what looks
 * different, what is new, what is deprecated, and what nobody will notice. Reports in every format
 * (Markdown, text, the site) group by this, not by semver level.
 */
export type ChangeGroup = 'breaks' | 'looks' | 'added' | 'deprecated' | 'other' | 'quiet'

export const GROUPS: readonly ChangeGroup[] = ['breaks', 'looks', 'added', 'deprecated', 'other', 'quiet']

export function groupOf(c: Change): ChangeGroup {
  if (c.level === 'major') return 'breaks'
  if (c.level === 'patch' || c.level === 'none') return 'quiet'
  switch (c.kind) {
    case 'token.added':
      return 'added'
    case 'token.deprecated':
      return 'deprecated'
    case 'token.value-changed':
    case 'token.alias-retargeted':
      return 'looks'
    default:
      return 'other'
  }
}

const isColor = (v: unknown): v is ColorValue =>
  typeof v === 'object' && v !== null && Array.isArray((v as ColorValue).components) && 'space' in v

/** The value inside a changeset side (`{ raw, value }`), or the side itself. */
export const valueOfSide = (side: unknown): unknown =>
  typeof side === 'object' && side !== null && 'value' in side ? (side as { value: unknown }).value : side

/** Which way a color moved: the largest part of the difference, lightness, saturation or hue. */
export type ColorDirection = 'lighter' | 'darker' | 'more-saturated' | 'less-saturated' | 'hue' | 'alpha'

export function colorDirection(before: unknown, after: unknown): ColorDirection | undefined {
  const a = valueOfSide(before)
  const b = valueOfSide(after)
  if (!isColor(a) || !isColor(b)) return undefined
  const [l1, a1, b1] = toOklab(a)
  const [l2, a2, b2] = toOklab(b)
  const dL = l2 - l1
  const dC = Math.hypot(a2, b2) - Math.hypot(a1, b1)
  // Hue difference: what is left of the change in the a-b plane once chroma is accounted for.
  const dH = Math.sqrt(Math.max(0, (a2 - a1) ** 2 + (b2 - b1) ** 2 - dC ** 2))
  const dA = (b.alpha ?? 1) - (a.alpha ?? 1)
  const largest = Math.max(Math.abs(dL), Math.abs(dC), dH)
  if (Math.abs(dA) >= 0.01 && largest < 0.01) return 'alpha'
  if (largest === Math.abs(dL)) return dL > 0 ? 'lighter' : 'darker'
  if (largest === Math.abs(dC)) return dC > 0 ? 'more-saturated' : 'less-saturated'
  return 'hue'
}

/** How visible a color difference is (ΔE in OKLab ×100), from invisible to very different. */
export type ColorSize = 'invisible' | 'barely' | 'noticeable' | 'clear' | 'different'

export function colorSize(deltaE: number): ColorSize {
  if (deltaE < 1) return 'invisible'
  if (deltaE < 2) return 'barely'
  if (deltaE < 5) return 'noticeable'
  if (deltaE < 10) return 'clear'
  return 'different'
}
