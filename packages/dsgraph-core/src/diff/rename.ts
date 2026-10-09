import { canonicalize, type Token } from '@dsgraph/schema'
import type { DsGraph } from '../graph.js'
import type { Input } from '../resolver/system.js'
import { type CompareOptions, compareValues } from '../values/compare.js'

export interface RenameMatch {
  from: string
  to: string
  confidence: number
}

export interface RenameResult {
  renames: RenameMatch[]
  /** Removed tokens with several equally plausible candidates. */
  ambiguous: Map<string, string[]>
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length]!
}

/** Path similarity in [0, 1]: segment overlap, edit distance and same leaf. */
export function pathSimilarity(a: string, b: string): number {
  const sa = new Set(a.split('.'))
  const sb = new Set(b.split('.'))
  const inter = [...sa].filter((s) => sb.has(s)).length
  const jaccard = inter / new Set([...sa, ...sb]).size
  const lev = 1 - levenshtein(a, b) / Math.max(a.length, b.length, 1)
  return 0.5 * jaccard + 0.3 * lev + 0.2 * leafSimilarity(a.split('.').at(-1)!, b.split('.').at(-1)!)
}

/** 1 for the same leaf; partial credit for abbreviations (`sm` → `small`) and small edits. */
function leafSimilarity(a: string, b: string): number {
  if (a === b) return 1
  const prefix = a.startsWith(b) || b.startsWith(a) ? 0.8 : 0
  return Math.max(prefix, 1 - levenshtein(a, b) / Math.max(a.length, b.length, 1))
}

/**
 * Detects renames among removed × added tokens (spec section 5.3): explicit hints first,
 * then same type + equal values in all compared contexts + similar paths, assigned greedily.
 */
export function detectRenames(
  base: DsGraph,
  head: DsGraph,
  removed: string[],
  added: string[],
  inputs: Input[],
  opts: { hints?: Record<string, string>; compare: CompareOptions },
): RenameResult {
  const renames: RenameMatch[] = []
  const usedFrom = new Set<string>()
  const usedTo = new Set<string>()
  const addedSet = new Set(added)
  const removedSet = new Set(removed)

  const explicit = (from: string, to: string) => {
    if (!removedSet.has(from) || !addedSet.has(to) || usedFrom.has(from) || usedTo.has(to)) return
    renames.push({ from, to, confidence: 1 })
    usedFrom.add(from)
    usedTo.add(to)
  }
  for (const [from, to] of Object.entries(opts.hints ?? {})) explicit(from, to)
  for (const to of added) {
    const hint = (head.token(to)?.extensions?.['dev.dsgraph'] as { renamedFrom?: unknown } | undefined)
      ?.renamedFrom
    if (typeof hint === 'string') explicit(hint, to)
  }

  // How common each value is in head (shared values like white or 0 need closer paths).
  const valueCount = new Map<string, number>()
  for (const t of head.snapshot.nodes.tokens) {
    const k = canonicalize(head.entry(t.id)?.value)
    valueCount.set(k, (valueCount.get(k) ?? 0) + 1)
  }

  const sameValues = (b: Token, h: Token): boolean => {
    let compared = 0
    for (const input of inputs) {
      const bv = base.entry(b.id, input)
      const hv = head.entry(h.id, input)
      if (!bv || !hv) continue
      compared++
      const sameRaw = canonicalize(bv.raw) === canonicalize(hv.raw)
      if (!sameRaw && compareValues(b.type, bv.value, hv.value, opts.compare).result === 'changed')
        return false
    }
    return compared > 0
  }

  const candidates: Array<{ from: string; to: string; score: number }> = []
  for (const from of removed) {
    if (usedFrom.has(from)) continue
    const b = base.token(from)!
    for (const to of added) {
      if (usedTo.has(to)) continue
      const h = head.token(to)!
      if (b.type !== h.type || !sameValues(b, h)) continue
      let score = pathSimilarity(from, to)
      if (b.description && b.description === h.description) score += 0.1
      if (b.origin.file === h.origin.file) score += 0.05
      const common = (valueCount.get(canonicalize(head.entry(to)?.value)) ?? 0) > 2
      if (score < (common ? 0.7 : 0.5)) continue
      candidates.push({ from, to, score })
    }
  }

  const ambiguous = new Map<string, string[]>()
  const byFrom = new Map<string, Array<{ to: string; score: number }>>()
  for (const c of candidates) byFrom.set(c.from, [...(byFrom.get(c.from) ?? []), c])
  for (const [from, list] of byFrom) {
    list.sort((a, b) => b.score - a.score)
    if (list.length > 1 && list[0]!.score - list[1]!.score < 0.05)
      ambiguous.set(
        from,
        list.filter((c) => list[0]!.score - c.score < 0.05).map((c) => c.to),
      )
  }

  candidates.sort((a, b) => b.score - a.score || a.from.localeCompare(b.from) || a.to.localeCompare(b.to))
  for (const c of candidates) {
    if (usedFrom.has(c.from) || usedTo.has(c.to) || ambiguous.has(c.from)) continue
    renames.push({ from: c.from, to: c.to, confidence: Math.min(1, Math.round(c.score * 100) / 100) })
    usedFrom.add(c.from)
    usedTo.add(c.to)
  }
  return { renames, ambiguous }
}
