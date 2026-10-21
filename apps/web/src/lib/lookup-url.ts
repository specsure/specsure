import { formatRemoteSpec, parseRemoteSpec } from '@dsgraph/sources'
import type { SideInput } from './types'

export interface LookupUrl {
  source?: SideInput
  include: string
  context: Record<string, string>
  query: string
  /** The open token, `#t=fgColor.accent`. */
  token?: string
}

/**
 * `?pkg=@scope/tokens&v=1.2.0` for a package, `?src=github:owner/repo/tokens@main` otherwise;
 * `ctx=theme:dark`, `q=` for the search. The open token and dropped files go into the fragment
 * (`#t=…&d=…`), which is never sent to a server.
 */
export function readLookupUrl(url: URL): LookupUrl {
  const q = url.searchParams
  const state: LookupUrl = { include: q.get('files') ?? '', context: {}, query: q.get('q') ?? '' }
  const pkg = q.get('pkg')
  if (pkg) state.source = { kind: 'npm', pkg, version: q.get('v') ?? 'latest' }
  else {
    const r = parseRemoteSpec(q.get('src') ?? '')
    if (r) state.source = r
  }
  for (const pair of (q.get('ctx') ?? '').split(',')) {
    const [k, v] = pair.split(':')
    if (k && v) state.context[k] = v
  }
  const t = /(?:^|&)t=([^&]+)/.exec(url.hash.replace(/^#/, ''))
  if (t) state.token = decodeURIComponent(t[1]!)
  return state
}

export function writeLookupUrl(path: string, s: LookupUrl, files = ''): string {
  const q = new URLSearchParams()
  if (s.source?.kind === 'npm') {
    q.set('pkg', s.source.pkg)
    q.set('v', s.source.version)
  } else if (s.source && s.source.kind !== 'files') q.set('src', formatRemoteSpec(s.source))
  if (s.include) q.set('files', s.include)
  const ctx = Object.entries(s.context)
    .map(([k, v]) => `${k}:${v}`)
    .join(',')
  if (ctx) q.set('ctx', ctx)
  if (s.query) q.set('q', s.query)
  const query = q
    .toString()
    .replace(/%40/g, '@')
    .replace(/%2F/g, '/')
    .replace(/%3A/g, ':')
    .replace(/%2C/g, ',')
  const hash = [s.token ? `t=${encodeURIComponent(s.token)}` : '', files].filter(Boolean).join('&')
  return `${path}${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`
}
