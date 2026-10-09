import { matchGlob, type Source, type SourceMeta } from '@dsgraph/core'

export interface NpmSourceOptions {
  /** Defaults to jsDelivr. */
  dataApi?: string
  cdn?: string
  fetch?: typeof fetch
}

/**
 * Files of a published npm package via jsDelivr (CORS-enabled, works in the browser).
 * `version` may be a range or a dist-tag; it is resolved to an exact version first.
 */
export class NpmSource implements Source {
  readonly id: string
  private resolved?: string
  private fileList?: string[]
  private readonly dataApi: string
  private readonly cdn: string
  private readonly fetchImpl: typeof fetch

  constructor(
    readonly pkg: string,
    readonly version = 'latest',
    opts: NpmSourceOptions = {},
  ) {
    this.id = `npm:${pkg}@${version}`
    this.dataApi = opts.dataApi ?? 'https://data.jsdelivr.com/v1'
    this.cdn = opts.cdn ?? 'https://cdn.jsdelivr.net/npm'
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis)
  }

  private async json(url: string): Promise<unknown> {
    const res = await this.fetchImpl(url)
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
    return res.json()
  }

  async resolveVersion(): Promise<string> {
    if (!this.resolved) {
      const data = (await this.json(
        `${this.dataApi}/packages/npm/${this.pkg}/resolved?specifier=${encodeURIComponent(this.version)}`,
      )) as { version?: string | null }
      if (!data.version) throw new Error(`Cannot resolve ${this.pkg}@${this.version}`)
      this.resolved = data.version
    }
    return this.resolved
  }

  async list(patterns: string | readonly string[]): Promise<string[]> {
    if (!this.fileList) {
      const v = await this.resolveVersion()
      const data = (await this.json(`${this.dataApi}/packages/npm/${this.pkg}@${v}?structure=flat`)) as {
        files: Array<{ name: string }>
      }
      this.fileList = data.files.map((f) => f.name.replace(/^\//, '')).sort()
    }
    return this.fileList.filter((p) => matchGlob(p, patterns))
  }

  async readText(path: string): Promise<string> {
    const v = await this.resolveVersion()
    const res = await this.fetchImpl(`${this.cdn}/${this.pkg}@${v}/${path.replace(/^\//, '')}`)
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path}`)
    return res.text()
  }

  async meta(): Promise<SourceMeta> {
    return { kind: 'npm', package: this.pkg, version: await this.resolveVersion() }
  }
}
