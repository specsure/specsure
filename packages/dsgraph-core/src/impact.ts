import type { Change, Changeset, Level } from '@dsgraph/schema'
import { type CodeIndex, type TokenUse, VarMatcher } from './code.js'
import type { DsGraph } from './graph.js'

/** A place in the code that a change reaches: the `var()` and the token it reads. */
export interface ImpactSite extends TokenUse {
  /** The token the code reads; the changed token itself or one that takes its value from it. */
  token: string
}

export interface ChangeImpact {
  change: string
  kind: Change['kind']
  target: string
  level: Level
  /** `breaks`: the variable is gone (removed, renamed, missing in a context, new type); `changes`: it looks different. */
  effect: 'breaks' | 'changes'
  sites: ImpactSite[]
}

export interface Impact {
  changes: ChangeImpact[]
  /** Places that break and places that look different, each counted once. */
  breaks: number
  looksDifferent: number
  files: string[]
}

const BREAKS = new Set<Change['kind']>([
  'token.removed',
  'token.renamed',
  'token.missing-in-context',
  'token.type-changed',
])
const IGNORED = new Set<Change['kind']>([
  'token.added',
  'token.notation-changed',
  'token.description-changed',
  'token.extensions-changed',
  'token.undeprecated',
  'token.contexts-changed',
  // Deprecation does not change what the code gets; `usage/deprecated` reports those uses.
  'token.deprecated',
])

/** Uses of each token in a graph, by token id. */
function usesByToken(graph: DsGraph, code: CodeIndex, prefix?: string): Map<string, TokenUse[]> {
  const vars = new VarMatcher(
    graph,
    code.uses.map((u) => u.name),
    prefix,
  )
  const out = new Map<string, TokenUse[]>()
  for (const u of code.uses) {
    const t = vars.token(u.name)
    if (t) out.set(t.id, [...(out.get(t.id) ?? []), u])
  }
  return out
}

const siteKey = (s: TokenUse) => `${s.file}:${s.line}:${s.column}:${s.name}`

/**
 * Where a changeset reaches into the code (spec section 5.4): for every direct change, the `var()`
 * uses of the changed token and of every token that takes its value from it. Removed and renamed
 * tokens are followed in the base graph, where the code's names still point at them; the rest in
 * the head. Sorted by effect, then by how many places a change reaches.
 */
export function impactOf(
  cs: Changeset,
  base: DsGraph,
  head: DsGraph,
  code: CodeIndex,
  opts: { prefix?: string } = {},
): Impact {
  const inBase = usesByToken(base, code, opts.prefix)
  const inHead = usesByToken(head, code, opts.prefix)
  const changes: ChangeImpact[] = []
  const broken = new Set<string>()
  const different = new Set<string>()
  const files = new Set<string>()

  for (const c of cs.changes) {
    if (
      c.origin !== 'direct' ||
      IGNORED.has(c.kind) ||
      c.kind.startsWith('context.') ||
      c.kind.startsWith('modifier.')
    )
      continue
    const gone = c.kind === 'token.removed' || c.kind === 'token.renamed'
    const graph = gone ? base : head
    const index = gone ? inBase : inHead
    const root = c.kind === 'token.renamed' ? (c.from ?? c.target) : c.target
    // A removed or renamed token breaks only its own uses: tokens that referenced it are changes of their own.
    const reached = gone ? [root] : [root, ...graph.dependents(root, { transitive: true })]
    const sites: ImpactSite[] = []
    const seen = new Set<string>()
    for (const id of reached)
      for (const u of index.get(id) ?? []) {
        const k = siteKey(u)
        if (seen.has(k)) continue
        seen.add(k)
        sites.push({ ...u, token: id })
      }
    if (sites.length === 0) continue
    const effect = BREAKS.has(c.kind) ? 'breaks' : 'changes'
    for (const s of sites) {
      ;(effect === 'breaks' ? broken : different).add(siteKey(s))
      files.add(s.file)
    }
    sites.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column)
    changes.push({ change: c.id, kind: c.kind, target: c.target, level: c.level, effect, sites })
  }
  for (const k of broken) different.delete(k)
  changes.sort(
    (a, b) =>
      Number(a.effect === 'changes') - Number(b.effect === 'changes') ||
      b.sites.length - a.sites.length ||
      a.target.localeCompare(b.target),
  )
  return { changes, breaks: broken.size, looksDifferent: different.size, files: [...files].sort() }
}
