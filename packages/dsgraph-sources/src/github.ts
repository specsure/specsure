import { matchGlob, type Source, type SourceMeta } from '@dsgraph/core'

export interface GitHubSourceOptions {
  /** Personal token for private repositories or higher rate limits; sent only to api.github.com. */
  token?: string
  /** Subdirectory to treat as the root, e.g. `packages/tokens`. */
  root?: string
  api?: string
  raw?: string
  fetch?: typeof fetch
}

/**
 * Files of a GitHub repository at a ref (branch, tag or commit). Works in the browser:
 * the tree comes from the REST API (60 requests/hour without a token), contents from
 * raw.githubusercontent.com, or from the API when a token is given (private repositories).
 */
export class GitHubSource implements Source {
  readonly id: string
  private sha?: string
  private files?: string[]
  private readonly root: string
  private readonly api: string
  private readonly raw: string
  private readonly fetchImpl: typeof fetch

  constructor(
    readonly repo: string,
    readonly ref = 'HEAD',
    private readonly opts: GitHubSourceOptions = {},
  ) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error(`Repository must be "owner/name", got "${repo}"`)
    this.root = (opts.root ?? '').replace(/^\/+|\/+$/g, '')
    this.id = `github:${repo}@${ref}${this.root ? `/${this.root}` : ''}`
    this.api = opts.api ?? 'https://api.github.com'
    this.raw = opts.raw ?? 'https://raw.githubusercontent.com'
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis)
  }

  private async apiJson(path: string): Promise<unknown> {
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
    if (this.opts.token) headers.Authorization = `Bearer ${this.opts.token}`
    const res = await this.fetchImpl(`${this.api}${path}`, { headers })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path}`)
    return res.json()
  }

  /** Exact commit sha of the ref, so that every read is consistent. */
  async commit(): Promise<string> {
    if (!this.sha) {
      const data = (await this.apiJson(`/repos/${this.repo}/commits/${encodeURIComponent(this.ref)}`)) as {
        sha: string
      }
      this.sha = data.sha
    }
    return this.sha
  }

  async list(patterns: string | readonly string[]): Promise<string[]> {
    if (!this.files) {
      const sha = await this.commit()
      const data = (await this.apiJson(`/repos/${this.repo}/git/trees/${sha}?recursive=1`)) as {
        tree: Array<{ path: string; type: string }>
        truncated: boolean
      }
      if (data.truncated)
        throw new Error(`Repository tree of ${this.repo} is too large; set "root" to a subdirectory`)
      const prefix = this.root ? `${this.root}/` : ''
      this.files = data.tree
        .filter((e) => e.type === 'blob' && e.path.startsWith(prefix))
        .map((e) => e.path.slice(prefix.length))
        .sort()
    }
    return this.files.filter((p) => matchGlob(p, patterns))
  }

  async readText(path: string): Promise<string> {
    const sha = await this.commit()
    const full = (this.root ? `${this.root}/` : '') + path.replace(/^\//, '')
    const encoded = full.split('/').map(encodeURIComponent).join('/')
    const res = this.opts.token
      ? await this.fetchImpl(`${this.api}/repos/${this.repo}/contents/${encoded}?ref=${sha}`, {
          headers: { Accept: 'application/vnd.github.raw', Authorization: `Bearer ${this.opts.token}` },
        })
      : await this.fetchImpl(`${this.raw}/${this.repo}/${sha}/${encoded}`)
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path}`)
    return res.text()
  }

  async meta(): Promise<SourceMeta> {
    const m: SourceMeta = { kind: 'github', repo: this.repo, ref: this.ref, commit: await this.commit() }
    if (this.root) m.path = this.root
    return m
  }
}
