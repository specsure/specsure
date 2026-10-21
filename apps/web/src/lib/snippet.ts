import { scanCssText, scanFileText } from '@dsgraph/adapters'
import {
  type CodeIndex,
  type DsGraph,
  nearestTokens,
  normalizeName,
  type StyleContext,
  type Token,
  vocabularyOf,
} from '@dsgraph/core'
import { formatValue } from '@dsgraph/report'
import { check } from '@dsgraph/rules'
import { cssName } from './css-name'
import type { DemoAnswer, SnippetAnswer, SnippetEdit } from './lookup-types'

/** The lines inside a string literal: a value there can be replaced by `var()` without breaking the script. */
const inString = (line: string, at: number): boolean => {
  let quote = ''
  for (let i = 0; i < at; i++) {
    const ch = line[i]!
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = ''
    } else if (ch === '"' || ch === "'" || ch === '`') quote = ch
  }
  return quote !== ''
}

/**
 * The snippet with values written by hand replaced by tokens. Only exact matches are replaced; the
 * closest token for a value off the palette or the scale is a suggestion, left for a person.
 */
export function fixSnippet(g: DsGraph, text: string): Promise<SnippetAnswer> {
  const script = /<[a-z][\w-]*[\s>/]|\bclass(Name)?=/i.test(text)
  const sheet = !script && /[{}]/.test(text)
  const file = script ? 'snippet.tsx' : sheet ? 'snippet.scss' : 'snippet.css'
  const code: CodeIndex = { files: [file], uses: [], literals: [], skipped: [] }
  if (script || sheet) scanFileText(file, text, code)
  else scanCssText(file, text, code, { declarations: true })
  return check(g, {}, [], { code }).then((findings) => {
    const edits: SnippetEdit[] = []
    const lines = text.split('\n')
    const cursor = new Map<number, number>()
    const sorted = findings
      .filter((f) => /^style\//.test(f.rule) && f.loc && f.evidence?.token)
      .sort((a, b) => (a.loc?.line ?? 0) - (b.loc?.line ?? 0) || (a.loc?.column ?? 0) - (b.loc?.column ?? 0))
    for (const f of sorted) {
      const e = f.evidence as {
        value: string
        source?: string
        token: string
        replacement: string
        exact: boolean
        deltaE?: number
        distance?: number
      }
      const line = f.loc?.line ?? 1
      const token = g.token(e.token)
      const from = e.source ?? e.value
      const to = e.source ? e.replacement : token ? `var(${cssName(token)})` : e.token
      const edit: SnippetEdit = { line, from, to, token: e.token, exact: e.exact, applied: false }
      if (!e.exact) {
        if (e.deltaE !== undefined) edit.deltaE = e.deltaE
        else if (e.distance !== undefined) edit.distance = e.distance
      }
      const src = lines[line - 1]
      if (e.exact && src !== undefined) {
        const at = src.indexOf(from, Math.max(cursor.get(line) ?? 0, (f.loc?.column ?? 1) - 1))
        // A bare number in a script (`padding: 8`) is not a string: `var()` there would not run.
        if (at >= 0 && (!script || e.source || inString(src, at))) {
          lines[line - 1] = src.slice(0, at) + to + src.slice(at + from.length)
          cursor.set(line, at + to.length)
          edit.applied = true
        }
      }
      edits.push(edit)
    }
    return { output: lines.join('\n'), edits, language: script ? 'tsx' : 'css' }
  })
}

const SPACE = /(^|\.)(space|spacing|spacer|gap|gutter|inset|padding)(\.|$)/
const STATE = /(^|\.)(hover|hovered|focus|active|pressed|disabled|selected|checked)(\.|$)/
const PLAIN = /(^|\.)(default|primary|base|neutral)(\.|$)/
const STATUS =
  /(^|\.)(danger|critical|error|success|warning|attention|severe|done|closed|open|sponsors|info|accent|inverse|emphasis|black|white)(\.|$)/

/** The everyday look of a system makes the clearest example: `default` yes, `danger` and `inverse` no. */
const plain = (name: string) => (PLAIN.test(name) ? 2 : 0) - (STATUS.test(name) ? 2 : 0)

/**
 * A short stylesheet written by hand with the system's own values (a background, a text color, a
 * hover color, a spacing step) and the same stylesheet on its tokens: what the page does, shown on
 * the system that is open. Null when the system has too few such tokens to show it.
 */
export async function demoSnippet(g: DsGraph): Promise<DemoAnswer | null> {
  const roles = vocabularyOf().roles
  const input = g.defaultInput({})
  const shown = (t: Token) => formatValue(t.type, g.value(t.id, input))
  const names = (t: Token) => normalizeName(t.id)
  const alias = (t: Token) => g.chain(t.id, input).length > 1
  // General semantic tokens make the clearest example: a role word first, an alias, no state.
  // A general token (`bgColor.default`: the role first) before a component's (`avatar.bgColor`).
  const general = (n: string, role: RegExp) => Number(role.test(n.split('.')[0]!))
  // Only a value the engine itself answers with the same token: the example shows its real answer.
  const agrees = (t: Token, ctx: StyleContext) =>
    nearestTokens(g, { type: 'color', value: g.value(t.id, input) }, input, 1, ctx)[0]?.token.id === t.id
  const pick = (ts: Token[], role: RegExp, test: (n: string) => boolean, ctx: StyleContext) =>
    ts
      .filter(
        (t) => !t.deprecated && role.test(names(t)) && test(names(t)) && /^#[0-9a-f]{6}$/i.test(shown(t)),
      )
      .sort(
        (a, b) =>
          general(names(b), role) - general(names(a), role) ||
          plain(names(b)) - plain(names(a)) ||
          a.id.split(/[.-]/).length - b.id.split(/[.-]/).length ||
          Number(alias(b)) - Number(alias(a)) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, 40)
      .find((t) => agrees(t, ctx))
  const colors = g.tokens({ type: 'color' })
  const card = { components: ['card'] }
  const bg = pick(colors, roles.background, (n) => !STATE.test(n), { property: 'background', ...card })
  const text = pick(colors, roles.text, (n) => !STATE.test(n), { property: 'color', ...card })
  const hover = pick(colors, roles.background, (n) => /(^|\.)hover(\.|$)/.test(n), {
    property: 'background',
    states: ['hover'],
    ...card,
  })
  const space = g
    .tokens({ type: 'dimension' })
    .filter((t) => SPACE.test(names(t)) && /^(8|12|16|20|24)px$/.test(shown(t)))
    .sort((a, b) => a.id.localeCompare(b.id))[0]
  const lines = [
    bg && `  background: ${shown(bg)};`,
    text && shown(text) !== (bg && shown(bg)) && `  color: ${shown(text)};`,
    space && `  padding: ${shown(space)};`,
  ].filter(Boolean)
  if (lines.length < 2) return null
  const input0 = `.card {\n${lines.join('\n')}\n}${hover && hover.id !== bg?.id ? `\n.card:hover {\n  background: ${shown(hover)};\n}` : ''}`
  const fixed = await fixSnippet(g, input0)
  if (!fixed.edits.some((e) => e.applied)) return null
  return { input: input0, output: fixed.output }
}
