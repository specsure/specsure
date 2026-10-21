import { formatRemoteSpec } from '@dsgraph/sources'
import type { CodeInput, SideInput } from './types'

/**
 * Passing a design system and the app's code from one tool to another in the same tab. Code and
 * dropped files never go into an address, so they travel in sessionStorage, read once and removed;
 * a package or a repository goes into the address too, so the link still works on its own.
 */
export interface Handover {
  source: SideInput
  include: string
  code?: CodeInput
}

const KEY = 'specsure.handover'

/** The address of Token Fix for a source, and the handover saved for it; false when it did not fit. */
export function handTo(path: string, h: Handover): { href: string; saved: boolean } {
  const q = new URLSearchParams()
  if (h.source.kind === 'npm') {
    q.set('pkg', h.source.pkg)
    q.set('v', h.source.version)
  } else if (h.source.kind === 'github') q.set('src', formatRemoteSpec(h.source))
  if (h.include) q.set('files', h.include)
  let saved = false
  if (h.source.kind === 'files' || h.code) {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ ...h, at: Date.now() }))
      q.set('handover', '')
      saved = true
    } catch {
      // Too large for the tab's storage: the link carries what it can.
    }
  }
  const query = q
    .toString()
    .replace(/%40/g, '@')
    .replace(/%2F/g, '/')
    .replace(/%3A/g, ':')
    .replace(/=$|=(?=&)/g, '')
  return { href: `${path}${query ? `?${query}` : ''}`, saved }
}

/** The handover left for this page, if one was left in the last minute; it is removed when read. */
export function takeHandover(): Handover | undefined {
  try {
    const raw = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    if (!raw) return undefined
    const h = JSON.parse(raw) as Handover & { at: number }
    return Date.now() - h.at < 60_000 ? h : undefined
  } catch {
    return undefined
  }
}
