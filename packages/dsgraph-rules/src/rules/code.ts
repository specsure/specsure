import {
  type DsGraph,
  type Knowledge,
  matchGlob,
  type NearestToken,
  nearestTokens,
  normalizeName,
  roleOfProperty,
  type StyleLiteral,
  styleContext,
  type Token,
} from '@dsgraph/core'
import type { Rule, RuleContext } from '../types.js'

const asArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

/** `exceptions: { files: ["src/legacy/**"], values: ["#000", "100%"] }` */
function excepted(options: Record<string, unknown>) {
  const ex = (options.exceptions ?? {}) as Record<string, unknown>
  const files = asArray(ex.files)
  const values = new Set(asArray(ex.values).map((v) => v.toLowerCase()))
  return (l: { file: string; text?: string }) =>
    (files.length > 0 && matchGlob(l.file, files)) ||
    (l.text !== undefined && values.has(l.text.toLowerCase()))
}

/** Namespaces of Tailwind 4 theme variables: `--color-accent` is `bg-accent`, `--radius-md` is `rounded-md`. */
const NAMESPACE = /^(color|radius|spacing|text|font-weight|font|shadow|leading|tracking)-/
/** The token types each Tailwind 4 theme namespace holds. */
const NAMESPACE_TYPES: Record<string, string[]> = {
  color: ['color'],
  radius: ['dimension'],
  spacing: ['dimension'],
  text: ['dimension'],
  'font-weight': ['fontWeight', 'number'],
  font: ['fontFamily', 'fontWeight'],
  shadow: ['shadow'],
  leading: ['dimension', 'number'],
  tracking: ['dimension'],
}

/**
 * The class that replaces an arbitrary value with a token, variants kept: `hover:bg-[#2952cc]` and
 * `color-accent` give `hover:bg-accent`; a bare color name (`primary`) gives `bg-primary`; any other
 * token is named as a variable, `p-(--space-md)`.
 */
export function classFor(source: string, token: { id: string; type: string | null }): string {
  const m = /^((?:[\w-]+:)*)(!?-?)([a-z]+(?:-[a-z]+)*?)-\[/.exec(source)
  if (!m) return token.id
  const [, variants, sign, utility] = m
  const id = token.id
  // A theme namespace names a token only when it holds that kind of value: `--text-*` is font sizes,
  // so a color token `text-default` is no `text-default` class.
  const space = NAMESPACE.exec(id)?.[1]
  const fits = space !== undefined && NAMESPACE_TYPES[space]?.includes(token.type ?? '')
  let name = id.includes('.')
    ? `(--${id.replace(/\./g, '-')})`
    : fits
      ? id.replace(NAMESPACE, '')
      : token.type === 'color' && space === undefined
        ? id
        : `(--${id})`
  // `--bg-accent` is not Tailwind's `--color-bg-accent`: `bg-bg-accent` would name nothing.
  if (name.startsWith(`${utility}-`)) name = `(--${id})`
  return `${variants}${sign}${utility}-${name}`
}

const pxOf = (v: unknown): number => {
  const d = v as { value: number; unit: string }
  return d.unit === 'rem' ? d.value * 16 : d.value
}

const locOf = (l: { file: string; line: number; column: number }) => ({
  file: l.file,
  line: l.line,
  column: l.column,
})

/**
 * Which scale a property takes values from, by token names. Spacing falls back to every dimension
 * when names say nothing; radii and font sizes are not compared with spacing.
 */
const FAMILIES: Array<{ property: RegExp; names: RegExp; strict: boolean }> = [
  { property: /radius$/i, names: /(^|\.)(radius|radii|rounded|corner|round)(\.|$)/, strict: true },
  { property: /^font-size$/i, names: /(^|\.)(font|text|type|typography)(\.|$)/, strict: true },
  {
    property: /.*/,
    names: /(^|\.)(space|spacing|spacer|gap|gutter|inset|size|sizing|stack|layout)(\.|$)/,
    strict: false,
  },
]

const NOT_SPACING = /(^|\.)(line|letter|border|outline|breakpoint)(\.|$)/

function scaleOf(graph: DsGraph, property: string, cache: Map<RegExp, Token[]>): Token[] {
  const family = FAMILIES.find((f) => f.property.test(property))!
  let tokens = cache.get(family.names)
  if (!tokens) {
    const all = graph.tokens({ type: 'dimension' })
    // Spacing is never a radius, a font size, a line height or a border: `text.title.size` and
    // `control.lineBoxHeight` carry spacing words but are not spacing.
    const others = [...FAMILIES.filter((f) => f.strict).map((f) => f.names), NOT_SPACING]
    const other = (t: Token) => !family.strict && others.some((re) => re.test(normalizeName(t.id)))
    const named = all.filter((t) => family.names.test(normalizeName(t.id)) && !other(t))
    // Without spacing tokens, any other dimension may be the scale.
    tokens = named.length || family.strict ? named : all.filter((t) => !other(t))
    cache.set(family.names, tokens)
  }
  return tokens
}

function nearestIn(
  graph: DsGraph,
  l: StyleLiteral,
  knowledge: Knowledge | undefined,
  among?: Set<string>,
): NearestToken | undefined {
  const all = nearestTokens(
    graph,
    { type: l.type, value: l.value },
    graph.defaultInput(),
    among ? 10_000 : 1,
    styleContext(l, knowledge),
    knowledge,
  )
  return among ? all.find((m) => among.has(m.token.id)) : all[0]
}

export const hardcodedColor: Rule = {
  id: 'style/hardcoded-color',
  description: 'A color in a style is written by hand instead of taken from a token.',
  defaultSeverity: 'warning',
  run({ graph, code, options, knowledge, report }) {
    if (!code || graph.tokens({ type: 'color' }).length === 0) return
    const skip = excepted(options)
    const memo = new Map<string, NearestToken | undefined>()
    for (const l of code.literals) {
      if (l.type !== 'color' || skip(l)) continue
      // The same color may want different tokens: text for `color`, background for `background`,
      // the hover one in `:hover`, the button's own in `.button`.
      const { states, components } = styleContext(l, knowledge)
      const key = [roleOfProperty(l.property), states, components, l.text.toLowerCase()].join('\u0000')
      if (!memo.has(key)) memo.set(key, nearestIn(graph, l, knowledge))
      const near = memo.get(key)
      if (!near) continue
      report({
        message: l.source
          ? near.exact
            ? `"${l.source}" writes a color by hand; use "${classFor(l.source, near.token)}" (token "${near.token.id}")`
            : `"${l.source}" is not in the palette; closest is "${classFor(l.source, near.token)}" (token "${near.token.id}", ΔE ${near.distance})`
          : near.exact
            ? `Color "${l.text}" in ${l.property} is written by hand; use "${near.token.id}"`
            : `Color "${l.text}" in ${l.property} is not in the palette; closest is "${near.token.id}" (ΔE ${near.distance})`,
        nodes: [near.token.id],
        evidence: {
          value: l.text,
          property: l.property,
          selector: l.selector,
          source: l.source,
          token: near.token.id,
          // What to write instead: the class for a class, the token otherwise.
          replacement: l.source ? classFor(l.source, near.token) : near.token.id,
          exact: near.exact,
          deltaE: near.distance,
        },
        loc: locOf(l),
      })
    }
  },
}

export const offScale: Rule = {
  id: 'style/off-scale',
  description:
    'A spacing, radius or font size in a style is written by hand: on the scale (use the token) or off it.',
  defaultSeverity: 'warning',
  run({ graph, code, options, knowledge, report }) {
    if (!code || graph.tokens({ type: 'dimension' }).length === 0) return
    const skip = excepted(options)
    const scales = new Map<RegExp, Token[]>()
    for (const l of code.literals) {
      if (l.type !== 'dimension' || skip(l)) continue
      const scale = scaleOf(graph, l.property, scales)
      const near = nearestIn(graph, l, knowledge, new Set(scale.map((t) => t.id)))
      if (!near) continue
      // 999px, 9999px: a pill, not a step of the radius scale, unless the system has a token for it.
      if (!near.exact && /radius$/i.test(l.property) && pxOf(l.value) >= 100) continue
      const px = near.value as { value: number; unit: string }
      report({
        message: l.source
          ? near.exact
            ? `"${l.source}" is on the scale; use "${classFor(l.source, near.token)}" (token "${near.token.id}")`
            : `"${l.source}" is off the scale; closest is "${classFor(l.source, near.token)}" (token "${near.token.id}", ${px.value}${px.unit})`
          : near.exact
            ? `"${l.text}" in ${l.property} is on the scale; use "${near.token.id}"`
            : `"${l.text}" in ${l.property} is off the scale; closest is "${near.token.id}" (${px.value}${px.unit})`,
        nodes: [near.token.id],
        evidence: {
          value: l.text,
          property: l.property,
          selector: l.selector,
          source: l.source,
          token: near.token.id,
          replacement: l.source ? classFor(l.source, near.token) : near.token.id,
          exact: near.exact,
          distance: near.distance,
        },
        loc: locOf(l),
        // A value that has a token is a quick fix; one that has none is a design question.
        ...(near.exact ? { severity: 'info' as const } : {}),
      })
    }
  },
}

export const deprecatedUsage: Rule = {
  id: 'usage/deprecated',
  description: 'The code uses a deprecated token.',
  defaultSeverity: 'warning',
  run({ code, vars, options, report }) {
    if (!code || !vars) return
    const skip = excepted(options)
    for (const u of code.uses) {
      if (skip(u)) continue
      const t = vars.tokenOfUse(u)
      if (!t?.deprecated) continue
      const replacement = t.deprecated.replacement
      report({
        message: `"${u.text ?? u.name}" is deprecated${replacement ? `; use "${replacement}"` : ''}`,
        nodes: [t.id],
        evidence: { name: u.text ?? u.name, reason: t.deprecated.reason, replacement, property: u.property },
        loc: locOf(u),
      })
    }
  },
}

export const unknownToken: Rule = {
  id: 'usage/unknown-token',
  description:
    "The code uses a design-system variable that is not in the tokens (removed, renamed or misspelled). Needs the system's prefix, configured or learned.",
  defaultSeverity: 'error',
  run({ code, vars, options, report }) {
    if (!code || !vars) return
    const skip = excepted(options)
    for (const u of code.uses) {
      const names = [u.name, ...(u.candidates ?? [])]
      if (skip(u) || !names.some((n) => vars.isSystemName(n)) || vars.tokenOfUse(u)) continue
      report({
        message: `"${u.text ?? u.name}" is not a token${u.fallback ? `; the fallback "${u.fallback}" is used instead` : ''}`,
        nodes: [],
        evidence: { name: u.text ?? u.name, property: u.property, fallback: u.fallback },
        loc: locOf(u),
      })
    }
  },
}

/** Tokens the code reads, with everything they take their values from. */
export function usedTokens(ctx: Pick<RuleContext, 'graph' | 'code' | 'vars'>): Set<string> {
  const used = new Set<string>()
  for (const u of ctx.code?.uses ?? []) {
    const t = ctx.vars?.tokenOfUse(u)
    if (!t || used.has(t.id)) continue
    used.add(t.id)
    for (const d of ctx.graph.dependencies(t.id, { transitive: true })) used.add(d)
  }
  return used
}

export const unusedToken: Rule = {
  id: 'token/unused',
  description: 'A token is not used by the code, directly or through another token.',
  defaultSeverity: 'info',
  run(ctx) {
    const { graph, code, report } = ctx
    if (!code || code.uses.length === 0) return
    const used = usedTokens(ctx)
    for (const t of graph.tokens()) {
      if (used.has(t.id) || t.deprecated) continue
      report({ message: `"${t.id}" is not used in the code`, nodes: [t.id], token: t })
    }
  },
}
