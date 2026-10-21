import { parseValue } from '@dsgraph/adapters'
import type { DsGraph, StyleContext } from '@dsgraph/core'
import { describeTokens, findToken, formatValue, readToken, stateOf } from '@dsgraph/report'
import { check } from '@dsgraph/rules'
import { graphOf, labelOf, load } from './compare'
import { cssName } from './css-name'
import type { IndexRow, LookupRequest, LookupResponse, TokenCard, ValueAnswer } from './lookup-types'
import { overviewOf } from './overview'
import { cssColor, isColor } from './view'

const swatchOf = (v: unknown): string | undefined => (isColor(v) ? cssColor(v) : undefined)

export function indexOf(g: DsGraph): IndexRow[] {
  return g.tokens().map((t) => ({
    id: t.id,
    type: t.type,
    deprecated: t.deprecated !== null,
    alias: t.values.some((v) => v.refs.some((r) => !r.property && !r.targetPath)),
    group: t.id.includes('.') ? t.id.split('.')[0]! : t.id.split('-')[0]!,
    css: cssName(t),
    values: t.values.map((v) => {
      const row: IndexRow['values'][number] = { when: v.when, text: formatValue(t.type, v.value) }
      const swatch = swatchOf(v.value)
      if (swatch) row.swatch = swatch
      return row
    }),
  }))
}

const DECLARATION = /^\s*([a-z-]+)\s*:\s*(.+?)\s*;?\s*$/i

/** `#0969da`, `12px` or `background: #fff`: the tokens for the value; null when it is not one. */
export function answer(
  g: DsGraph,
  text: string,
  opts: { property?: string; state?: string; context: Record<string, string> },
): ValueAnswer | null {
  const decl = DECLARATION.exec(text)
  const property = decl ? decl[1]!.toLowerCase() : opts.property
  const parsed = parseValue(decl ? decl[2]! : text.trim())
  if (!parsed) return null
  const context: StyleContext = {}
  if (property) context.property = property
  if (opts.state) context.states = [stateOf(opts.state)]
  const result = findToken(g, parsed, { context, input: g.defaultInput(opts.context), limit: 8 })
  return {
    ...(property ? { property } : {}),
    ...(decl ? { fromQuery: true } : {}),
    result: {
      ...result,
      groups: result.groups.map((x) => {
        const swatch = swatchOf(g.value(x.tokens[0]!.id, result.input))
        return swatch ? { ...x, swatch } : x
      }),
    },
  }
}

export function card(g: DsGraph, id: string): TokenCard | null {
  const d = readToken(g, id)
  if (!d) return null
  return {
    ...d,
    values: d.values.map((v) => {
      const swatch = swatchOf(v.value)
      return { when: v.when, text: v.text, via: v.via, ...(swatch ? { swatch } : {}) }
    }),
  }
}

/** One design system kept in the worker: loaded once, then asked many small questions. */
export function session() {
  let graph: DsGraph | undefined
  return async (req: LookupRequest): Promise<LookupResponse> => {
    try {
      if (req.kind === 'open') {
        const started = performance.now()
        graph = await load(req.source, req.include, req.githubToken)
        const tokens = graph.tokens()
        return {
          id: req.id,
          ok: true,
          kind: 'open',
          summary: {
            label: labelOf(req.source, graph),
            files: [...new Set(tokens.map((t) => t.origin.file))].sort(),
            description: describeTokens(graph),
          },
          index: indexOf(graph),
          graph: graphOf(graph),
          ms: Math.round(performance.now() - started),
        }
      }
      if (!graph) throw new Error('Open a design system first')
      if (req.kind === 'find') {
        const opts: Parameters<typeof answer>[2] = { context: req.context }
        if (req.property) opts.property = req.property
        if (req.state) opts.state = req.state
        return { id: req.id, ok: true, kind: 'find', answer: answer(graph, req.text, opts) }
      }
      if (req.kind === 'token') return { id: req.id, ok: true, kind: 'token', card: card(graph, req.token) }
      if (req.kind === 'project') {
        // The code parsers are large: loaded the first time someone checks a project.
        const { checkProject } = await import('./project').catch(() => {
          throw Object.assign(new Error('Could not load the code checker'), { hint: 'reload' })
        })
        try {
          return {
            id: req.id,
            ok: true,
            kind: 'project',
            project: await checkProject(graph, req.input, req.githubToken),
          }
        } catch (err) {
          const message = (err as Error).message
          const hint =
            req.input.kind === 'github' && !req.githubToken && /\b(401|403|404)\b/.test(message)
              ? 'private'
              : undefined
          throw Object.assign(new Error(message), hint ? { hint } : {})
        }
      }
      if (req.kind === 'overview')
        return { id: req.id, ok: true, kind: 'overview', overview: overviewOf(graph) }
      if (req.kind === 'demo') {
        const { demoSnippet } = await import('./snippet')
        return { id: req.id, ok: true, kind: 'demo', demo: await demoSnippet(graph) }
      }
      if (req.kind === 'snippet') {
        // The code parsers are large: loaded the first time someone pastes code.
        const { fixSnippet } = await import('./snippet')
        return { id: req.id, ok: true, kind: 'snippet', snippet: await fixSnippet(graph, req.text) }
      }
      return { id: req.id, ok: true, kind: 'health', findings: await check(graph) }
    } catch (err) {
      const message = (err as Error).message
      const r: LookupResponse = { id: req.id, ok: false, error: message }
      const hint = (err as { hint?: 'private' | 'reload' }).hint
      if (hint) r.hint = hint
      else if (
        req.kind === 'open' &&
        req.source.kind === 'github' &&
        !req.githubToken &&
        /\b(401|403|404)\b/.test(message)
      )
        r.hint = 'private'
      return r
    }
  }
}
