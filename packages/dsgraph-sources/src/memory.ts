import { matchGlob, type Source, type SourceMeta } from '@dsgraph/core'

/** In-memory source: dropped files in the browser, fixtures in tests. */
export class MemorySource implements Source {
  readonly id: string
  private readonly files: Map<string, string>
  private readonly sourceMeta: SourceMeta

  constructor(files: Record<string, string | object>, meta: SourceMeta = { kind: 'files' }) {
    this.files = new Map(
      Object.entries(files).map(([path, content]) => [
        path.replace(/^\.?\//, ''),
        typeof content === 'string' ? content : JSON.stringify(content),
      ]),
    )
    this.sourceMeta = meta
    this.id = `${meta.kind}:`
  }

  async list(patterns: string | readonly string[]): Promise<string[]> {
    return [...this.files.keys()].filter((p) => matchGlob(p, patterns)).sort()
  }

  async readText(path: string): Promise<string> {
    const content = this.files.get(path.replace(/^\.?\//, ''))
    if (content === undefined) throw new Error(`File not found: ${path}`)
    return content
  }

  async meta(): Promise<SourceMeta> {
    return this.sourceMeta
  }
}
