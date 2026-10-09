/** Token paths, dot-path globs and cross-source name normalization. */

export const tokenId = (path: readonly string[]): string => path.join('.')

export const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

const segmentRegex = new Map<string, RegExp>()
function segmentMatches(pattern: string, segment: string): boolean {
  if (pattern === '*') return true
  if (!pattern.includes('*')) return pattern === segment
  let re = segmentRegex.get(pattern)
  if (!re) {
    re = new RegExp(`^${pattern.split('*').map(escapeRegex).join('.*')}$`)
    segmentRegex.set(pattern, re)
  }
  return re.test(segment)
}

/**
 * Matches a dot-path token id against a dot-path glob:
 * `*` matches one segment (or part of it), `**` matches zero or more segments.
 */
export function matchPath(id: string, pattern: string): boolean {
  const s = id === '' ? [] : id.split('.')
  const p = pattern === '' ? [] : pattern.split('.')
  const memo = new Map<string, boolean>()
  const go = (i: number, j: number): boolean => {
    const key = `${i}:${j}`
    const cached = memo.get(key)
    if (cached !== undefined) return cached
    let r: boolean
    if (j === p.length) r = i === s.length
    else if (p[j] === '**') r = go(i, j + 1) || (i < s.length && go(i + 1, j))
    else r = i < s.length && segmentMatches(p[j]!, s[i]!) && go(i + 1, j + 1)
    memo.set(key, r)
    return r
  }
  return go(0, 0)
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Converts a file glob (`**`, `*`, `?`, `{a,b}`) to a RegExp over posix paths. */
export function globToRegExp(glob: string): RegExp {
  let re = ''
  let i = 0
  while (i < glob.length) {
    const c = glob[i]!
    if (c === '*') {
      if (glob[i + 1] === '*') {
        const atSegmentStart = i === 0 || glob[i - 1] === '/'
        if (atSegmentStart && glob[i + 2] === '/') {
          re += '(?:.*/)?'
          i += 3
          continue
        }
        re += '.*'
        i += 2
        continue
      }
      re += '[^/]*'
    } else if (c === '?') re += '[^/]'
    else if (c === '{') {
      const end = glob.indexOf('}', i)
      if (end > i) {
        re += `(?:${glob
          .slice(i + 1, end)
          .split(',')
          .map((alt) => globToRegExp(alt).source.slice(1, -1))
          .join('|')})`
        i = end + 1
        continue
      }
      re += '\\{'
    } else re += escapeRegex(c)
    i++
  }
  return new RegExp(`^${re}$`)
}

export function matchGlob(path: string, patterns: string | readonly string[]): boolean {
  const list = typeof patterns === 'string' ? [patterns] : patterns
  let included = false
  for (const p of list) {
    if (p.startsWith('!')) {
      if (globToRegExp(p.slice(1)).test(path)) return false
    } else if (globToRegExp(p).test(path)) included = true
  }
  return included
}

/**
 * Normalized name used only to match tokens across sources (CSS, Figma), never as an id:
 * drops `$root`, splits camelCase, maps separators to dots, lowercases.
 */
export function normalizeName(name: string): string {
  return name
    .replace(/\$root/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1.$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1.$2')
    .toLowerCase()
    .replace(/[\s\-_/.]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
}

/** Normalized token path for a CSS custom property, after stripping `--` and an optional prefix. */
export function cssVarToName(cssVar: string, prefix = '--'): string {
  let n = cssVar.trim()
  if (prefix && n.startsWith(prefix)) n = n.slice(prefix.length)
  else if (n.startsWith('--')) n = n.slice(2)
  return normalizeName(n)
}
