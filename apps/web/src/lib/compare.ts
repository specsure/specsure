import { cssTokens, jsonTokens } from '@dsgraph/adapters'
import {
  type Config,
  DsGraph,
  diff,
  NOT_TOKENS,
  type Snapshot,
  type Source,
  scan,
  validateSnapshot,
} from '@dsgraph/core'
import { formatValue } from '@dsgraph/report'
import { check } from '@dsgraph/rules'
import { MemorySource, remoteSource } from '@dsgraph/sources'
import type {
  CodeReport,
  GraphNode,
  RunRequest,
  RunResponse,
  SideInfo,
  SideInput,
  Stage,
  TokenGraph,
} from './types'
import { cssColor, isColor } from './view'

const CSS = /\.css$/i

/** `include` globs split by kind: CSS files go to the CSS adapter, the rest are DTCG documents. */
export function configFor(include: string): Config {
  const globs = include
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean)
  const config: Config = {}
  const css = globs.filter((g) => CSS.test(g))
  const tokens = globs.filter((g) => !CSS.test(g))
  if (tokens.length) config.tokens = { include: tokens }
  if (css.length) config.css = { include: css }
  return config
}

function asSnapshot(text: string): Snapshot | undefined {
  if (!text.includes('dsgraph/snapshot@1')) return undefined
  try {
    const parsed = JSON.parse(text) as { schema?: unknown }
    if (parsed.schema !== 'dsgraph/snapshot@1') return undefined
    const v = validateSnapshot(parsed)
    if (!v.ok) throw new Error(`Invalid snapshot: ${v.errors[0]?.path} ${v.errors[0]?.message}`)
    return parsed as Snapshot
  } catch (e) {
    if ((e as Error).message.startsWith('Invalid snapshot')) throw e
    return undefined
  }
}

export async function load(side: SideInput, include: string, githubToken?: string): Promise<DsGraph> {
  let source: Source
  let config = configFor(include)
  if (side.kind === 'files') {
    if (side.files.length === 0) throw new Error('Drop token files here first')
    if (side.files.length === 1) {
      const snap = asSnapshot(side.files[0]!.text)
      if (snap) return DsGraph.from(snap)
    }
    source = new MemorySource(Object.fromEntries(side.files.map((f) => [f.path, f.text])), {
      kind: 'files',
      path: side.files.length === 1 ? side.files[0]!.path : `${side.files.length} files`,
    })
    // Dropped files are what the user meant: read every JSON and CSS file unless told otherwise.
    if (!include) {
      // package.json, tsconfig.json and other config files from a dropped project are not tokens.
      const json = side.files.filter((f) => /\.(json|tokens)$/i.test(f.path) && !NOT_TOKENS.test(f.path))
      const css = side.files.filter((f) => CSS.test(f.path))
      config = {}
      if (json.length) config.tokens = { include: json.map((f) => f.path) }
      if (css.length) config.css = { include: css.map((f) => f.path) }
    }
  } else source = remoteSource(side, side.kind === 'github' && githubToken ? { token: githubToken } : {})
  return DsGraph.from(await scan(source, config, { adapters: [jsonTokens, cssTokens] }))
}

function info(g: DsGraph, label: string): SideInfo {
  const tokens = g.tokens()
  return {
    label,
    files: [...new Set(tokens.map((t) => t.origin.file))].sort(),
    tokens: tokens.length,
    modifiers: g.snapshot.contexts.modifiers.map((m) => ({ name: m.name, contexts: m.contexts })),
  }
}

/** References of one side and the values of the tokens in them, for the graph view. */
export function graphOf(g: DsGraph): TokenGraph {
  const refs: TokenGraph['refs'] = []
  const ids = new Set<string>()
  const seen = new Set<string>()
  for (const [, from, to, attrs] of g.edges('aliases')) {
    const when = attrs?.when
    const key = `${from}\u0000${to}\u0000${when ? JSON.stringify(when) : ''}`
    if (seen.has(key)) continue
    seen.add(key)
    refs.push(when && Object.keys(when).length ? [from, to, when] : [from, to])
    ids.add(from)
    ids.add(to)
  }
  const nodes: Record<string, GraphNode> = {}
  for (const id of ids) {
    const t = g.token(id)
    if (!t) continue
    nodes[id] = {
      type: t.type,
      values: t.values.map((v) => {
        const text = formatValue(t.type, v.value)
        return isColor(v.value) ? { when: v.when, swatch: cssColor(v.value), text } : { when: v.when, text }
      }),
    }
  }
  return { refs, nodes }
}

const labelOf = (side: SideInput, g: DsGraph): string => {
  const s = g.snapshot.source
  if (s.kind === 'npm') return `${s.package}@${s.version}`
  if (s.kind === 'github') return `${s.repo}@${s.ref}${s.commit ? ` (${s.commit.slice(0, 7)})` : ''}`
  return side.kind === 'files'
    ? side.files.length === 1
      ? side.files[0]!.path
      : `${side.files.length} files`
    : s.kind
}

/** Loads both sides, diffs them and checks the head. `progress` reports the stage. */
export async function compare(
  req: RunRequest,
  progress: (stage: Stage) => void = () => {},
): Promise<RunResponse> {
  const { id, base, head, include, githubToken } = req
  const started = performance.now()
  const loadSide = async (which: 'base' | 'head', side: SideInput) => {
    try {
      return await load(side, include, githubToken)
    } catch (err) {
      const message = (err as Error).message
      const hint =
        side.kind === 'github' && !githubToken && /\b(401|403|404)\b/.test(message) ? 'private' : undefined
      throw Object.assign(new Error(message), { side: which, hint })
    }
  }
  try {
    progress('reading')
    const [b, h] = await Promise.all([loadSide('base', base), loadSide('head', head)])
    progress('comparing')
    const changeset = await diff(b, h)
    const findings = await check(h)
    let code: CodeReport | undefined
    if (req.code?.length) {
      progress('code')
      const { checkCode } = await import('./code')
      code = await checkCode(req.code, b, h, changeset)
    }
    const types = new Map<string, string | null>()
    for (const t of [...b.tokens(), ...h.tokens()]) types.set(t.id, t.type)
    return {
      id,
      ok: true,
      changeset,
      types: [...types],
      base: info(b, labelOf(base, b)),
      head: info(h, labelOf(head, h)),
      findings,
      graph: { base: graphOf(b), head: graphOf(h) },
      ...(code ? { code } : {}),
      ms: Math.round(performance.now() - started),
    }
  } catch (err) {
    const r: RunResponse = { id, ok: false, error: (err as Error).message }
    const { side, hint } = err as { side?: 'base' | 'head'; hint?: 'private' }
    if (side) r.side = side
    if (hint) r.hint = hint
    return r
  }
}
