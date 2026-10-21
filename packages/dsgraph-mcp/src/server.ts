import { stat } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { scanCode, scanFileText } from '@dsgraph/adapters'
import { diffOptions, loadGraph } from '@dsgraph/cli'
import {
  type CodeIndex,
  type Config,
  coverageOf,
  type DsGraph,
  diff,
  formatCoverage,
  type Input,
  impactOf,
  type Knowledge,
  type StyleContext,
  VarMatcher,
  varNames,
} from '@dsgraph/core'
import {
  componentOf,
  describeTokens,
  findToken,
  formatChangeset,
  formatFindings,
  formatWhen,
  readToken,
  searchTokens,
  similarIds,
  stateOf,
  suggestName,
} from '@dsgraph/report'
import { check } from '@dsgraph/rules'
import { parseRemoteSpec } from '@dsgraph/sources'
import { NodeFsSource } from '@dsgraph/sources/node'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { parseValue } from './nearest.js'

/** A name for a new token from the system's own scales, as a hint for the design system's team. */
function newName(
  graph: DsGraph,
  parsed: { type: string; value: unknown },
  near: string,
  input: Input,
): string {
  const s = suggestName(graph, parsed, { near, input })
  return s
    ? ` If the system needs a new token for it, its own scale would name it \`${s.name}\` (between \`${s.between.join('` and `')}\`): a suggestion for the design system's team, not a token to write.`
    : ''
}

export interface ServerOptions {
  /** The design system the tools read when a call names no source: a folder, a file, `npm:…` or `github:…`. */
  source: string
  /** Folder that relative sources and `dsgraph.config.json` are resolved against. */
  cwd: string
  config?: Config
  /** A knowledge pack: more words to read token names by (`loadKnowledge` in `@dsgraph/cli`). */
  knowledge?: Knowledge
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

const CODE = z
  .string()
  .optional()
  .describe(
    'The project code that uses the tokens: a folder or a file (CSS, SCSS, JS/TS/JSX/TSX, Vue, Svelte, Astro, HTML), relative to the project. Leave out to skip the code.',
  )

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] })
const failure = (t: string) => ({ content: [{ type: 'text' as const, text: t }], isError: true })

/** The MCP server: read-only tools over a design system's tokens, built on dsgraph. */
export function createServer(opts: ServerOptions): McpServer {
  const server = new McpServer({ name: 'dsgraph', version: opts.version ?? '0.8.1' })
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
  /** Styles of the project: a folder, or one file in it. Read on every call; the agent edits them. */
  const codeOf = async (path: string): Promise<CodeIndex> => {
    const full = resolve(opts.cwd, path)
    const info = await stat(full).catch(() => undefined)
    if (!info) throw new Error(`Not found: ${path}`)
    const scanOpts: Parameters<typeof scanCode>[1] = {}
    if (config.code?.exclude) scanOpts.exclude = config.code.exclude
    if (info.isFile())
      return scanCode(new NodeFsSource(dirname(full)), { ...scanOpts, include: [basename(full)] })
    if (config.code?.include) scanOpts.include = config.code.include
    return scanCode(new NodeFsSource(full), scanOpts)
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
        property: z
          .string()
          .optional()
          .describe(
            'The CSS property the value is for, e.g. "color", "background-color", "border-color". Pass it when you know it: tokens made for it come first (text tokens for color, background tokens for a background).',
          ),
        state: z
          .string()
          .optional()
          .describe(
            'The state the style is for: "hover", "focus", "active", "disabled", "selected" or "visited" (a :hover rule, a hover: class). Tokens named for it come first; without it, tokens for a state go after the others.',
          ),
        component: z
          .string()
          .optional()
          .describe(
            'The component being styled, e.g. "Button" or "ActionList": tokens named for it come first (button.bgColor.rest before bgColor.accent).',
          ),
        context: CONTEXT,
        limit: z.number().int().min(1).max(25).optional().describe('How many tokens to return (default 5)'),
        source: SOURCE,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ value, type, property, state, component, context, limit, source }) => {
      const parsed = parseValue(value, type)
      if (!parsed)
        return failure(
          `"${value}" is not a value dsgraph can read as a token value. Pass \`type\` if it is ambiguous.`,
        )
      const graph = await graphOf(source)
      const near: StyleContext = {}
      if (property) near.property = property
      if (state?.trim()) near.states = [stateOf(state, opts.knowledge)]
      if (component?.trim()) near.components = [componentOf(component)]
      const found = findToken(graph, parsed, {
        context: near,
        input: inputOf(graph, context),
        limit: limit ?? 5,
        ...(opts.knowledge ? { knowledge: opts.knowledge } : {}),
      })
      const where = contextLine(graph, found.input)
      if (!found.groups.length) return text(`No ${parsed.type} tokens${where}.`)
      const lines = found.groups.map((g) => {
        const how = g.exact ? 'exact' : parsed.type === 'color' ? `ΔE ${g.distance}` : `off by ${g.distance}`
        const shown = g.tokens
          .slice(0, 4)
          .map((t) => `\`${t.id}\`${t.target ? ` → ${t.target}` : ''}${t.deprecated ? ' (deprecated)' : ''}`)
        const more = g.tokens.length > 4 ? `, and ${g.tokens.length - 4} more` : ''
        return `- ${g.value} — ${how}: ${shown.join(', ')}${more}`
      })
      const first = found.groups[0]!
      const best = first.tokens[0]!
      const advice = first.exact
        ? `Use \`${best.id}\` instead of the literal value${first.tokens.length > 1 ? ', or another token with the same value whose name fits the use' : ''}.`
        : `No token matches exactly; the closest is \`${best.id}\`. Using a literal value here would bypass the design system.${newName(graph, parsed, best.id, found.input)}`
      return text(`${found.type} ${found.value}${where}:\n${lines.join('\n')}\n\n${advice}`)
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
      const d = readToken(graph, id)
      if (!d) {
        const near = similarIds(graph, id)
        return failure(
          `No token "${id}".${near.length ? ` Similar: ${near.map((n) => `\`${n}\``).join(', ')}` : ''}`,
        )
      }
      const t = d.token
      const lines = [`\`${t.id}\` — ${t.type ?? 'untyped'}`]
      if (t.description) lines.push(t.description)
      if (t.deprecated)
        lines.push(
          `Deprecated${t.deprecated.replacement ? `: use \`${t.deprecated.replacement}\`` : t.deprecated.reason ? `: ${t.deprecated.reason}` : ''}.`,
        )
      lines.push('', 'Values:')
      for (const v of d.values) {
        const via = v.via.length ? ` ← ${v.via.join(' ← ')}` : ''
        lines.push(`- ${formatWhen(v.when).replace(/^ \(|\)$/g, '') || 'everywhere'}: ${v.text}${via}`)
      }
      const users = d.users
      lines.push(
        '',
        users.length
          ? `Used by ${users.length} token${users.length === 1 ? '' : 's'}${d.allUsers > users.length ? ` (${d.allUsers} counting their users)` : ''}: ${users
              .slice(0, 30)
              .map((u) => `\`${u}\``)
              .join(', ')}${users.length > 30 ? ', …' : ''}`
          : 'No other token uses it.',
      )
      if (d.sameValue.length)
        lines.push(
          `Same value: ${d.sameValue
            .slice(0, 10)
            .map((u) => `\`${u}\``)
            .join(', ')}${d.sameValue.length > 10 ? ', …' : ''}`,
        )
      lines.push(`File: ${t.origin.file}`)
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
      const all = searchTokens(graph, { ...(query ? { query } : {}), ...(type ? { type } : {}), input })
      const max = limit ?? 100
      if (!all.length) return text('No tokens match.')
      const lines = all
        .slice(0, max)
        .map(
          (r) =>
            `- \`${r.token.id}\` (${r.token.type ?? '?'}): ${r.text}${r.via.length ? ` (alias of ${r.via.join(' → ')})` : ''}${r.token.deprecated ? ' — deprecated' : ''}`,
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
      const d = describeTokens(graph)
      const lines = [
        `${d.tokens} tokens from ${d.files.length} file${d.files.length === 1 ? '' : 's'} (${source?.trim() || opts.source}).`,
        `Types: ${d.types.map(([k, n]) => `${k} ${n}`).join(', ')}.`,
        d.modes.length
          ? `Modes: ${d.modes.map((m) => `${m.name} (${m.contexts.join(', ')}; default ${m.default})`).join('; ')}.`
          : 'No themes or other modes.',
        `Top-level groups: ${d.groups
          .slice(0, 20)
          .map(([k, n]) => `${k} ${n}`)
          .join(', ')}.`,
        `${d.values} hold values, ${d.aliases} take them from other tokens.`,
      ]
      if (d.errors) lines.push(`${d.errors} parse errors; run check_tokens for details.`)
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
        code: CODE.describe(
          'The project that uses the tokens (a folder or style file): adds, under each change, the places in its styles that break or look different.',
        ),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ base, head, code }) => {
      const [b, h, index] = await Promise.all([graphOf(base), graphOf(head), code ? codeOf(code) : undefined])
      const cs = await diff(b, h, diffOptions(config))
      const types = new Map([...b.tokens(), ...h.tokens()].map((t) => [t.id, t.type]))
      const impact = index
        ? impactOf(cs, b, h, index, config.code?.prefix ? { prefix: config.code.prefix } : {})
        : undefined
      return text(formatChangeset(cs, { format: 'markdown', types, ...(impact ? { impact } : {}) }))
    },
  )

  server.registerTool(
    'check_styles',
    {
      title: 'Check code against the tokens',
      description:
        'Use after writing or editing UI code: finds colors written by hand, spacing, radii and font sizes off the scale, deprecated and unknown design-system variables, each with the token to use instead. Reads CSS and SCSS, style objects and CSS-in-JS in JS/TS/JSX/TSX, Tailwind classes (bg-[#3366ff], p-[13px]) and Vue, Svelte, Astro and HTML. Pass the code you just wrote, or a file or folder of the project. Also says how much of the code is on tokens.',
      inputSchema: {
        code: z
          .string()
          .optional()
          .describe('Code to check, e.g. the component or rule you are about to write.'),
        filename: z
          .string()
          .optional()
          .describe(
            'Its file name, which tells the language: Button.tsx, card.module.css, App.vue. Default: a .tsx file.',
          ),
        css: z
          .string()
          .optional()
          .describe('Style text to check (CSS or SCSS); same as `code` with a .scss file name.'),
        path: CODE.describe('A file or folder of the project to check instead of `code`.'),
        source: SOURCE,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ code: snippet, filename, css, path, source }) => {
      if (!snippet && !css && !path)
        return failure('Pass `code` (with `filename`), `css` (style text) or `path` (a file or folder).')
      const graph = await graphOf(source)
      let code: CodeIndex
      if (snippet || css) {
        const file = css ? 'snippet.scss' : filename?.trim() || 'snippet.tsx'
        code = { files: [file], uses: [], literals: [], skipped: [] }
        try {
          scanFileText(file, (css ?? snippet)!, code)
        } catch (e) {
          return failure(`Could not parse ${file}: ${(e as Error).message}`)
        }
      } else {
        code = await codeOf(path!)
        if (code.skipped.length && !code.files.length)
          return failure(`Could not parse the code: ${code.skipped[0]!.message}`)
      }
      const findings = (await check(graph, config, [], { code, knowledge: opts.knowledge })).filter((f) =>
        /^(style|usage)\//.test(f.rule),
      )
      const coverage = formatCoverage(
        coverageOf(code, new VarMatcher(graph, varNames(code), config.code?.prefix)),
      )
      if (!findings.length) return text(`No problems. ${coverage}`)
      return text(
        `${coverage}\n\n${formatFindings(findings, { format: 'markdown', group: false, heading: false })}`,
      )
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
      const findings = await check(graph, config, [], { knowledge: opts.knowledge })
      return text(findings.length ? formatFindings(findings, { format: 'markdown' }) : 'No problems found.')
    },
  )

  return server
}
