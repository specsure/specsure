import {
  type DsGraph,
  type Input,
  type Knowledge,
  type NearestToken,
  nearestTokens,
  normalizeName,
  type StyleContext,
  type Token,
  vocabularyOf,
  type When,
} from '@dsgraph/core'
import { formatValue } from './values.js'

/**
 * Questions about one design system, answered as data: the MCP server words the answers for an
 * agent, the site draws them for people. Both get the same answer from the same function.
 */

/** A value to find a token for, as `parseValue` in `@dsgraph/adapters` reads it. */
export interface ParsedValue {
  type: string
  value: unknown
}

export interface FoundToken {
  id: string
  deprecated: boolean
  /** The token it takes its value from, at the end of its chain of references, when it is an alias. */
  target?: string
}

/** Tokens that share one value: a single choice in the answer. */
export interface FoundGroup {
  /** The value as dsgraph prints it. */
  value: string
  exact: boolean
  /** ΔE for colors, px for sizes, ms for durations. */
  distance: number
  tokens: FoundToken[]
}

export interface FindResult {
  type: string
  /** The value asked about, as dsgraph prints it. */
  value: string
  input: Input
  groups: FoundGroup[]
}

export interface FindOptions {
  /** A CSS property, or the whole context of the code (property, states, components). */
  context?: string | StyleContext
  input?: Input
  /** How many different values to return (default 5). */
  limit?: number
  knowledge?: Knowledge
}

/**
 * The tokens for a value: exact matches first, chosen for the property, state and component, then
 * the closest. Tokens with the same value are grouped, so the groups list different values.
 */
export function findToken(graph: DsGraph, parsed: ParsedValue, opts: FindOptions = {}): FindResult {
  const input = opts.input ?? graph.defaultInput({})
  const limit = opts.limit ?? 5
  const groups: Array<FoundGroup & { matches: NearestToken[] }> = []
  for (const m of nearestTokens(graph, parsed, input, 500, opts.context, opts.knowledge)) {
    const key = formatValue(m.token.type, m.value)
    const g = groups.find((x) => x.value === key)
    if (g) g.matches.push(m)
    else if (groups.length < limit)
      groups.push({ value: key, exact: m.exact, distance: m.distance, tokens: [], matches: [m] })
  }
  return {
    type: parsed.type,
    value: formatValue(parsed.type, parsed.value),
    input,
    groups: groups.map(({ matches, ...g }) => ({
      ...g,
      tokens: matches.map((m) => {
        const chain = graph.chain(m.token.id, input)
        const t: FoundToken = { id: m.token.id, deprecated: m.token.deprecated !== null }
        if (chain.length > 1) t.target = chain.at(-1)!
        return t
      }),
    })),
  }
}

/**
 * A state as people write it (`focus-visible`, `:hover`, `pressed`) as dsgraph names it: the first
 * word the vocabulary knows, else the first word.
 */
export function stateOf(text: string, knowledge?: Knowledge): string {
  const states = vocabularyOf(knowledge).states
  const words = normalizeName(text.trim().replace(/^:+/, '')).split('.')
  return states.get(words.find((w) => states.has(w)) ?? '') ?? words[0]!
}

/** A component's name as `styleContext` keeps it: `ActionList`, `action-list` → `actionlist`. */
export const componentOf = (text: string): string =>
  text
    .trim()
    .replace(/[\s._-]+/g, '')
    .toLowerCase()

export interface TokenValue {
  when: When
  /** The value as dsgraph prints it. */
  text: string
  value: unknown
  /** Tokens it takes the value from, nearest first; empty for a value written in the token. */
  via: string[]
}

export interface TokenDetails {
  token: Token
  values: TokenValue[]
  /** Tokens that reference it directly. */
  users: string[]
  /** Every token whose value comes from it, through any number of references. */
  allUsers: number
  /** Other tokens with the same value in the default context, the same type. */
  sameValue: string[]
}

/** One token in full: values in every context, where they come from, who uses it. */
export function readToken(graph: DsGraph, id: string): TokenDetails | undefined {
  const token = graph.token(id)
  if (!token) return undefined
  const values = token.values.map((v) => ({
    when: v.when,
    text: formatValue(token.type, v.value),
    value: v.value,
    via: graph.chain(token.id, v.when).slice(1),
  }))
  const input = graph.defaultInput({})
  const value = graph.value(token.id, input)
  const sameValue =
    value === undefined || value === null
      ? []
      : graph
          .byValue(value, { ...(token.type ? { type: token.type } : {}), input })
          .map((t) => t.id)
          .filter((x) => x !== token.id)
  return {
    token,
    values,
    users: graph.dependents(token.id),
    allUsers: graph.dependents(token.id, { transitive: true }).length,
    sameValue,
  }
}

/** Ids close to one that does not exist, for "did you mean". */
export function similarIds(graph: DsGraph, id: string, limit = 8): string[] {
  const n = normalizeName(id)
  return graph
    .tokens()
    .map((x) => x.id)
    .filter((x) => {
      const m = normalizeName(x)
      return x.includes(id) || id.includes(x) || m.includes(n) || n.includes(m)
    })
    .slice(0, limit)
}

export interface TokenRow {
  token: Token
  /** Its value in the context, as dsgraph prints it. */
  text: string
  value: unknown
  /** The chain it takes the value through, without itself. */
  via: string[]
}

export interface SearchOptions {
  /** Part of the name, a glob (`color.text.*`) or a custom property (`--color-text`). */
  query?: string
  type?: string
  input?: Input
}

/** Tokens by name and type, with their values in a context. */
export function searchTokens(graph: DsGraph, opts: SearchOptions = {}): TokenRow[] {
  const input = opts.input ?? graph.defaultInput({})
  const q = opts.query?.trim() ?? ''
  const glob = /[*?]/.test(q)
  const inGlob = glob ? new Set(graph.tokens({ path: q }).map((t) => t.id)) : undefined
  const asVar = q.startsWith('--') ? new Set(graph.byCssVar(q).map((t) => t.id)) : undefined
  const needle = q.toLowerCase()
  const name = normalizeName(q)
  return graph
    .tokens(opts.type ? { type: opts.type } : {})
    .filter((t) => {
      if (!q) return true
      if (inGlob) return inGlob.has(t.id)
      if (asVar?.has(t.id)) return true
      return t.id.toLowerCase().includes(needle) || (!!name && normalizeName(t.id).includes(name))
    })
    .map((token) => {
      const value = graph.value(token.id, input)
      return {
        token,
        text: formatValue(token.type, value),
        value,
        via: graph.chain(token.id, input).slice(1),
      }
    })
}

export interface Description {
  tokens: number
  files: string[]
  /** Types by how many tokens have them, most first. */
  types: Array<[type: string, count: number]>
  modes: Array<{ name: string; contexts: string[]; default: string }>
  /** First parts of the names, by how many tokens start with them. */
  groups: Array<[group: string, count: number]>
  /** How many tokens hold a value and how many take it from another token. */
  values: number
  aliases: number
  errors: number
}

/** An overview of a token source: types, modes, groups, files. */
export function describeTokens(graph: DsGraph): Description {
  const tokens = graph.tokens()
  const byType = new Map<string, number>()
  const roots = new Map<string, number>()
  let aliases = 0
  for (const t of tokens) {
    byType.set(t.type ?? 'untyped', (byType.get(t.type ?? 'untyped') ?? 0) + 1)
    const root = t.id.includes('.') ? t.id.split('.')[0]! : t.id.split('-')[0]!
    roots.set(root, (roots.get(root) ?? 0) + 1)
    if (t.values.some((v) => v.refs.some((r) => !r.property && !r.targetPath))) aliases++
  }
  const byCount = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return {
    tokens: tokens.length,
    files: [...new Set(tokens.map((t) => t.origin.file))].sort(),
    types: byCount(byType),
    modes: graph.modifiers.map((m) => ({
      name: m.name,
      contexts: m.contexts,
      default: m.default ?? m.contexts[0] ?? '',
    })),
    groups: byCount(roots),
    values: tokens.length - aliases,
    aliases,
    errors: graph.snapshot.diagnostics.filter((d) => d.severity === 'error').length,
  }
}
