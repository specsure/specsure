import {
  CHANGESET_SCHEMA,
  type Change,
  type ChangeKind,
  type Changeset,
  canonicalize,
  type Level,
  sha256Hex,
  type Token,
  type When,
} from '@dsgraph/schema'
import type { DsGraph } from '../graph.js'
import { enumerateInputs, type Input } from '../resolver/system.js'
import { type CompareOptions, compareValues, DEFAULT_COMPARE } from '../values/compare.js'
import { detectRenames } from './rename.js'
import { LEVEL_RANK, levelOf, maxLevel, mergePolicy, type SemverPolicy } from './semver.js'

export interface DiffOptions {
  compare?: Partial<CompareOptions>
  /** Explicit renames: old path → new path. */
  renames?: Record<string, string>
  /** `$extensions` keys ignored when comparing (e.g. volatile timestamps). */
  ignoreExtensions?: string[]
  semver?: Parameters<typeof mergePolicy>[0]
  /** Layers with `public: false` are capped at patch. */
  layers?: Record<string, { public?: boolean }>
}

type Draft = Omit<Change, 'id' | 'level'>

/** Compares two snapshots (spec section 5) and classifies every change (section 6). */
export async function diff(base: DsGraph, head: DsGraph, opts: DiffOptions = {}): Promise<Changeset> {
  const compare: CompareOptions = { ...DEFAULT_COMPARE, ...opts.compare }
  const policy: SemverPolicy = mergePolicy(opts.semver)
  const drafts: Draft[] = []
  const draft = (d: Partial<Draft> & Pick<Draft, 'kind' | 'target'>): Draft => {
    const full: Draft = { when: null, origin: 'direct', cause: [], confidence: 1, ...d }
    drafts.push(full)
    return full
  }

  // 1. Contexts.
  const bm = new Map(base.modifiers.map((m) => [m.name, m]))
  const hm = new Map(head.modifiers.map((m) => [m.name, m]))
  for (const name of bm.keys()) if (!hm.has(name)) draft({ kind: 'modifier.removed', target: name })
  for (const name of hm.keys()) if (!bm.has(name)) draft({ kind: 'modifier.added', target: name })
  const common = [...bm.keys()].filter((n) => hm.has(n))
  for (const name of common) {
    const bc = bm.get(name)!.contexts
    const hc = hm.get(name)!.contexts
    for (const c of bc) if (!hc.includes(c)) draft({ kind: 'context.removed', target: `${name}:${c}` })
    for (const c of hc) if (!bc.includes(c)) draft({ kind: 'context.added', target: `${name}:${c}` })
  }
  const shared = common.map((name) => ({
    name,
    contexts: bm.get(name)!.contexts.filter((c) => hm.get(name)!.contexts.includes(c)),
  }))
  const extra: Input = {}
  for (const m of [...base.modifiers, ...head.modifiers])
    if (!common.includes(m.name)) extra[m.name] = m.default ?? m.contexts[0]!
  const inputs = enumerateInputs(shared).map((i) => ({ ...extra, ...i }))
  const sharedNames = shared.map((m) => m.name)

  // 2–3. Match by id, then renames.
  const baseIds = new Set(base.snapshot.nodes.tokens.map((t) => t.id))
  const headIds = new Set(head.snapshot.nodes.tokens.map((t) => t.id))
  const removed = [...baseIds].filter((id) => !headIds.has(id)).sort()
  const added = [...headIds].filter((id) => !baseIds.has(id)).sort()
  const { renames, ambiguous } = detectRenames(base, head, removed, added, inputs, {
    hints: opts.renames,
    compare,
  })
  const renamedFrom = new Map(renames.map((r) => [r.from, r]))
  const renamedTo = new Set(renames.map((r) => r.to))

  for (const id of removed) {
    if (renamedFrom.has(id)) continue
    const d = draft({ kind: 'token.removed', target: id, before: summarize(base.token(id)!) })
    const possible = ambiguous.get(id)
    if (possible) {
      d.possibleRenames = possible
      d.note = 'Several tokens with equal values and similar paths were added; rename not assumed.'
    }
  }
  for (const id of added)
    if (!renamedTo.has(id)) draft({ kind: 'token.added', target: id, after: summarize(head.token(id)!) })
  for (const r of renames)
    draft({ kind: 'token.renamed', target: r.to, from: r.from, confidence: r.confidence })

  // 4. Common and renamed tokens.
  const pairs: Array<[string, string]> = [
    ...[...baseIds].filter((id) => headIds.has(id)).map((id): [string, string] => [id, id]),
    ...renames.map((r): [string, string] => [r.from, r.to]),
  ]
  const ignore = new Set(opts.ignoreExtensions ?? [])
  for (const [bid, hid] of pairs.sort((a, b) => a[1].localeCompare(b[1]))) {
    const b = base.token(bid)!
    const h = head.token(hid)!
    if (b.type !== h.type) draft({ kind: 'token.type-changed', target: hid, before: b.type, after: h.type })

    const perInput: Array<{ input: Input; sig: string; d: Partial<Draft> & Pick<Draft, 'kind'> }> = []
    for (const input of inputs) {
      const bv = base.entry(bid, input)
      const hv = head.entry(hid, input)
      if (bv && !hv) {
        perInput.push({ input, sig: 'missing', d: { kind: 'token.missing-in-context', before: bv.value } })
        continue
      }
      if (!bv || !hv) continue
      const rawSame = canonicalize(bv.raw) === canonicalize(hv.raw)
      const r =
        b.type === h.type
          ? compareValues(h.type, bv.value, hv.value, compare)
          : { result: 'changed' as const }
      let d: (Partial<Draft> & Pick<Draft, 'kind'>) | undefined
      if (r.result === 'changed') {
        d = {
          kind: 'token.value-changed',
          origin: rawSame ? 'propagated' : 'direct',
          before: { raw: bv.raw, value: bv.value },
          after: { raw: hv.raw, value: hv.value },
        }
        if ('delta' in r && r.delta) d.delta = r.delta
      } else if (!rawSame) {
        const refsSame = canonicalize(bv.refs) === canonicalize(hv.refs)
        d = refsSame
          ? { kind: 'token.notation-changed', before: { raw: bv.raw }, after: { raw: hv.raw } }
          : { kind: 'token.alias-retargeted', before: { raw: bv.raw }, after: { raw: hv.raw } }
      }
      if (d) perInput.push({ input, sig: canonicalize(d), d })
    }
    for (const { when, d } of compressByWhen(perInput, inputs, sharedNames))
      draft({ ...d, target: hid, when })

    const bInfl = influencing(b)
    const hInfl = influencing(h)
    if (canonicalize(bInfl) !== canonicalize(hInfl))
      draft({ kind: 'token.contexts-changed', target: hid, before: bInfl, after: hInfl })

    if (!b.deprecated && h.deprecated) draft({ kind: 'token.deprecated', target: hid, after: h.deprecated })
    if (b.deprecated && !h.deprecated)
      draft({ kind: 'token.undeprecated', target: hid, before: b.deprecated })
    if ((b.description ?? '') !== (h.description ?? ''))
      draft({ kind: 'token.description-changed', target: hid, before: b.description, after: h.description })
    if (canonicalize(stripExt(b.extensions, ignore)) !== canonicalize(stripExt(h.extensions, ignore)))
      draft({ kind: 'token.extensions-changed', target: hid })
  }

  // 6. Groups: $extends.
  const bg = new Map(base.snapshot.nodes.groups.map((g) => [g.id, g]))
  for (const g of head.snapshot.nodes.groups) {
    const prev = bg.get(g.id)
    if (prev && (prev.extends ?? null) !== (g.extends ?? null))
      draft({ kind: 'group.extends-changed', target: g.id, before: prev.extends, after: g.extends })
  }

  // 5. Causes of propagated value changes.
  const directValue = new Map<string, Draft[]>()
  for (const d of drafts)
    if (d.kind === 'token.value-changed' && d.origin === 'direct')
      directValue.set(d.target, [...(directValue.get(d.target) ?? []), d])

  // 7. Ids and levels.
  const changes: Change[] = []
  const idOf = new Map<Draft, string>()
  for (const d of drafts)
    idOf.set(
      d,
      `chg_${(await sha256Hex(canonicalize({ k: d.kind, t: d.target, w: d.when, f: d.from }))).slice(0, 12)}`,
    )
  for (const d of drafts) {
    if (d.kind === 'token.value-changed' && d.origin === 'propagated') {
      const deps = head.dependencies(d.target, { transitive: true })
      d.cause = deps.flatMap((dep) => (directValue.get(dep) ?? []).map((c) => idOf.get(c)!)).sort()
    }
    const token = d.kind.startsWith('token.') ? (head.token(d.target) ?? base.token(d.target)) : undefined
    const isPublic = token?.layer ? opts.layers?.[token.layer]?.public !== false : true
    changes.push({ ...d, id: idOf.get(d)!, level: levelOf(d, policy, isPublic) })
  }
  changes.sort(
    (a, b) =>
      LEVEL_RANK[b.level] - LEVEL_RANK[a.level] ||
      a.target.localeCompare(b.target) ||
      a.kind.localeCompare(b.kind) ||
      canonicalize(a.when).localeCompare(canonicalize(b.when)),
  )

  const counts: Record<string, number> = {
    added: 0,
    removed: 0,
    renamed: 0,
    changed: 0,
    propagated: 0,
    deprecated: 0,
  }
  for (const c of changes) {
    if (c.kind === 'token.added') counts.added!++
    else if (c.kind === 'token.removed') counts.removed!++
    else if (c.kind === 'token.renamed') counts.renamed!++
    else if (c.kind === 'token.value-changed')
      c.origin === 'direct' ? counts.changed!++ : counts.propagated!++
    else if (c.kind === 'token.deprecated') counts.deprecated!++
  }
  const level = maxLevel(changes.map((c) => c.level))
  return {
    schema: CHANGESET_SCHEMA,
    base: { hash: base.snapshot.hash, source: base.snapshot.source },
    head: { hash: head.snapshot.hash, source: head.snapshot.source },
    contexts: { compared: inputs, partial: base.snapshot.contexts.partial || head.snapshot.contexts.partial },
    summary: { counts, level, reasons: reasons(changes, level) },
    changes,
    diagnostics: [],
  }
}

function summarize(t: Token) {
  return { type: t.type, values: t.values.map((v) => ({ when: v.when, raw: v.raw, value: v.value })) }
}

function influencing(t: Token): string[] {
  const names = new Set<string>()
  for (const v of t.values) for (const k of Object.keys(v.when)) names.add(k)
  return [...names].sort()
}

function stripExt(ext: Record<string, unknown> | undefined, ignore: Set<string>) {
  if (!ext) return {}
  return Object.fromEntries(Object.entries(ext).filter(([k]) => !ignore.has(k)))
}

/**
 * Collapses identical per-input changes into the smallest `when` that covers exactly
 * the inputs where they occur; falls back to full inputs otherwise.
 */
function compressByWhen<T>(
  perInput: Array<{ input: Input; sig: string; d: T }>,
  inputs: Input[],
  names: string[],
): Array<{ when: When | null; d: T }> {
  const groups = new Map<string, { d: T; inputs: Input[] }>()
  for (const p of perInput) {
    const g = groups.get(p.sig) ?? { d: p.d, inputs: [] }
    g.inputs.push(p.input)
    groups.set(p.sig, g)
  }
  const out: Array<{ when: When | null; d: T }> = []
  for (const g of groups.values()) {
    const when: When = {}
    for (const n of names) {
      const values = new Set(g.inputs.map((i) => i[n]))
      if (values.size === 1) when[n] = [...values][0]!
    }
    const covered = inputs.filter((i) => Object.entries(when).every(([k, v]) => i[k] === v))
    if (covered.length === g.inputs.length) out.push({ when: Object.keys(when).length ? when : null, d: g.d })
    else
      for (const i of g.inputs) out.push({ when: Object.fromEntries(names.map((n) => [n, i[n]!])), d: g.d })
  }
  return out
}

const KIND_LABEL: Partial<Record<ChangeKind, string>> = {
  'token.removed': 'removed',
  'token.renamed': 'renamed',
  'token.type-changed': 'changed type',
  'token.missing-in-context': 'missing in a context',
  'context.removed': 'context removed',
  'modifier.removed': 'modifier removed',
  'token.added': 'added',
  'token.value-changed': 'value changed',
  'token.deprecated': 'deprecated',
  'context.added': 'context added',
  'modifier.added': 'modifier added',
}

function reasons(changes: Change[], level: Level): string[] {
  const counts = new Map<string, number>()
  for (const c of changes) {
    if (c.level !== level || level === 'none') continue
    const label = KIND_LABEL[c.kind] ?? c.kind
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return [...counts].map(([label, n]) => `${n} ${label}`)
}
