import type { Source } from '@dsgraph/core'
import { GitHubSource } from './github.js'
import { NpmSource } from './npm.js'

/** A remote source written as a string: `npm:@scope/pkg@^2` or `github:owner/repo/path@ref`. */
export type RemoteSpec =
  | { kind: 'npm'; pkg: string; version: string }
  | { kind: 'github'; repo: string; root?: string; ref: string }

const NPM = /^npm:((?:@[\w.-]+\/)?[\w.-]+)(?:@(.+))?$/
const GITHUB = /^github:([\w.-]+\/[\w.-]+)(\/[^@]+)?(?:@(.+))?$/

export function parseRemoteSpec(spec: string): RemoteSpec | null {
  const npm = NPM.exec(spec.trim())
  if (npm) return { kind: 'npm', pkg: npm[1]!, version: npm[2] ?? 'latest' }
  const gh = GITHUB.exec(spec.trim())
  if (gh) {
    const out: RemoteSpec = { kind: 'github', repo: gh[1]!, ref: gh[3] ?? 'HEAD' }
    if (gh[2]) out.root = gh[2].slice(1)
    return out
  }
  return null
}

export function formatRemoteSpec(spec: RemoteSpec): string {
  return spec.kind === 'npm'
    ? `npm:${spec.pkg}@${spec.version}`
    : `github:${spec.repo}${spec.root ? `/${spec.root}` : ''}@${spec.ref}`
}

export function remoteSource(spec: RemoteSpec, opts: { token?: string; fetch?: typeof fetch } = {}): Source {
  if (spec.kind === 'npm')
    return new NpmSource(spec.pkg, spec.version, opts.fetch ? { fetch: opts.fetch } : {})
  const o: ConstructorParameters<typeof GitHubSource>[2] = {}
  if (spec.root) o.root = spec.root
  if (opts.token) o.token = opts.token
  if (opts.fetch) o.fetch = opts.fetch
  return new GitHubSource(spec.repo, spec.ref, o)
}
