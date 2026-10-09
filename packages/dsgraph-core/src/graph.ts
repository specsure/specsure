import {
  canonicalize,
  type Edge,
  type EdgeKind,
  type Group,
  type Snapshot,
  type Token,
  type TokenValue,
} from '@dsgraph/schema'
import { cssVarToName, matchPath, normalizeName } from './path.js'
import { defaultInput, enumerateInputs, type Input } from './resolver/system.js'
import { type CompareOptions, compareValues, DEFAULT_COMPARE } from './values/compare.js'

export interface TokenFilter {
  type?: string | string[]
  layer?: string
  deprecated?: boolean
  /** Dot-path glob, e.g. `color.text.*` */
  path?: string
}

/** Read-only query API over a snapshot. Works the same in the browser and in Node. */
export class DsGraph {
  readonly snapshot: Snapshot
  private readonly byId = new Map<string, Token>()
  private readonly groupsById = new Map<string, Group>()
  private readonly out = new Map<string, Edge[]>()
  private readonly in = new Map<string, Edge[]>()
  private byName?: Map<string, Token[]>

  constructor(snapshot: Snapshot) {
    this.snapshot = snapshot
    for (const t of snapshot.nodes.tokens) this.byId.set(t.id, t)
    for (const g of snapshot.nodes.groups) this.groupsById.set(g.id, g)
    for (const e of snapshot.edges) {
      push(this.out, e[1], e)
      push(this.in, e[2], e)
    }
  }

  static from(snapshot: Snapshot): DsGraph {
    return new DsGraph(snapshot)
  }

  get modifiers() {
    return this.snapshot.contexts.modifiers
  }

  defaultInput(configured?: Input): Input {
    return defaultInput(this.modifiers, configured)
  }

  inputs(): Input[] {
    return enumerateInputs(this.modifiers)
  }

  token(id: string): Token | undefined {
    return this.byId.get(id)
  }

  group(id: string): Group | undefined {
    return this.groupsById.get(id)
  }

  tokens(filter: TokenFilter = {}): Token[] {
    const types = filter.type === undefined ? undefined : new Set([filter.type].flat())
    return this.snapshot.nodes.tokens.filter(
      (t) =>
        (!types || (t.type !== null && types.has(t.type))) &&
        (filter.layer === undefined || t.layer === filter.layer) &&
        (filter.deprecated === undefined || (t.deprecated !== null) === filter.deprecated) &&
        (filter.path === undefined || matchPath(t.id, filter.path)),
    )
  }

  /** The value entry that applies to `input` (default input when omitted). */
  entry(id: string, input?: Input): TokenValue | undefined {
    const t = this.byId.get(id)
    if (!t) return undefined
    const i = input ?? this.defaultInput()
    return t.values.find((v) => Object.entries(v.when).every(([k, c]) => i[k] === undefined || i[k] === c))
  }

  value(id: string, input?: Input): unknown {
    return this.entry(id, input)?.value
  }

  /** Whole-value alias chain from `id` to the token holding the literal value. */
  chain(id: string, input?: Input): string[] {
    const chain = [id]
    let cur = id
    for (;;) {
      const whole = this.entry(cur, input)?.refs.find((r) => !r.property && !r.targetPath)
      if (!whole || chain.includes(whole.to)) return chain
      chain.push(whole.to)
      cur = whole.to
    }
  }

  edges(kind?: EdgeKind): Edge[] {
    return kind ? this.snapshot.edges.filter((e) => e[0] === kind) : this.snapshot.edges
  }

  /** Tokens this token references (directly or transitively). */
  dependencies(id: string, opts: { transitive?: boolean; kinds?: EdgeKind[] } = {}): string[] {
    return this.walk(id, this.out, 2, opts)
  }

  /** Tokens (and later code nodes) that reference this token. */
  dependents(id: string, opts: { transitive?: boolean; kinds?: EdgeKind[] } = {}): string[] {
    return this.walk(id, this.in, 1, opts)
  }

  /** Every token whose value equals `value` in the given context; colors within `toleranceDeltaE`. */
  byValue(value: unknown, opts: { type?: string; input?: Input } & Partial<CompareOptions> = {}): Token[] {
    const cmp = { ...DEFAULT_COMPARE, ...opts }
    const key = canonicalize(value)
    const hits: Array<{ t: Token; exact: boolean }> = []
    for (const t of this.snapshot.nodes.tokens) {
      if (opts.type && t.type !== opts.type) continue
      const v = this.entry(t.id, opts.input)?.value
      if (v === undefined || v === null) continue
      if (canonicalize(v) === key) hits.push({ t, exact: true })
      else if (compareValues(t.type, v, value, cmp).result !== 'changed') hits.push({ t, exact: false })
    }
    return hits
      .sort((a, b) => Number(b.exact) - Number(a.exact) || a.t.id.localeCompare(b.t.id))
      .map((h) => h.t)
  }

  /** Tokens whose normalized name matches a CSS custom property name. */
  byCssVar(name: string, prefix = '--'): Token[] {
    if (!this.byName) {
      this.byName = new Map()
      for (const t of this.snapshot.nodes.tokens) push(this.byName, normalizeName(t.id), t)
    }
    return this.byName.get(cssVarToName(name, prefix)) ?? []
  }

  private walk(
    id: string,
    index: Map<string, Edge[]>,
    side: 1 | 2,
    opts: { transitive?: boolean; kinds?: EdgeKind[] },
  ): string[] {
    const kinds = new Set<EdgeKind>(opts.kinds ?? ['aliases'])
    const seen = new Set<string>()
    const queue = [id]
    while (queue.length) {
      const cur = queue.shift()!
      for (const e of index.get(cur) ?? []) {
        if (!kinds.has(e[0])) continue
        const next = e[side]
        if (next === id || seen.has(next)) continue
        seen.add(next)
        if (opts.transitive) queue.push(next)
      }
    }
    return [...seen].sort()
  }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}
