import {
  type DsGraph,
  nearestTokens,
  normalizeName,
  type StyleContext,
  type Token,
  vocabularyOf,
} from '@dsgraph/core'
import { formatValue } from '@dsgraph/report'
import type { Overview, OverviewToken, Trap, Use } from './lookup-types'
import { cssColor, isColor } from './view'

const USES: Array<{ use: Exclude<Use, 'shadow'>; property: string }> = [
  { use: 'text', property: 'color' },
  { use: 'background', property: 'background' },
  { use: 'border', property: 'border-color' },
]
const STATES = ['hover', 'focus', 'active', 'disabled', 'selected'] as const
const SPACE = /(^|\.)(space|spacing|spacer|gap|gutter|inset|padding|margin)(\.|$)/
const RADIUS = /(^|\.)(radius|radii|rounded|corner)(\.|$)/
const PER_USE = 8

const px = (v: unknown): number | undefined => {
  const d = v as { value?: number; unit?: string } | null
  if (!d || typeof d.value !== 'number') return undefined
  return d.unit === 'rem' ? d.value * 16 : d.unit === 'px' ? d.value : undefined
}

/**
 * How a design system is meant to be used, read from it: which tokens it made for text, backgrounds,
 * borders, shadows and states, its spacing and radius scales, and the values held by tokens for
 * different uses, where a value copied from a mockup picks the wrong token.
 */
export function overviewOf(g: DsGraph): Overview {
  const v = vocabularyOf()
  const input = g.defaultInput({})
  const live = g.tokens().filter((t) => !t.deprecated)
  const words = new Map(live.map((t) => [t.id, normalizeName(t.id).split('.')]))
  const name = (t: Token) => words.get(t.id)!.join('.')
  const stateOf = (t: Token) =>
    words
      .get(t.id)!
      .map((w) => v.states.get(w))
      .find(Boolean)
  const users = new Map<string, number>()
  const used = (t: Token) => {
    let n = users.get(t.id)
    if (n === undefined) {
      n = g.dependents(t.id, { transitive: true }).length
      users.set(t.id, n)
    }
    return n
  }
  const alias = (t: Token) => g.chain(t.id, input).length > 1
  const show = (t: Token): OverviewToken => {
    const value = g.value(t.id, input)
    const row: OverviewToken = { id: t.id, text: formatValue(t.type, value) }
    if (isColor(value)) row.swatch = cssColor(value)
    return row
  }
  // General semantic tokens first: the role as the first word, an alias, the ones most is built on.
  const rank = (role: RegExp) => (a: Token, b: Token) =>
    Number(role.test(words.get(b.id)![0]!)) - Number(role.test(words.get(a.id)![0]!)) ||
    Number(alias(b)) - Number(alias(a)) ||
    used(b) - used(a) ||
    words.get(a.id)!.length - words.get(b.id)!.length ||
    a.id.localeCompare(b.id)
  const colors = live.filter((t) => t.type === 'color')

  const uses: Overview['uses'] = []
  for (const { use } of USES) {
    const role = v.roles[use]
    const all = colors.filter((t) => role.test(name(t)) && !stateOf(t)).sort(rank(role))
    if (all.length) uses.push({ use, tokens: all.slice(0, PER_USE).map(show), total: all.length })
  }
  const shadows = live.filter((t) => t.type === 'shadow').sort(rank(v.roles.shadow))
  if (shadows.length)
    uses.push({ use: 'shadow', tokens: shadows.slice(0, PER_USE).map(show), total: shadows.length })

  const states: Overview['states'] = []
  for (const s of STATES) {
    const all = colors.filter((t) => stateOf(t) === s).sort(rank(v.roles.background))
    if (all.length) states.push({ state: s, tokens: all.slice(0, 6).map(show), total: all.length })
  }

  const scale = (test: RegExp) => {
    const seen = new Set<number>()
    return live
      .filter((t) => t.type === 'dimension' && test.test(name(t)))
      .map((t) => ({ t, px: px(g.value(t.id, input)) }))
      .filter((x): x is { t: Token; px: number } => x.px !== undefined && x.px > 0)
      .sort((a, b) => a.px - b.px || a.t.id.localeCompare(b.t.id))
      .filter((x) => !seen.has(x.px) && !!seen.add(x.px))
      .slice(0, 12)
      .map((x) => ({ ...show(x.t), px: x.px }))
  }
  const space = scale(SPACE)
  const radius = scale(RADIUS)

  // Values held by tokens made for different uses or states: which one the search would pick for each.
  const byValue = new Map<string, Token[]>()
  for (const t of colors) {
    const key = formatValue(t.type, g.value(t.id, input))
    byValue.set(key, [...(byValue.get(key) ?? []), t])
  }
  const traps: Trap[] = []
  // The most shared values are where the choice matters; checking every value would take seconds.
  const shared = [...byValue].filter(([, ts]) => ts.length > 1).sort((a, b) => b[1].length - a[1].length)
  for (const [value, group] of shared.slice(0, 30)) {
    const alpha = (g.value(group[0]!.id, input) as { alpha?: number } | null)?.alpha
    if (alpha === 0) continue
    const picks: Trap['picks'] = []
    const seen = new Set<string>()
    const raw = g.value(group[0]!.id, input)
    const ask = (ctx: StyleContext, use: Exclude<Use, 'shadow'>, state?: string) => {
      const best = nearestTokens(g, { type: 'color', value: raw }, input, 1, ctx)[0]
      if (!best?.exact || seen.has(best.token.id) || !group.some((t) => t.id === best.token.id)) return
      // Only an answer the name agrees with: a general text token for text (the role first, not a
      // component's), a hover token for hover.
      const w = words.get(best.token.id)!
      const fits = state
        ? stateOf(best.token) === state && v.roles[use].test(w.join('.'))
        : v.roles[use].test(w[0]!) && !stateOf(best.token)
      if (!fits) return
      seen.add(best.token.id)
      picks.push({ use, ...(state ? { state } : {}), token: best.token.id })
    }
    for (const { use, property } of USES) ask({ property }, use)
    for (const s of STATES) ask({ property: 'background', states: [s] }, 'background', s)
    if (picks.length < 2) continue
    const trap: Trap = { value, count: group.length, picks }
    if (isColor(raw)) trap.swatch = cssColor(raw)
    traps.push(trap)
  }
  traps.sort((a, b) => b.picks.length - a.picks.length || b.count - a.count || a.value.localeCompare(b.value))

  return {
    uses,
    states,
    space,
    radius,
    traps: traps.slice(0, 6),
    trapCount: traps.length,
    checked: Math.min(30, shared.length),
  }
}
