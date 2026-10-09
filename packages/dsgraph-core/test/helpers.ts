import {
  type BuildOptions,
  buildSnapshot,
  DiagnosticBag,
  DsGraph,
  type Source,
  type SourceMeta,
  systemFromDocuments,
  systemFromResolver,
} from '../src/index.js'

export const srgb = (r: number, g: number, b: number, alpha?: number) => ({
  colorSpace: 'srgb',
  components: [r, g, b],
  ...(alpha === undefined ? {} : { alpha }),
})
export const px = (value: number) => ({ value, unit: 'px' })

/** Snapshot of plain token documents (synthetic resolver, one set). */
export async function snap(docs: Record<string, unknown> | unknown[], opts: BuildOptions = {}) {
  const list = Array.isArray(docs)
    ? docs.map((tree, i) => ({ file: `doc${i}.tokens.json`, tree }))
    : [{ file: 'tokens.json', tree: docs }]
  const diagnostics = new DiagnosticBag()
  const snapshot = await buildSnapshot(systemFromDocuments(list), { diagnostics, ...opts })
  return { snapshot, graph: DsGraph.from(snapshot), codes: snapshot.diagnostics.map((d) => d.code) }
}

/** Snapshot of a resolver document with in-memory files. */
export async function snapResolver(
  resolver: unknown,
  files: Record<string, unknown> = {},
  opts: BuildOptions = {},
) {
  const diag = new DiagnosticBag()
  const system = await systemFromResolver(
    resolver,
    'system.resolver.json',
    async (p) => {
      if (!(p in files)) throw new Error('not found')
      return files[p]
    },
    diag,
  )
  const snapshot = await buildSnapshot(system, { diagnostics: diag, ...opts })
  return { snapshot, graph: DsGraph.from(snapshot), codes: snapshot.diagnostics.map((d) => d.code) }
}

export class InlineSource implements Source {
  readonly id = 'inline:'
  constructor(
    private readonly files: Record<string, unknown>,
    private readonly m: SourceMeta = { kind: 'files' },
  ) {}
  async list(patterns: string | readonly string[]) {
    const { matchGlob } = await import('../src/index.js')
    return Object.keys(this.files)
      .filter((p) => matchGlob(p, patterns))
      .sort()
  }
  async readText(path: string) {
    const v = this.files[path]
    if (v === undefined) throw new Error(`not found: ${path}`)
    return typeof v === 'string' ? v : JSON.stringify(v)
  }
  async meta() {
    return this.m
  }
}
