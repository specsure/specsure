import type { Deprecated, Group, Origin, Ref, TypeSource } from '@dsgraph/schema'
import type { DiagnosticBag } from '../diagnostics.js'
import { isPlainObject, tokenId } from '../path.js'
import { getAt, parsePointer, toPointer } from '../pointer.js'
import { canonicalValue, INTERNAL_TYPES, STANDARD_TYPES } from '../values/canonical.js'
import { looseColor } from '../values/color.js'
import type { ValueContext } from '../values/context.js'
import {
  type ColorModifier,
  type ExpressionHint,
  evaluateExpression,
  modifyColor,
  serializeForExpression,
} from '../values/expression.js'
import type { FlatDoc, RawToken } from './flatten.js'
import { parseExtendsTarget } from './merge.js'

export interface ResolvedToken {
  id: string
  path: string[]
  type: string | null
  typeSource: TypeSource | null
  /** `$value` as authored (after merge), references not substituted. */
  raw: unknown
  /** Canonical value with every reference substituted, or null. */
  value: unknown
  refs: Ref[]
  description?: string
  deprecated: Deprecated | null
  extensions?: Record<string, unknown>
  origin: Origin
  inheritedFrom: string | null
  flags: string[]
}

export interface ResolveOptions {
  strict: boolean
  allowNonstandardUnits?: boolean
  /** Sources with their own type vocabulary (Tokens Studio): unknown types are flagged, not reported. */
  allowNonstandardTypes?: boolean
}

export interface ResolvedDoc {
  tokens: Map<string, ResolvedToken>
  groups: Group[]
}

const CURLY = /^\{([^{}]+)\}$/
const EMBEDDED = /\{([^{}]+)\}/g

/** `$extensions["dev.dsgraph"]` as adapters write it. */
interface DevExtension {
  expression?: boolean | { unit?: string }
  colorModifier?: { type: string; value: unknown; space?: string; color?: unknown }
}
const devExtension = (node: Record<string, unknown>): DevExtension | undefined => {
  const ext = node.$extensions
  return isPlainObject(ext) && isPlainObject(ext['dev.dsgraph'])
    ? (ext['dev.dsgraph'] as DevExtension)
    : undefined
}
const HINT_BY_KEY: Record<string, ExpressionHint> = {
  color: 'color',
  fontSize: 'dimension',
  letterSpacing: 'dimension',
  offsetX: 'dimension',
  offsetY: 'dimension',
  blur: 'dimension',
  spread: 'dimension',
  width: 'dimension',
  lineHeight: 'number',
  alpha: 'number',
}
const HINT_BY_TYPE: Record<string, ExpressionHint> = {
  color: 'color',
  dimension: 'dimension',
  number: 'number',
  fontWeight: 'number',
}

interface Target {
  id: string
  /** Pointer segments inside the target's value (property-level `$ref`). */
  path?: string[]
}

/**
 * Resolves types, references and canonical values of a merged, `$extends`-expanded document
 * (Format 2025.10 sections 5.2.2, 7; Resolver 2025.10 section 6.3).
 */
export function resolveDoc(doc: FlatDoc, diag: DiagnosticBag, opts: ResolveOptions): ResolvedDoc {
  const typeMemo = new Map<string, { type: string | null; source: TypeSource | null }>()
  const rawMemo = new Map<string, { value: unknown; refs: Ref[]; ok: boolean }>()
  const cyclic = new Set<string>()
  const reported = new Set<string>()

  const loc = (t: RawToken) => t.origin

  /** Parses a reference expression at any position: `"{a.b}"` or `{ "$ref": "#/a/b/$value/x" }`. */
  const parseRef = (v: unknown, t: RawToken): Target | null | undefined => {
    if (typeof v === 'string') {
      const m = CURLY.exec(v)
      return m ? { id: m[1]! } : undefined
    }
    if (isPlainObject(v) && typeof v.$ref === 'string' && Object.keys(v).length === 1) {
      const segs = parsePointer(v.$ref)
      if (!segs) {
        diag.error('dtcg/invalid-reference', `Malformed JSON Pointer "${v.$ref}"`, loc(t))
        return null
      }
      const i = segs.indexOf('$value')
      if (i >= 0) return { id: tokenId(segs.slice(0, i)), path: segs.slice(i + 1) }
      if (segs.length > 0 && segs[segs.length - 1]!.startsWith('$')) {
        diag.error('dtcg/invalid-reference', `References to "${segs.at(-1)}" are not supported`, loc(t))
        return null
      }
      return { id: tokenId(segs) }
    }
    return undefined
  }

  const typeOf = (id: string, stack: string[] = []): { type: string | null; source: TypeSource | null } => {
    const memo = typeMemo.get(id)
    if (memo) return memo
    const t = doc.tokens.get(id)
    if (!t) return { type: null, source: null }
    let result: { type: string | null; source: TypeSource | null } = { type: null, source: null }
    if (typeof t.node.$type === 'string') {
      const inferred = (t.node.$extensions as Record<string, { typeInferred?: boolean }> | undefined)?.[
        'dev.dsgraph'
      ]?.typeInferred
      result = { type: t.node.$type, source: inferred ? 'inferred' : 'explicit' }
    } else {
      const ref = parseRef(t.node.$value, t)
      if (ref && !ref.path && doc.tokens.has(ref.id) && !stack.includes(ref.id)) {
        const target = typeOf(ref.id, [...stack, id])
        if (target.type) result = { type: target.type, source: 'alias' }
      }
      if (!result.type) {
        for (let i = t.path.length - 1; i >= 0; i--) {
          const g = doc.groups.get(tokenId(t.path.slice(0, i)))
          if (g?.props.type) {
            result = { type: g.props.type, source: 'inherited' }
            break
          }
        }
      }
    }
    typeMemo.set(id, result)
    return result
  }

  const resolveRaw = (id: string, stack: string[]): { value: unknown; refs: Ref[]; ok: boolean } => {
    const memo = rawMemo.get(id)
    if (memo) return memo
    const t = doc.tokens.get(id)!
    const refs: Ref[] = []
    let ok = true
    const dev = devExtension(t.node)
    const expression = dev?.expression
    const defaultUnit = typeof expression === 'object' ? expression.unit : undefined

    const follow = (target: Target, at: string[]): unknown => {
      const property = at.length > 0 ? toPointer(at) : undefined
      if (!doc.tokens.has(target.id)) {
        if (doc.groups.has(target.id))
          diag.error(
            'dtcg/reference-to-group',
            `"${target.id}" is a group; references must target tokens`,
            loc(t),
          )
        else diag.error('dtcg/unknown-reference', `Reference to unknown token "${target.id}"`, loc(t))
        ok = false
        return undefined
      }
      const ref: Ref = { to: target.id }
      if (property) ref.property = property
      if (target.path && target.path.length > 0) ref.targetPath = toPointer(target.path)
      refs.push(ref)
      if (stack.includes(target.id) || target.id === id) {
        const cycle = [...stack.slice(stack.indexOf(target.id)), id]
        for (const member of cycle) cyclic.add(member)
        ok = false
        return undefined
      }
      const r = resolveRaw(target.id, [...stack, id])
      if (!r.ok) {
        ok = false
        return undefined
      }
      if (!target.path || target.path.length === 0) return r.value
      const found = getAt(r.value, target.path)
      if (!found.found) {
        diag.error(
          'dtcg/invalid-reference',
          `"${toPointer(target.path)}" not found in "${target.id}"`,
          loc(t),
        )
        ok = false
        return undefined
      }
      return found.value
    }

    /** Text with references inside (`{a} * 2`, `rgba({ink}, 0.5)`), evaluated after substitution. */
    const evaluate = (text: string, at: string[], hint: ExpressionHint): unknown => {
      let failed = false
      const substituted = text.replace(EMBEDDED, (whole, target: string) => {
        const v = follow({ id: target.trim() }, at)
        const s = v === undefined ? undefined : serializeForExpression(v)
        if (s === undefined) failed = true
        return s ?? whole
      })
      if (failed) {
        ok = false
        return undefined
      }
      const value = evaluateExpression(substituted, hint, defaultUnit)
      if (value === undefined) {
        diag.error('dtcg/invalid-expression', `Cannot evaluate "${text}"`, loc(t))
        ok = false
      }
      return value
    }

    const substitute = (v: unknown, at: string[]): unknown => {
      const ref = parseRef(v, t)
      if (ref === null) {
        ok = false
        return undefined
      }
      if (ref) return follow(ref, at)
      if (expression && typeof v === 'string' && v.includes('{')) {
        const type = typeOf(id).type
        const hint = at.length === 0 ? HINT_BY_TYPE[type ?? ''] : HINT_BY_KEY[at[at.length - 1]!]
        return evaluate(v, at, hint)
      }
      if (Array.isArray(v)) return v.map((item, i) => substitute(item, [...at, String(i)]))
      if (isPlainObject(v)) {
        const out: Record<string, unknown> = {}
        for (const [k, item] of Object.entries(v)) out[k] = substitute(item, [...at, k])
        return out
      }
      return v
    }

    // Seed the memo to stop infinite recursion on cycles discovered deeper in the chain.
    rawMemo.set(id, { value: undefined, refs, ok: false })
    let value = substitute(t.node.$value, [])
    const mod = dev?.colorModifier
    if (mod && ok) value = applyModifier(value, mod)
    const result = { value, refs, ok: ok && !cyclic.has(id) }
    rawMemo.set(id, result)
    return result

    function applyModifier(base: unknown, mod: NonNullable<DevExtension['colorModifier']>): unknown {
      const color = looseColor(base)
      let amount = mod.value
      if (typeof amount === 'string') {
        const whole = parseRef(amount, t)
        amount = whole ? follow(whole, []) : amount.includes('{') ? evaluate(amount, [], 'number') : amount
        if (typeof amount === 'string') amount = evaluateExpression(amount, 'number')
      }
      let withColor: unknown = mod.color
      if (typeof withColor === 'string' && CURLY.test(withColor))
        withColor = follow(parseRef(withColor, t)!, [])
      const m: ColorModifier = {
        type: mod.type as ColorModifier['type'],
        amount: typeof amount === 'number' ? amount : Number.NaN,
        space: mod.space ?? 'srgb',
      }
      const w = looseColor(withColor)
      if (w) m.with = w
      const out = color ? modifyColor(color, m) : undefined
      if (out === undefined) {
        if (ok)
          diag.error('dtcg/invalid-color-modifier', `Cannot apply the "${mod.type}" color modifier`, loc(t))
        ok = false
      }
      return out
    }
  }

  const deprecationOf = (t: RawToken): Deprecated | null => {
    let dep: unknown = t.node.$deprecated
    if (dep === undefined) {
      for (let i = t.path.length - 1; i >= 0; i--) {
        const g = doc.groups.get(tokenId(t.path.slice(0, i)))
        if (g?.props.deprecated !== undefined) {
          dep = g.props.deprecated
          break
        }
      }
    }
    if (dep === true) return {}
    if (typeof dep === 'string') {
      const d: Deprecated = { reason: dep }
      const m = /\{([^{}]+)\}/.exec(dep)
      if (m && doc.tokens.has(m[1]!)) d.replacement = m[1]!
      return d
    }
    return null
  }

  const tokens = new Map<string, ResolvedToken>()
  for (const id of [...doc.tokens.keys()].sort()) {
    const t = doc.tokens.get(id)!
    const flags = new Set(t.flags)
    const { type, source } = typeOf(id)
    if (!type) diag.error('dtcg/untyped', `Token "${id}" has no $type and none can be inherited`, loc(t))
    else if (!STANDARD_TYPES.has(type) && !INTERNAL_TYPES.has(type)) {
      if (opts.allowNonstandardTypes && !opts.strict) {
        /* the source's own type: flagged below */
      } else if (opts.strict) diag.error('dtcg/unknown-type', `"${type}" is not a DTCG 2025.10 type`, loc(t))
      else diag.warn('dtcg/unknown-type', `"${type}" is not a DTCG 2025.10 type`, loc(t))
      flags.add('nonstandard-type')
    }

    const resolved = resolveRaw(id, [])
    if (cyclic.has(id) && !reported.has(id)) {
      reported.add(id)
      diag.error('dtcg/alias-cycle', `Token "${id}" is part of a circular reference chain`, loc(t))
    }

    // Whole-value alias type check.
    const whole = parseRef(t.node.$value, t)
    if (whole && !whole.path && type && source === 'explicit' && doc.tokens.has(whole.id)) {
      const targetType = typeOf(whole.id).type
      if (targetType && targetType !== type)
        diag.error(
          'dtcg/alias-type-mismatch',
          `"${id}" is ${type} but references ${targetType} "${whole.id}"`,
          loc(t),
        )
    }

    let value: unknown = null
    if (type && resolved.ok) {
      const ctx: ValueContext = {
        strict: opts.strict,
        allowNonstandardUnits: opts.allowNonstandardUnits ?? false,
        diag,
        loc: loc(t),
        flags,
      }
      const v = canonicalValue(type, resolved.value, ctx)
      value = v === undefined ? null : v
    } else if (!resolved.ok) {
      flags.add('unresolved')
    }

    // CSS expressions keep their text; references inside them still count as edges.
    if (type === 'css-expression' && typeof t.node.$value === 'string') {
      for (const m of t.node.$value.matchAll(/var\(\s*--([\w-]+)/g)) {
        const to = m[1]!
        if (doc.tokens.has(to) && !resolved.refs.some((r) => r.to === to)) resolved.refs.push({ to })
      }
    }
    if (source === 'inferred') flags.add('type-inferred')

    const token: ResolvedToken = {
      id,
      path: t.path,
      type,
      typeSource: source,
      raw: t.node.$value,
      value,
      refs: resolved.refs,
      deprecated: deprecationOf(t),
      origin: t.origin,
      inheritedFrom: t.inheritedFrom,
      flags: [...flags].sort(),
    }
    if (typeof t.node.$description === 'string') token.description = t.node.$description
    if (isPlainObject(t.node.$extensions)) token.extensions = t.node.$extensions
    tokens.set(id, token)
  }

  const groups: Group[] = []
  for (const [id, g] of [...doc.groups].sort(([a], [b]) => a.localeCompare(b))) {
    if (id === '') continue
    const group: Group = { id, path: g.path, origin: g.origin }
    if (g.props.type) group.type = g.props.type
    if (g.props.description) group.description = g.props.description
    if (g.props.deprecated === true) group.deprecated = {}
    else if (typeof g.props.deprecated === 'string') group.deprecated = { reason: g.props.deprecated }
    const ext = g.props.extends !== undefined ? parseExtendsTarget(g.props.extends) : null
    if (ext) group.extends = ext
    if (g.props.extensions) group.extensions = g.props.extensions
    groups.push(group)
  }
  return { tokens, groups }
}
