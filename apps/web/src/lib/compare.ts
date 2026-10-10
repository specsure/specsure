import { cssTokens } from '@dsgraph/adapters'
import { type Config, DsGraph, diff, type Snapshot, type Source, scan, validateSnapshot } from '@dsgraph/core'
import { check } from '@dsgraph/rules'
import { MemorySource, remoteSource } from '@dsgraph/sources'
import type { RunRequest, RunResponse, SideInfo, SideInput } from './types'

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

export async function load(side: SideInput, include: string): Promise<DsGraph> {
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
      const json = side.files.filter(
        (f) => /\.(json|tokens)$/i.test(f.path) && !/resolver\.json$/i.test(f.path),
      )
      const css = side.files.filter((f) => CSS.test(f.path))
      config = {}
      if (json.length) config.tokens = { include: json.map((f) => f.path) }
      if (css.length) config.css = { include: css.map((f) => f.path) }
    }
  } else source = remoteSource(side)
  return DsGraph.from(await scan(source, config, { adapters: [cssTokens] }))
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
  progress: (stage: string) => void = () => {},
): Promise<RunResponse> {
  const { id, base, head, include } = req
  const started = performance.now()
  const loadSide = async (which: 'base' | 'head', side: SideInput) => {
    try {
      return await load(side, include)
    } catch (err) {
      throw Object.assign(new Error((err as Error).message), { side: which })
    }
  }
  try {
    progress('Reading tokens…')
    const [b, h] = await Promise.all([loadSide('base', base), loadSide('head', head)])
    progress('Comparing…')
    const changeset = await diff(b, h)
    const findings = await check(h)
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
      ms: Math.round(performance.now() - started),
    }
  } catch (err) {
    const r: RunResponse = { id, ok: false, error: (err as Error).message }
    const side = (err as { side?: 'base' | 'head' }).side
    if (side) r.side = side
    return r
  }
}
