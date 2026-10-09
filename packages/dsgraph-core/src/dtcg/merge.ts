import type { DiagnosticBag } from '../diagnostics.js'
import { tokenId } from '../path.js'
import { parsePointer } from '../pointer.js'
import type { FlatDoc, GroupProps, RawGroup, RawToken } from './flatten.js'

const isUnder = (id: string, ancestor: string): boolean => ancestor === '' || id.startsWith(`${ancestor}.`)

/**
 * Merges documents in order (Resolver 2025.10, section 6.2): groups merge deeply,
 * a token is replaced as a whole, the last occurrence wins.
 */
export function mergeDocs(docs: readonly FlatDoc[], diag: DiagnosticBag): FlatDoc {
  const tokens = new Map<string, RawToken>()
  const groups = new Map<string, RawGroup>()
  const layerOf = new Map<string, number>()

  docs.forEach((doc, layer) => {
    for (const [id, g] of doc.groups) {
      const prev = groups.get(id)
      groups.set(id, prev ? { ...g, props: { ...prev.props, ...definedProps(g.props) } } : g)
    }
    for (const [id, t] of doc.tokens) {
      tokens.set(id, t)
      layerOf.set(id, layer)
    }
  })

  // A path cannot be a token in one layer and a group with tokens in another.
  const descendantsOf = new Map<string, string[]>()
  for (const id of tokens.keys()) {
    const parts = id.split('.')
    for (let i = 1; i < parts.length; i++) {
      const ancestor = parts.slice(0, i).join('.')
      if (tokens.has(ancestor)) descendantsOf.set(ancestor, [...(descendantsOf.get(ancestor) ?? []), id])
    }
  }
  for (const id of [...descendantsOf.keys()].sort()) {
    if (!tokens.has(id)) continue
    const descendants = descendantsOf.get(id)!.filter((d) => tokens.has(d))
    if (descendants.length === 0) continue
    const tokenLayer = layerOf.get(id) ?? 0
    const newestDescendantLayer = Math.max(...descendants.map((d) => layerOf.get(d) ?? 0))
    const t = tokens.get(id)!
    diag.warn(
      'tokens/token-group-conflict',
      `"${id}" is a token in one source and a group in another; the later source wins`,
      t.origin,
    )
    if (tokenLayer >= newestDescendantLayer) {
      for (const d of descendants) tokens.delete(d)
    } else {
      tokens.delete(id)
    }
  }
  for (const id of tokens.keys()) groups.delete(id)
  return { tokens, groups }
}

function definedProps(p: GroupProps): GroupProps {
  const out: GroupProps = {}
  for (const [k, v] of Object.entries(p)) if (v !== undefined) (out as Record<string, unknown>)[k] = v
  return out
}

/** Parses a `$extends` value (`"{group}"` or `{ "$ref": "#/group" }`) into a group id. */
export function parseExtendsTarget(value: unknown): string | null {
  if (typeof value === 'string') {
    const m = /^\{([^{}]+)\}$/.exec(value)
    return m ? m[1]! : null
  }
  if (value !== null && typeof value === 'object' && typeof (value as { $ref?: unknown }).$ref === 'string') {
    const segs = parsePointer((value as { $ref: string }).$ref)
    return segs ? tokenId(segs) : null
  }
  return null
}

/**
 * Expands `$extends` (Format 2025.10, section 6.4) after merging: deep merge where local
 * definitions win and inherited tokens are copied whole. Mutates `doc`.
 */
export function expandExtends(doc: FlatDoc, diag: DiagnosticBag): void {
  const targets = new Map<string, string>()
  for (const [id, g] of doc.groups) {
    if (g.props.extends === undefined) continue
    const target = parseExtendsTarget(g.props.extends)
    if (target === null) {
      diag.error('dtcg/extends-invalid', '$extends must be "{group}" or a JSON Pointer reference', g.origin)
    } else if (doc.tokens.has(target)) {
      diag.error('dtcg/extends-invalid-target', `$extends points to token "${target}", not a group`, g.origin)
    } else if (!doc.groups.has(target)) {
      diag.error('dtcg/extends-unresolved', `$extends target group "${target}" not found`, g.origin)
    } else if (target === id || isUnder(id, target)) {
      diag.error('dtcg/extends-cycle', `Group "${id}" extends its own ancestor "${target}"`, g.origin)
    } else {
      targets.set(id, target)
    }
  }

  // Cycle detection across extension chains.
  const state = new Map<string, 'visiting' | 'done'>()
  const inCycle = new Set<string>()
  const visit = (id: string, stack: string[]): void => {
    const s = state.get(id)
    if (s === 'done') return
    if (s === 'visiting') {
      for (const member of stack.slice(stack.indexOf(id))) inCycle.add(member)
      return
    }
    state.set(id, 'visiting')
    const t = targets.get(id)
    if (t !== undefined) visit(t, [...stack, id])
    state.set(id, 'done')
  }
  for (const id of targets.keys()) visit(id, [])
  for (const id of inCycle) {
    diag.error('dtcg/extends-cycle', `Circular $extends chain involving "${id}"`, doc.groups.get(id)?.origin)
    targets.delete(id)
  }

  const expanded = new Set<string>()
  const expand = (id: string): void => {
    if (expanded.has(id)) return
    expanded.add(id)
    const target = targets.get(id)
    if (target === undefined) return
    expand(target)
    const group = doc.groups.get(id)!
    const source = doc.groups.get(target)!
    for (const key of ['type', 'description', 'deprecated', 'extensions'] as const) {
      if (group.props[key] === undefined && source.props[key] !== undefined)
        (group.props as Record<string, unknown>)[key] = source.props[key]
    }
    const rebase = (other: string) => (id === '' ? '' : `${id}.`) + other.slice(target.length + 1)
    for (const [gid, g] of [...doc.groups]) {
      if (gid === target || !isUnder(gid, target)) continue
      const nid = rebase(gid)
      if (!doc.groups.has(nid) && !doc.tokens.has(nid))
        doc.groups.set(nid, { ...g, id: nid, path: nid.split('.'), props: { ...g.props } })
    }
    for (const [tid, t] of [...doc.tokens]) {
      if (!isUnder(tid, target)) continue
      const nid = rebase(tid)
      if (doc.tokens.has(nid) || doc.groups.has(nid)) continue
      doc.tokens.set(nid, { ...t, id: nid, path: nid.split('.'), inheritedFrom: t.inheritedFrom ?? t.id })
    }
  }
  for (const id of [...targets.keys()].sort()) expand(id)
}
