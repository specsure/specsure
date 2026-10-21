import { scanCssText, scanFileText } from '@dsgraph/adapters'
import type { CodeIndex, DsGraph } from '@dsgraph/core'
import { check } from '@dsgraph/rules'
import { cssName } from './css-name'
import type { SnippetAnswer, SnippetEdit } from './lookup-types'

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
