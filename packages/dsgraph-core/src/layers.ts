import type { DsGraph } from './graph.js'
import { type Knowledge, type LayerKind, vocabularyOf } from './knowledge.js'
import { normalizeName } from './path.js'

/**
 * A token's layer as read from the system itself: what its group, collection or file is called, or,
 * when nothing says, how it references and is referenced.
 * - `palette`: raw values other tokens take theirs from;
 * - `semantic`: what a value is for (`bg.default`), referencing the palette;
 * - `component`: one component's values (`button.bg`), referencing the semantic layer;
 * - `value`: a raw value nothing references, used by code directly (a spacing step, a shadow).
 */
export type InferredLayer = LayerKind | 'value'

export interface TokenLayer {
  layer: InferredLayer
  /**
   * What says so: the layers set in the config, the name of the token's group, collection or file
   * (`Primitives`, `semantic`, `md.comp`), or only its references and its name's shape, a guess.
   */
  by: 'config' | 'name' | 'references'
}

/** A reference that goes against the layers: `from` (in `fromLayer`) takes its value from `to`. */
export interface LayerCrossing {
  from: string
  to: string
  fromLayer: InferredLayer
  toLayer: InferredLayer
  /** A component skips the semantic layer, or a lower layer references a higher one. */
  kind: 'skips-semantic' | 'upward'
}

export interface Layers {
  tokens: Map<string, TokenLayer>
  crossings: LayerCrossing[]
}

const RANK: Record<InferredLayer, number> = { value: 0, palette: 0, semantic: 1, component: 2 }

/** Words that only repeat the type before the part of a name that matters: `color.text.body`. */
const TYPE_WORDS = new Set(['color', 'colors', 'colour', 'dimension', 'size', 'semantic', 'sys', 'ref'])

/** Whole-value references of a token in any of its contexts. */
const targets = (graph: DsGraph, id: string): string[] => [
  ...new Set(
    (graph.token(id)?.values ?? []).flatMap((v) =>
      v.refs.filter((r) => !r.property && !r.targetPath).map((r) => r.to),
    ),
  ),
]

const computed = new WeakMap<DsGraph, Layers>()

/**
 * Every token's layer and the references that go against the layers. Layers set in the config
 * win, then the names the system gives its groups, collections and files; the rest is read from
 * references, and only then is a component told from a semantic token by its name: a component's
 * name leads with the component (`card.bg`, `button.text`), a semantic one with what it is for.
 */
export function inferLayers(graph: DsGraph, knowledge?: Knowledge): Layers {
  const cached = knowledge ? undefined : computed.get(graph)
  if (cached) return cached
  const v = vocabularyOf(knowledge)
  const roleOrState = (w: string) => v.states.has(w) || Object.values(v.roles).some((r) => r.test(w))

  const named = (id: string): LayerKind | undefined => {
    const t = graph.token(id)!
    const configured = t.layer ? v.layers.get(t.layer.toLowerCase()) : undefined
    if (configured) return configured
    // The first word of the name, or the second after a short namespace: `md.sys.color.primary`.
    const words = normalizeName(id).split('.')
    const lead = [words[0]!]
    if (words[0]!.length <= 3 && !roleOrState(words[0]!) && words[1]) lead.push(words[1])
    for (const w of lead) {
      const l = v.layers.get(w)
      if (l) return l
    }
    // The file and the folders it is in: `Primitives.tokens.json`, `tokens/semantic/colors.json`.
    // A file is a looser word than a group: a "primitives" file can hold `bgColor.default`, an alias
    // named for its purpose, which is a semantic token wherever it is kept.
    const lead0 = words.length > 1 && TYPE_WORDS.has(words[0]!) ? words[1]! : words[0]!
    const raw = targets(graph, id).every((to) => !targets(graph, to).length)
    const file = t.origin.file.toLowerCase().split(/[/\\]/)
    const parts = file.flatMap((p, i) => (i === file.length - 1 ? [p.split('.')[0]!] : [p]))
    for (const p of parts)
      for (const w of p.split(/[^a-z0-9]+/)) {
        const l = v.layers.get(w)
        if (l && (l !== 'palette' || (raw && !roleOrState(lead0)))) return l
      }
    return undefined
  }

  const component = (id: string): boolean => {
    const words = normalizeName(id).split('.')
    const at = words.length > 1 && TYPE_WORDS.has(words[0]!) ? 1 : 0
    const lead = words[at]
    if (!lead || roleOrState(lead) || /^\d/.test(lead)) return false
    return words.slice(at + 1).some((w) => Object.values(v.roles).some((r) => r.test(w)))
  }

  const tokens = new Map<string, TokenLayer>()
  for (const t of graph.tokens()) {
    const fromConfig = !!t.layer && !!v.layers.get(t.layer.toLowerCase())
    const name = named(t.id)
    if (name) {
      tokens.set(t.id, { layer: name, by: fromConfig ? 'config' : 'name' })
      continue
    }
    const refs = targets(graph, t.id)
    const layer: InferredLayer = refs.length
      ? component(t.id)
        ? 'component'
        : 'semantic'
      : graph.dependents(t.id).length
        ? 'palette'
        : 'value'
    tokens.set(t.id, { layer, by: 'references' })
  }

  // A step of a ramp is the palette's even when nothing references it, or when it references another
  // step (`neutral.0` → `white`): most of its group is.
  const groups = new Map<string, string[]>()
  for (const id of tokens.keys()) {
    const g = id.replace(/[.-][^.-]+$/, '')
    if (g !== id) groups.set(g, [...(groups.get(g) ?? []), id])
  }
  for (const [, ids] of groups) {
    // A color ramp of numbered steps is a palette even when nothing uses it yet: `amber-1`…`amber-12`,
    // `amber-a1`… for its alpha steps.
    const steps = ids.filter(
      (id) => /[.-][a-z]?\d+$/.test(id) && graph.token(id)!.type === 'color' && !targets(graph, id).length,
    )
    const ramp = new Set(steps.length >= 3 ? steps : [])
    const palette = ids.filter((id) => ramp.has(id) || tokens.get(id)!.layer === 'palette').length
    for (const id of ids) {
      const l = tokens.get(id)!
      if (l.by !== 'references' || l.layer === 'palette' || l.layer === 'component') continue
      if (l.layer === 'semantic' && !targets(graph, id).every((to) => tokens.get(to)?.layer === 'palette'))
        continue
      if (ramp.has(id) || (ids.length >= 3 && palette * 2 > ids.length - 1))
        tokens.set(id, { layer: 'palette', by: 'references' })
    }
  }

  // Checked only where the system has the layer that is skipped: a two-layer system has no
  // semantic layer for its components to go through.
  const has = new Set([...tokens.values()].map((x) => x.layer))
  const crossings: LayerCrossing[] = []
  for (const [from, f] of tokens) {
    if (f.by === 'config') continue
    for (const to of targets(graph, from)) {
      const t = tokens.get(to)
      if (!t) continue
      const kind =
        f.layer === 'component' && (t.layer === 'palette' || t.layer === 'value') && has.has('semantic')
          ? 'skips-semantic'
          : RANK[t.layer] > RANK[f.layer]
            ? 'upward'
            : undefined
      if (kind) crossings.push({ from, to, fromLayer: f.layer, toLayer: t.layer, kind })
    }
  }
  const out = { tokens, crossings }
  if (!knowledge) computed.set(graph, out)
  return out
}
