import type { DsGraph } from '@dsgraph/core'
import { inferLayers, matchPath } from '@dsgraph/core'
import type { Rule } from '../types.js'

/** Whole-value alias targets of a token across all its contexts. */
function wholeTargets(graph: DsGraph, id: string): string[] {
  const t = graph.token(id)
  if (!t) return []
  return [
    ...new Set(t.values.flatMap((v) => v.refs.filter((r) => !r.property && !r.targetPath).map((r) => r.to))),
  ]
}

export const aliasDepth: Rule = {
  id: 'layer/alias-depth',
  description: 'Tokens of a layer reference tokens of the same layer deeper than allowed.',
  defaultSeverity: 'off',
  run({ graph, options, report }) {
    const layer = typeof options.layer === 'string' ? options.layer : 'semantic'
    const max = typeof options.max === 'number' ? options.max : 0
    const allow = (Array.isArray(options.allow) ? options.allow : [])
      .filter((a): a is string => typeof a === 'string')
      .map((a) => a.split('->').map((s) => s.trim()) as [string, string])
    const allowed = (from: string, to: string) =>
      allow.some(([f, t]) => matchPath(from, f) && matchPath(to, t))
    const memo = new Map<string, number>()
    const depth = (id: string, seen: Set<string>): number => {
      if (memo.has(id)) return memo.get(id)!
      let d = 0
      for (const to of wholeTargets(graph, id)) {
        if (graph.token(to)?.layer !== layer || seen.has(to) || allowed(id, to)) continue
        d = Math.max(d, 1 + depth(to, new Set([...seen, to])))
      }
      memo.set(id, d)
      return d
    }
    for (const t of graph.tokens({ layer })) {
      const d = depth(t.id, new Set([t.id]))
      if (d > max)
        report({
          message: `"${t.id}" goes through ${d} ${layer} alias${d > 1 ? 'es' : ''} (max ${max})`,
          nodes: [t.id, ...wholeTargets(graph, t.id)],
          evidence: { depth: d, max, chain: graph.chain(t.id) },
          token: t,
        })
    }
  },
}

export const allowedSources: Rule = {
  id: 'layer/allowed-sources',
  description: 'Tokens of a layer reference only the layers allowed for it.',
  defaultSeverity: 'off',
  run({ graph, options, report }) {
    const allow = (options.allow ?? {}) as Record<string, unknown>
    for (const [, from, to] of graph.edges('aliases')) {
      const source = graph.token(from)
      const target = graph.token(to)
      const fromLayer = source?.layer
      if (!source || !target || !fromLayer || !(fromLayer in allow)) continue
      const permitted = Array.isArray(allow[fromLayer]) ? (allow[fromLayer] as string[]) : []
      if (!permitted.includes(target.layer ?? ''))
        report({
          message: `"${from}" (${fromLayer}) references "${to}" (${target.layer ?? 'no layer'}); ${fromLayer} may reference ${permitted.length ? permitted.join(', ') : 'nothing'}`,
          nodes: [from, to],
          evidence: { fromLayer, toLayer: target.layer, allowed: permitted },
          token: source,
        })
    }
  },
}

/**
 * References that go against the layers dsgraph reads from the system itself (`inferLayers`): a
 * component that takes its value straight from the palette, past the semantic layer, or a lower
 * layer that references a higher one. For systems that do not set `layers` in the config.
 */
export const layerCrossing: Rule = {
  id: 'layer/crossing',
  description:
    'A reference goes against the layers read from the system: past the semantic layer, or upwards.',
  defaultSeverity: 'off',
  run({ graph, knowledge, report }) {
    for (const c of inferLayers(graph, knowledge).crossings)
      report({
        message:
          c.kind === 'skips-semantic'
            ? `"${c.from}" (${c.fromLayer}) takes its value straight from "${c.to}" (${c.toLayer}), past the semantic layer`
            : `"${c.from}" (${c.fromLayer}) references "${c.to}", a ${c.toLayer} token`,
        nodes: [c.from, c.to],
        evidence: { kind: c.kind, fromLayer: c.fromLayer, toLayer: c.toLayer },
        token: graph.token(c.from)!,
      })
  },
}
