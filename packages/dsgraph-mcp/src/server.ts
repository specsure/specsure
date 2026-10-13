import { diffOptions, loadGraph } from '@dsgraph/cli'
import { type Config, type DsGraph, diff, type Input, type Token } from '@dsgraph/core'
import { formatChangeset, formatFindings, formatValue, formatWhen } from '@dsgraph/report'
import { check } from '@dsgraph/rules'
import { parseRemoteSpec } from '@dsgraph/sources'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { nearest, parseValue } from './nearest.js'

export interface ServerOptions {
  /** The design system the tools read when a call names no source: a folder, a file, `npm:…` or `github:…`. */
  source: string
  /** Folder that relative sources and `dsgraph.config.json` are resolved against. */
  cwd: string
  config?: Config
  version?: string
}

const SOURCE = z
  .string()
  .optional()
  .describe(
    'Where the tokens are: a folder or file path, npm:package@version or github:owner/repo/path@ref. Leave out for the project default.',
  )
const CONTEXT = z
  .record(z.string(), z.string())
  .optional()
  .describe('Theme or other mode to read values in, e.g. {"theme": "dark"}. Leave out for the default.')

/** Remote sources pinned to an exact version never change; everything else is read again after a while. */
const pinned = (spec: string) => {
  const r = parseRemoteSpec(spec)
  if (!r) return false
  return r.kind === 'npm' ? /^\d+\.\d+\.\d+/.test(r.version) : /^[0-9a-f]{40}$/.test(r.ref)
}
const REMOTE_TTL = 5 * 60_000

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] })
const failure = (t: string) => ({ content: [{ type: 'text' as const, text: t }], isError: true })

function describeValue(graph: DsGraph, t: Token, input: Input): string {
  const v = graph.value(t.id, input)
  const chain = graph.chain(t.id, input)
  const alias = chain.length > 1 ? ` (alias of ${chain.slice(1).join(' → ')})` : ''
  return `${formatValue(t.type, v)}${alias}`
}

/** The MCP server: read-only tools over a design system's tokens, built on dsgraph. */
export function createServer(opts: ServerOptions): McpServer {
  const server = new McpServer({ name: 'dsgraph', version: opts.version ?? '0.2.0' })
  const config = opts.config ?? {}
  const cache = new Map<string, { graph: Promise<DsGraph>; at: number }>()

  const graphOf = (source?: string): Promise<DsGraph> => {
    const spec = source?.trim() || opts.source
    const remote = !!parseRemoteSpec(spec)
    const hit = cache.get(spec)
    // Local files change while the agent works: read them on every call.
    if (hit && remote && (pinned(spec) || Date.now() - hit.at < REMOTE_TTL)) return hit.graph
    const graph = loadGraph(spec, config, opts.cwd)
    if (remote) {
      cache.set(spec, { graph, at: Date.now() })
      graph.catch(() => cache.delete(spec))
    }
    return graph
  }
  const inputOf = (graph: DsGraph, context?: Record<string, string>): Input =>
    graph.defaultInput(context ?? {})
  const contextLine = (graph: DsGraph, input: Input) =>
    graph.modifiers.length
      ? ` in ${Object.entries(input)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ')}`
      : ''

  server.registerTool(
    'find_token',
    {
      title: 'Find the token for a value',
      description:
        'Use before writing a hard-coded color, size, duration or font weight in code: returns the design tokens whose value matches it or comes closest (colors by visual difference ΔE, sizes in px). Prefer an exact match; among exact matches, semantic tokens (aliases) are listed before the primitives they point to.',
      inputSchema: {
        value: z
          .string()
          .describe('The value, e.g. "#3366ff", "rgb(51 102 255)", "12px", "0.75rem", "600", "200ms"'),
        type: z
          .enum(['color', 'dimension', 'duration', 'number', 'fontWeight', 'fontFamily', 'cubicBezier'])
          .optional()
          .describe('Token type, when the value alone is ambiguous'),
        context: CONTEXT,
        limit: z.number().int().min(1).max(25).optional().describe('How many tokens to return (default 5)'),
        source: SOURCE,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ value, type, context, limit, source }) => {
      const parsed = parseValue(value, type)
      if (!parsed)
        return failure(
          `"${value}" is not a value dsgraph can read as a token value. Pass \`type\` if it is ambiguous.`,
        )
      const graph = await graphOf(source)
      const input = inputOf(graph, context)
      // Tokens with the same value are one choice: grouped, so the list shows different values.
      const groups: Array<{ value: string; matches: ReturnType<typeof nearest> }> = []
      for (const m of nearest(graph, parsed, input, 500)) {
        const key = formatValue(m.token.type, m.value)
        const g = groups.find((x) => x.value === key)
        if (g) g.matches.push(m)
        else if (groups.length < (limit ?? 5)) groups.push({ value: key, matches: [m] })
      }
      if (!groups.length) return text(`No ${parsed.type} tokens${contextLine(graph, input)}.`)
      const lines = groups.map(({ value: v, matches }) => {
        const first = matches[0]!
        const how = first.exact
          ? 'exact'
          : parsed.type === 'color'
            ? `ΔE ${first.distance}`
            : `off by ${first.distance}`
        const shown = matches.slice(0, 4).map((m) => {
          const chain = graph.chain(m.token.id, input)
          const alias = chain.length > 1 ? ` → ${chain.at(-1)}` : ''
          return `\`${m.token.id}\`${alias}${m.token.deprecated ? ' (deprecated)' : ''}`
        })
        const more = matches.length > 4 ? `, and ${matches.length - 4} more` : ''
        return `- ${v} — ${how}: ${shown.join(', ')}${more}`
      })
      const best = groups[0]!.matches[0]!
      const advice = best.exact
        ? `Use \`${best.token.id}\` instead of the literal value${groups[0]!.matches.length > 1 ? ', or another token with the same value whose name fits the use' : ''}.`
        : `No token matches exactly; the closest is \`${best.token.id}\`. Using a literal value here would bypass the design system.`
      return text(
        `${parsed.type} ${formatValue(parsed.type, parsed.value)}${contextLine(graph, input)}:\n${lines.join('\n')}\n\n${advice}`,
      )
    },
  )

  server.registerTool(
    'get_token',
    {
      title: 'Read a token',
      description:
        'One token in full: its value in every theme, the chain of references it takes the value from, the tokens that use it, its description, deprecation and file.',
      inputSchema: {
        id: z
          .string()
          .describe('Token id as dsgraph writes it, e.g. "color.text.primary" or "space-4" for CSS'),
        source: SOURCE,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ id, source }) => {
      const graph = await graphOf(source)
      const t = graph.token(id)
      if (!t) {
        const near = graph
          .tokens()
          .map((x) => x.id)
          .filter((x) => x.includes(id) || id.includes(x))
          .slice(0, 8)
        return failure(
          `No token "${id}".${near.length ? ` Similar: ${near.map((n) => `\`${n}\``).join(', ')}` : ''}`,
        )
      }
      const lines = [`\`${t.id}\` — ${t.type ?? 'untyped'}`]
      if (t.description) lines.push(t.description)
      if (t.deprecated)
        lines.push(
          `Deprecated${t.deprecated.replacement ? `: use \`${t.deprecated.replacement}\`` : t.deprecated.reason ? `: ${t.deprecated.reason}` : ''}.`,
        )
      lines.push('', 'Values:')
      for (const v of t.values) {
        const chain = graph.chain(t.id, v.when)
        const via = chain.length > 1 ? ` ← ${chain.slice(1).join(' ← ')}` : ''
        lines.push(
          `- ${formatWhen(v.when).replace(/^ \(|\)$/g, '') || 'everywhere'}: ${formatValue(t.type, v.value)}${via}`,
        )
      }
      const users = graph.dependents(t.id)
      const all = graph.dependents(t.id, { transitive: true })
      lines.push(
        '',
        users.length
          ? `Used by ${users.length} token${users.length === 1 ? '' : 's'}${all.length > users.length ? ` (${all.length} counting their users)` : ''}: ${users
              .slice(0, 30)
              .map((u) => `\`${u}\``)
              .join(', ')}${users.length > 30 ? ', …' : ''}`
          : 'No other token uses it.',
        `File: ${t.origin.file}`,
      )
      return text(lines.join('\n'))
    },
  )

  server.registerTool(
    'search_tokens',
    {
      title: 'Search tokens',
      description:
        'Lists tokens by name and type with their values, e.g. every color, or everything under "color.text". Use to learn which tokens exist before choosing one.',
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe(
            'Part of the name, or a glob such as "color.text.*". Leave out to list everything (up to the limit).',
          ),
        type: z
          .string()
          .optional()
          .describe('Only this type: color, dimension, fontFamily, typography, shadow…'),
        context: CONTEXT,
        limit: z.number().int().min(1).max(500).optional().describe('Most tokens to return (default 100)'),
        source: SOURCE,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ query, type, context, limit, source }) => {
      const graph = await graphOf(source)
      const input = inputOf(graph, context)
      const q = query?.trim() ?? ''
      const glob = /[*?]/.test(q)
      const all = graph.tokens(type ? { type } : {}).filter((t) => {
        if (!q) return true
        if (glob) return graph.tokens({ path: q }).some((x) => x.id === t.id)
        return t.id.toLowerCase().includes(q.toLowerCase())
      })
      const max = limit ?? 100
      if (!all.length) return text('No tokens match.')
      const lines = all
        .slice(0, max)
        .map(
          (t) =>
            `- \`${t.id}\` (${t.type ?? '?'}): ${describeValue(graph, t, input)}${t.deprecated ? ' — deprecated' : ''}`,
        )
      if (all.length > max) lines.push(`… ${all.length - max} more; narrow the query or raise the limit.`)
      return text(
        `${all.length} token${all.length === 1 ? '' : 's'}${contextLine(graph, input)}:\n${lines.join('\n')}`,
      )
    },
  )

  server.registerTool(
    'describe_tokens',
    {
      title: 'Describe the design system',
      description:
        'An overview of a token source: how many tokens of each type, the themes and other modes, the top-level groups and files. Start here with an unfamiliar design system.',
      inputSchema: { source: SOURCE },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ source }) => {
      const graph = await graphOf(source)
      const tokens = graph.tokens()
      const byType = new Map<string, number>()
      for (const t of tokens) byType.set(t.type ?? 'untyped', (byType.get(t.type ?? 'untyped') ?? 0) + 1)
      const roots = new Map<string, number>()
      for (const t of tokens) {
        const root = t.id.includes('.') ? t.id.split('.')[0]! : t.id.split('-')[0]!
        roots.set(root, (roots.get(root) ?? 0) + 1)
      }
      const files = new Set(tokens.map((t) => t.origin.file))
      const errors = graph.snapshot.diagnostics.filter((d) => d.severity === 'error').length
      const lines = [
        `${tokens.length} tokens from ${files.size} file${files.size === 1 ? '' : 's'} (${source?.trim() || opts.source}).`,
        `Types: ${[...byType]
          .sort((a, b) => b[1] - a[1])
          .map(([k, n]) => `${k} ${n}`)
          .join(', ')}.`,
        graph.modifiers.length
          ? `Modes: ${graph.modifiers.map((m) => `${m.name} (${m.contexts.join(', ')}; default ${m.default ?? m.contexts[0]})`).join('; ')}.`
          : 'No themes or other modes.',
        `Top-level groups: ${[...roots]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([k, n]) => `${k} ${n}`)
          .join(', ')}.`,
      ]
      if (errors) lines.push(`${errors} parse errors; run check_tokens for details.`)
      return text(lines.join('\n'))
    },
  )

  server.registerTool(
    'compare_versions',
    {
      title: 'Compare two versions',
      description:
        'What changed between two versions of the tokens, what breaks and which semver bump the release needs: removed and renamed tokens first, value changes per theme, and tokens that changed through references. Use before upgrading a token package or releasing one.',
      inputSchema: {
        base: z
          .string()
          .describe('The old version: a path, npm:package@version or github:owner/repo/path@ref'),
        head: SOURCE.describe('The new version; leave out for the project default'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ base, head }) => {
      const [b, h] = await Promise.all([graphOf(base), graphOf(head)])
      const cs = await diff(b, h, diffOptions(config))
      const types = new Map([...b.tokens(), ...h.tokens()].map((t) => [t.id, t.type]))
      return text(formatChangeset(cs, { format: 'markdown', types }))
    },
  )

  server.registerTool(
    'check_tokens',
    {
      title: 'Check tokens',
      description:
        'Problems in a token source: broken references, reference cycles, legacy syntax, naming collisions, color ramps out of order, colors out of gamut. Repeated problems are grouped.',
      inputSchema: { source: SOURCE },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ source }) => {
      const graph = await graphOf(source)
      const findings = await check(graph, config)
      return text(findings.length ? formatFindings(findings, { format: 'markdown' }) : 'No problems found.')
    },
  )

  return server
}
