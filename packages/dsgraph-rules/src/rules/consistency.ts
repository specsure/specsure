import { type ColorValue, colorToHex, type DsGraph, type Token, type TokenValue } from '@dsgraph/core'
import type { Rule } from '../types.js'

const whenText = (when: Record<string, string>) =>
  Object.entries(when)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ')

const px = (v: unknown): number | undefined => {
  const d = v as { value?: unknown; unit?: unknown } | null
  if (!d || typeof d.value !== 'number') return undefined
  return d.unit === 'rem' ? d.value * 16 : d.unit === 'px' ? d.value : undefined
}

/** A value nobody would set on purpose next to real ones: an empty string, a 0 weight, a 0 size. */
function emptiness(type: string | null, v: TokenValue): string | undefined {
  const raw = v.raw
  if (raw === '' || (Array.isArray(v.value) && v.value.every((x) => x === ''))) return 'empty'
  if (type === 'fontWeight' && raw === 0) return '0'
  if (type === 'dimension' && px(v.value) === 0) return '0px'
  return undefined
}

/** A value as people read it: a size in px, a color as hex, otherwise as written. */
const shown = (v: TokenValue): string => {
  const size = px(v.value)
  if (size !== undefined) return `${size}px`
  const c = v.value as ColorValue | null
  if (c && typeof c === 'object' && 'space' in c) return colorToHex(c)
  if (Array.isArray(v.value) && v.value.every((x) => typeof x === 'string')) return v.value.join(', ') || '""'
  return typeof v.raw === 'string' ? v.raw || '""' : JSON.stringify(v.raw)
}

export const emptyInContext: Rule = {
  id: 'context/empty-value',
  description: 'A token has a value in some themes or modes and an empty one (0, "") in another.',
  defaultSeverity: 'warning',
  run({ graph, report }) {
    for (const t of graph.tokens()) {
      const set = t.values.filter((v) => Object.keys(v.when ?? {}).length)
      if (set.length < 2) continue
      const empty = set.filter((v) => emptiness(t.type, v))
      const full = set.filter((v) => !emptiness(t.type, v))
      if (!empty.length || !full.length) continue
      for (const v of empty)
        report({
          message: `"${t.id}" is ${emptiness(t.type, v)} in ${whenText(v.when)}, while ${whenText(full[0]!.when)} has ${shown(full[0]!)}: the value was probably never set`,
          nodes: [t.id],
          when: v.when,
          evidence: { empty: v.raw, other: full[0]!.raw, otherWhen: full[0]!.when },
          token: t,
        })
    }
  },
}

export const literalInContext: Rule = {
  id: 'context/literal-value',
  description:
    'A token references other tokens in every theme or mode but one, where its value is written by hand.',
  defaultSeverity: 'info',
  run({ graph, report }) {
    for (const t of graph.tokens()) {
      const set = t.values.filter((v) => Object.keys(v.when ?? {}).length)
      if (set.length < 2) continue
      const alias = (v: TokenValue) => v.refs.some((r) => !r.property)
      const literal = set.filter((v) => !alias(v))
      if (literal.length !== 1 || set.length - literal.length < 1) continue
      const v = literal[0]!
      // An empty value is reported by context/empty-value.
      if (emptiness(t.type, v)) continue
      report({
        message: `"${t.id}" is written by hand in ${whenText(v.when)} (${shown(v)}), while every other value references a token`,
        nodes: [t.id],
        when: v.when,
        evidence: { value: v.raw },
        token: t,
      })
    }
  },
}

/** A field of a typography token in px, through its reference or as written. */
function fieldPx(graph: DsGraph, t: Token, field: string): number | undefined {
  const v = t.values[0]
  if (!v) return undefined
  const ref = v.refs.find((r) => r.property === `/${field}`)
  if (ref) return px(graph.value(ref.to, v.when))
  return px((v.raw as Record<string, unknown> | null)?.[field])
}

const NUM = String.raw`(-?\d+(?:[.,]\d+)?)`
const num = (s: string) => Number(s.replace(',', '.'))

/**
 * Numbers a description states about a token's value: `13 · …` for a size, `16/25` (size and line
 * height) and `−1.2%` (tracking) for typography. Each is compared with the value it describes.
 */
export const descriptionMismatch: Rule = {
  id: 'description/value-mismatch',
  description: 'A number in a token’s description no longer matches its value.',
  defaultSeverity: 'warning',
  run({ graph, report }) {
    const say = (t: Token, what: string, said: number, is: number) =>
      report({
        message: `"${t.id}": the description says ${what ? `${what} ` : ''}${said}, the value is ${is}`,
        nodes: [t.id],
        evidence: { description: t.description, said, value: is },
        token: t,
      })
    for (const t of graph.tokens()) {
      const d = t.description?.trim()
      if (!d) continue
      if (t.type === 'dimension') {
        const m = new RegExp(String.raw`^${NUM}\s*(?:px)?\s*(?:·|—|–|:|$)`).exec(d)
        if (!m) continue
        const said = num(m[1]!)
        const values = t.values.map((v) => px(v.value)).filter((x): x is number => x !== undefined)
        if (values.length && !values.some((x) => Math.abs(x - said) < 0.01)) say(t, '', said, values[0]!)
      } else if (t.type === 'typography') {
        const size = fieldPx(graph, t, 'fontSize')
        const pair = new RegExp(String.raw`(?:^|\s)${NUM}\s*/\s*${NUM}(?=\s|$|·)`).exec(d)
        if (pair && size !== undefined) {
          const line = fieldPx(graph, t, 'lineHeight')
          if (Math.abs(num(pair[1]!) - size) > 0.01) say(t, 'size', num(pair[1]!), size)
          else if (line !== undefined && Math.abs(num(pair[2]!) - line) > 0.01)
            say(t, 'line height', num(pair[2]!), line)
        }
        const pct = new RegExp(String.raw`${NUM.replace('-?', '[-−]?')}\s*%`).exec(d)
        const tracking = fieldPx(graph, t, 'letterSpacing')
        if (pct && size && tracking !== undefined) {
          const said = num(pct[1]!.replace('−', '-'))
          const is = Math.round((tracking / size) * 1000) / 10
          if (Math.abs(said - is) > 0.15) say(t, 'tracking %', said, is)
        }
      }
    }
  },
}

const FIELDS = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing']

/**
 * A field most typography tokens take from a token, written by hand in one of them: the style
 * stops following the system when that token changes.
 */
export const unlinkedTypographyField: Rule = {
  id: 'typography/unlinked-field',
  description: 'A typography field is written by hand where most typography tokens reference a token.',
  defaultSeverity: 'warning',
  run({ graph, report }) {
    const all = graph.tokens({ type: 'typography' })
    if (all.length < 4) return
    const linked = (t: Token, f: string) => t.values.some((v) => v.refs.some((r) => r.property === `/${f}`))
    for (const f of FIELDS) {
      const by = all.filter((t) => linked(t, f))
      if (by.length / all.length < 0.75) continue
      for (const t of all) {
        if (linked(t, f)) continue
        const raw = (t.values[0]?.raw as Record<string, unknown> | null)?.[f]
        if (raw === undefined) continue
        report({
          message: `"${t.id}" writes ${f} by hand (${JSON.stringify(raw)}); ${by.length} of ${all.length} typography tokens take it from a token`,
          nodes: [t.id],
          evidence: { field: f, value: raw, linked: by.length, total: all.length },
          token: t,
        })
      }
    }
  },
}
