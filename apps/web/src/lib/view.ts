import { type Change, type Changeset, type ColorValue, colorToHex, type Level } from '@dsgraph/core'
import { type ChangeGroup, GROUPS, groupOf } from '@dsgraph/report'

export { type ChangeGroup, GROUPS, groupOf }

export const LEVELS: Level[] = ['major', 'minor', 'patch', 'none']

/** Modifiers and their contexts as compared in the changeset (`theme: light | dark`). */
export function contextAxes(cs: Changeset): Array<{ name: string; values: string[] }> {
  const axes = new Map<string, Set<string>>()
  for (const when of cs.contexts.compared)
    for (const [k, v] of Object.entries(when)) axes.set(k, (axes.get(k) ?? new Set()).add(v))
  return [...axes].filter(([, v]) => v.size > 1).map(([name, values]) => ({ name, values: [...values] }))
}

/** A change applies to the selected contexts unless it is pinned to a different one. */
export const inContext = (when: Change['when'], selected: Record<string, string>): boolean =>
  !when || Object.entries(selected).every(([k, v]) => when[k] === undefined || when[k] === v)

export interface Filter {
  context: Record<string, string>
  levels: Level[]
  /** What the changes mean (breaks, looks different, new…); empty or left out = all. */
  groups?: ChangeGroup[]
  /** Token types to show; empty = all. */
  types: string[]
  query: string
}

export const typeOfChange = (c: Change, types: Map<string, string | null>): string | null => {
  const t = types.get(c.target)
  if (t !== undefined) return t
  const side = (c.after ?? c.before) as { type?: string | null } | undefined
  return side && typeof side === 'object' && 'type' in side ? (side.type ?? null) : null
}

export interface View {
  /** Direct changes (and propagated ones without a cause), filtered. */
  shown: Change[]
  /** Propagated changes by the id of the change that caused them, filtered by context. */
  propagatedBy: Map<string, Change[]>
  byLevel: Record<Level, Change[]>
  /** The same changes by what they mean for people who use the tokens, as the list shows them. */
  byGroup: Record<ChangeGroup, Change[]>
  /** Types present in the changeset, for the type filter. */
  types: string[]
}

export function view(cs: Changeset, types: Map<string, string | null>, f: Filter): View {
  const propagatedBy = new Map<string, Change[]>()
  for (const c of cs.changes)
    if (inContext(c.when, f.context))
      for (const cause of c.cause) propagatedBy.set(cause, [...(propagatedBy.get(cause) ?? []), c])
  const q = f.query.trim().toLowerCase()
  const present = new Set<string>()
  const shown = cs.changes.filter((c) => {
    if (c.origin === 'propagated' && c.cause.length > 0) return false
    const t = typeOfChange(c, types)
    if (t) present.add(t)
    if (!inContext(c.when, f.context)) return false
    if (!f.levels.includes(c.level)) return false
    if (f.groups?.length && !f.groups.includes(groupOf(c))) return false
    if (f.types.length && !(t && f.types.includes(t))) return false
    if (q && !`${c.target} ${c.from ?? ''}`.toLowerCase().includes(q)) return false
    return true
  })
  const byLevel = { major: [], minor: [], patch: [], none: [] } as Record<Level, Change[]>
  for (const c of shown) byLevel[c.level].push(c)
  const byGroup = Object.fromEntries(GROUPS.map((g) => [g, [] as Change[]])) as Record<ChangeGroup, Change[]>
  for (const c of shown) byGroup[groupOf(c)].push(c)
  return { shown, propagatedBy, byLevel, byGroup, types: [...present].sort() }
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object'

/** The canonical value of a changeset side (`{ raw, value }`) or the value itself. */
export const sideValue = (side: unknown): unknown =>
  isObj(side) && 'value' in side ? side.value : isObj(side) && 'raw' in side ? undefined : side

export const isColor = (v: unknown): v is ColorValue =>
  isObj(v) && typeof v.space === 'string' && Array.isArray(v.components)

/** CSS for a swatch. Wide-gamut colors are shown in their own space; hex is the fallback. */
export function cssColor(c: ColorValue): string {
  const hex = colorToHex(c)
  if (c.space === 'srgb')
    return c.alpha < 1 ? `color-mix(in srgb, ${hex} ${c.alpha * 100}%, transparent)` : hex
  const space = c.space === 'display-p3' ? 'display-p3' : null
  if (space) return `color(${space} ${c.components.join(' ')} / ${c.alpha})`
  return hex
}

/** Color pairs (before → after) of direct value changes, for swatches and the card. */
export function colorPairs(
  cs: Changeset,
): Array<{ target: string; before: ColorValue; after: ColorValue; deltaE?: number }> {
  const out: Array<{ target: string; before: ColorValue; after: ColorValue; deltaE?: number }> = []
  const seen = new Set<string>()
  for (const c of cs.changes) {
    if (c.kind !== 'token.value-changed' || c.origin !== 'direct' || seen.has(c.target)) continue
    const before = sideValue(c.before)
    const after = sideValue(c.after)
    if (!isColor(before) || !isColor(after)) continue
    seen.add(c.target)
    const pair: (typeof out)[number] = { target: c.target, before, after }
    if (typeof c.delta?.deltaEOK === 'number') pair.deltaE = c.delta.deltaEOK
    out.push(pair)
  }
  return out.sort((a, b) => (b.deltaE ?? 0) - (a.deltaE ?? 0))
}
