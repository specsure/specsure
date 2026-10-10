import { formatRemoteSpec, parseRemoteSpec } from '@dsgraph/sources'
import type { DroppedFile, SideInput } from './types'

export interface UrlState {
  base?: SideInput
  head?: SideInput
  include: string
  context: Record<string, string>
}

const toSpec = (s: SideInput): string | null => (s.kind === 'files' ? null : formatRemoteSpec(s))

const fromSpec = (spec: string | null): SideInput | undefined => {
  const r = spec ? parseRemoteSpec(spec) : null
  return r ?? undefined
}

/**
 * `?pkg=@scope/tokens&from=1.0.0&to=2.0.0` for two versions of one package, otherwise
 * `?base=npm:…&head=github:…`. Dropped files go into the fragment (`#d=`), compressed, and only
 * when small: the fragment is never sent to a server.
 */
export function readUrl(url: URL): UrlState {
  const q = url.searchParams
  const state: UrlState = { include: q.get('files') ?? '', context: {} }
  const pkg = q.get('pkg')
  if (pkg) {
    state.base = { kind: 'npm', pkg, version: q.get('from') ?? 'latest' }
    state.head = { kind: 'npm', pkg, version: q.get('to') ?? 'latest' }
  } else {
    const base = fromSpec(q.get('base'))
    const head = fromSpec(q.get('head'))
    if (base) state.base = base
    if (head) state.head = head
  }
  for (const pair of (q.get('ctx') ?? '').split(',')) {
    const [k, v] = pair.split(':')
    if (k && v) state.context[k] = v
  }
  return state
}

export function writeUrl(base: string, s: UrlState, fragment = ''): string {
  const q = new URLSearchParams()
  const b = s.base && toSpec(s.base)
  const h = s.head && toSpec(s.head)
  if (s.base?.kind === 'npm' && s.head?.kind === 'npm' && s.base.pkg === s.head.pkg) {
    q.set('pkg', s.base.pkg)
    q.set('from', s.base.version)
    q.set('to', s.head.version)
  } else {
    if (b) q.set('base', b)
    if (h) q.set('head', h)
  }
  if (s.include) q.set('files', s.include)
  const ctx = Object.entries(s.context)
    .map(([k, v]) => `${k}:${v}`)
    .join(',')
  if (ctx) q.set('ctx', ctx)
  const query = q
    .toString()
    .replace(/%40/g, '@')
    .replace(/%2F/g, '/')
    .replace(/%3A/g, ':')
    .replace(/%2C/g, ',')
  return `${base}${query ? `?${query}` : ''}${fragment ? `#${fragment}` : ''}`
}

/** Longest fragment we put into a link; messengers and trackers cut longer addresses. */
export const MAX_FRAGMENT = 6000

const b64url = (bytes: Uint8Array): string => {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const unb64url = (s: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function pipe(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream))
  return new Uint8Array(await out.arrayBuffer())
}

export interface Packed {
  base?: DroppedFile[]
  head?: DroppedFile[]
}

export async function packFiles(p: Packed): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(p))
  return `d=${b64url(await pipe(json, new CompressionStream('deflate-raw')))}`
}

export async function unpackFiles(fragment: string): Promise<Packed | undefined> {
  const m = /(?:^|&)d=([\w-]+)/.exec(fragment.replace(/^#/, ''))
  if (!m) return undefined
  const bytes = await pipe(unb64url(m[1]!), new DecompressionStream('deflate-raw'))
  return JSON.parse(new TextDecoder().decode(bytes)) as Packed
}
