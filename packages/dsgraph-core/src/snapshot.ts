import {
  canonicalize,
  contentHash,
  type Diagnostic,
  type Edge,
  type Group,
  type Modifier,
  SNAPSHOT_SCHEMA,
  type Snapshot,
  type SourceMeta,
  type Token,
  type TokenValue,
} from '@dsgraph/schema'
import { DiagnosticBag } from './diagnostics.js'
import type { ResolvedDoc, ResolvedToken } from './dtcg/resolve.js'
import { matchPath } from './path.js'
import { createResolver } from './resolver/resolve.js'
import {
  defaultInput,
  enumerateInputs,
  type Input,
  modifiersOf,
  type TokenSystem,
} from './resolver/system.js'

export interface LayerConfig {
  match: string[]
  public?: boolean
}

export interface BuildOptions {
  source?: SourceMeta
  layers?: Record<string, LayerConfig>
  maxPermutations?: number
  defaultInput?: Input
  strict?: boolean
  diagnostics?: DiagnosticBag
  meta?: Record<string, unknown>
}

export const GENERATOR = 'dsgraph@0.4.0'

const inputKey = (input: Input) => canonicalize(input)

/** Builds a canonical snapshot by resolving every permutation of contexts (Resolver 2025.10). */
export async function buildSnapshot(system: TokenSystem, opts: BuildOptions = {}): Promise<Snapshot> {
  const diag = opts.diagnostics ?? new DiagnosticBag()
  const modifiers = modifiersOf(system)
  const all = enumerateInputs(modifiers)
  const max = opts.maxPermutations ?? 64
  const def = defaultInput(modifiers, opts.defaultInput)
  const partial = all.length > max
  let inputs = all
  if (partial) {
    diag.warn(
      'resolver/too-many-permutations',
      `${all.length} permutations exceed the limit of ${max}; resolving defaults plus one modifier at a time`,
    )
    const seen = new Map<string, Input>([[inputKey(def), def]])
    for (const m of modifiers)
      for (const c of m.contexts) {
        const i = { ...def, [m.name]: c }
        seen.set(inputKey(i), i)
      }
    inputs = [...seen.values()]
  }
  if (modifiers.some((m) => m.default === undefined) && !opts.defaultInput)
    diag.info('resolver/no-default', 'Some modifiers have no default; the first context is used as default')

  const resolver = createResolver(system, { strict: opts.strict ?? false })
  const results: Array<{ input: Input; doc: ResolvedDoc }> = inputs.map((input) => ({
    input,
    doc: resolver.resolve(input, diag),
  }))
  diag.merge(resolver.parseDiagnostics)
  const defaultResult = results.find((r) => inputKey(r.input) === inputKey(def)) ?? results[0]!

  const ids = new Set<string>()
  for (const r of results) for (const id of r.doc.tokens.keys()) ids.add(id)

  const tokens: Token[] = []
  const edges: Edge[] = []
  for (const id of [...ids].sort()) {
    const perInput = results.map((r) => ({ input: r.input, token: r.doc.tokens.get(id) }))
    const signature = (t: ResolvedToken | undefined) =>
      t ? canonicalize({ raw: t.raw, value: t.value, refs: t.refs, type: t.type }) : '∅'

    // Modifiers that influence this token (section 1.3 of the spec).
    const influencing = modifiers.filter((m) => {
      const groups = new Map<string, Set<string>>()
      for (const p of perInput) {
        const rest = canonicalize({ ...p.input, [m.name]: undefined })
        const set = groups.get(rest) ?? new Set<string>()
        set.add(signature(p.token))
        groups.set(rest, set)
      }
      return [...groups.values()].some((s) => s.size > 1)
    })
    const names = influencing.map((m) => m.name)

    const values = new Map<string, TokenValue>()
    let missingSomewhere = false
    for (const p of perInput) {
      if (!p.token) {
        missingSomewhere = true
        continue
      }
      const when: Record<string, string> = {}
      for (const n of names) when[n] = p.input[n]!
      const key = canonicalize(when)
      if (!values.has(key))
        values.set(key, { when, raw: p.token.raw, value: p.token.value, refs: p.token.refs })
    }

    const meta = defaultResult.doc.tokens.get(id) ?? perInput.find((p) => p.token)!.token!
    if (missingSomewhere)
      diag.warn(
        'resolver/token-missing-in-context',
        `Token "${id}" is not defined in every context`,
        meta.origin,
      )

    const token: Token = {
      id,
      path: meta.path,
      type: meta.type,
      typeSource: meta.typeSource,
      layer: layerOf(id, opts.layers),
      deprecated: meta.deprecated,
      values: [...values.values()].sort((a, b) => canonicalize(a.when).localeCompare(canonicalize(b.when))),
      origin: meta.origin,
      inheritedFrom: meta.inheritedFrom,
      flags: meta.flags,
    }
    if (meta.description !== undefined) token.description = meta.description
    if (meta.extensions !== undefined) token.extensions = meta.extensions
    tokens.push(token)

    // Alias edges; `when` only when the reference does not exist in every context.
    const refKeys = new Map<string, { ref: TokenValue['refs'][number]; whens: TokenValue['when'][] }>()
    for (const v of token.values)
      for (const ref of v.refs) {
        const k = canonicalize(ref)
        const e = refKeys.get(k) ?? { ref, whens: [] }
        e.whens.push(v.when)
        refKeys.set(k, e)
      }
    for (const { ref, whens } of refKeys.values()) {
      const attrs: Record<string, unknown> = {}
      if (ref.property) attrs.property = ref.property
      if (ref.targetPath) attrs.targetPath = ref.targetPath
      const everywhere = whens.length === token.values.length && !missingSomewhere
      if (everywhere)
        edges.push(Object.keys(attrs).length ? ['aliases', id, ref.to, attrs] : ['aliases', id, ref.to])
      else for (const when of whens) edges.push(['aliases', id, ref.to, { ...attrs, when }])
    }
    if (token.deprecated?.replacement) edges.push(['deprecated_by', id, token.deprecated.replacement])
  }

  const groups: Group[] = defaultResult.doc.groups
  for (const g of groups) if (g.extends) edges.push(['extends', g.id, g.extends])

  // Paths that differ only by case collide in most code targets.
  const lower = new Map<string, string>()
  for (const t of tokens) {
    const k = t.id.toLowerCase()
    const other = lower.get(k)
    if (other) diag.warn('naming/case-collision', `"${t.id}" and "${other}" differ only by case`, t.origin)
    else lower.set(k, t.id)
  }

  edges.sort((a, b) => canonicalize(a).localeCompare(canonicalize(b)))
  const snapshot: Snapshot = {
    schema: SNAPSHOT_SCHEMA,
    source: opts.source ?? { kind: 'files' },
    contexts: { modifiers: modifiers as Modifier[], permutations: all.length, partial },
    nodes: { groups, tokens },
    edges,
    diagnostics: diag.list() as Diagnostic[],
    hash: '',
    meta: { generator: GENERATOR, ...opts.meta },
  }
  snapshot.hash = await contentHash(snapshot as unknown as Record<string, unknown>)
  return snapshot
}

function layerOf(id: string, layers: Record<string, LayerConfig> | undefined): string | null {
  if (!layers) return null
  for (const [name, layer] of Object.entries(layers))
    if (layer.match.some((p) => matchPath(id, p))) return name
  return null
}
