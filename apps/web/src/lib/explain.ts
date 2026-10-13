import type { Change, Changeset, Level } from '@dsgraph/core'
import type { Messages } from '../i18n/messages'

/**
 * Plain-language lines for the report: why a release gets its level, what one change means for
 * the people who use the tokens, and how big a color difference looks. The words come from the
 * page's messages; this module decides which line applies.
 */

/** One sentence under the verdict: what made the level, and what it means. */
export function verdictReason(cs: Changeset, m: Messages): string {
  const direct = cs.changes.filter((c) => c.origin === 'direct')
  switch (cs.summary.level) {
    case 'major': {
      const breaking = direct.filter((c) => c.level === 'major')
      return m.verdict.reason.major(
        breaking.length,
        breaking.map((c) => c.kind),
      )
    }
    case 'minor':
      return m.verdict.reason.minor
    case 'patch':
      return m.verdict.reason.patch
    default:
      return direct.length ? m.verdict.reason.none : m.verdict.reason.same
  }
}

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)/

function versionsOf(cs: Changeset): [string, string] | undefined {
  const pick = (s: Changeset['base']['source']) =>
    s.kind === 'npm' ? s.version : s.kind === 'github' ? s.ref : undefined
  const b = pick(cs.base.source)
  const h = pick(cs.head.source)
  return typeof b === 'string' && typeof h === 'string' && SEMVER.test(b) && SEMVER.test(h)
    ? [b, h]
    : undefined
}

/** The bump between two versions; 0.x treats a minor bump as breaking, as npm does. */
function bumpOf(from: string, to: string): Level {
  const [, a1, a2, a3] = SEMVER.exec(from)!.map(Number)
  const [, b1, b2, b3] = SEMVER.exec(to)!.map(Number)
  if (b1 !== a1) return 'major'
  if (b2 !== a2) return a1 === 0 ? 'major' : 'minor'
  return b3 !== a3 ? 'patch' : 'none'
}

const RANK: Record<Level, number> = { none: 0, patch: 1, minor: 2, major: 3 }

/** How the release was published compared with what its token changes need, when versions are known. */
export function publishedNote(
  cs: Changeset,
  m: Messages,
): { text: string; tone: 'warning' | 'muted' } | undefined {
  const versions = versionsOf(cs)
  if (!versions) return undefined
  const published = bumpOf(...versions)
  const needed = cs.summary.level
  if (published === 'none') return undefined
  if (RANK[published] < RANK[needed])
    return { text: m.verdict.published.lower(published, needed), tone: 'warning' }
  if (RANK[published] > RANK[needed])
    return { text: m.verdict.published.higher(published, needed), tone: 'muted' }
  return { text: m.verdict.published.same(published), tone: 'muted' }
}

/** What one change means for people who use the token. */
export function meaningOf(c: Change, m: Messages): string {
  const t = m.change.meaning
  switch (c.kind) {
    case 'token.removed':
      return c.possibleRenames?.length ? t.removedMaybe : t.removed
    case 'token.renamed':
      return c.confidence < 1 ? t.renamedGuess : t.renamed
    case 'token.added':
      return t.added
    case 'token.value-changed':
      return c.level === 'patch' ? t.valueSmall : t.value
    case 'token.alias-retargeted':
      return t.retargeted
    case 'token.type-changed':
      return t.type
    case 'token.missing-in-context':
      return t.missing
    case 'token.contexts-changed':
      return t.contexts
    case 'token.deprecated':
      return t.deprecated
    case 'token.undeprecated':
      return t.undeprecated
    case 'token.notation-changed':
      return t.notation
    case 'token.description-changed':
      return t.description
    case 'token.extensions-changed':
      return t.extensions
    default:
      return ''
  }
}

/** How big a color difference looks (ΔE in OKLab ×100). */
export function deltaWords(deltaE: number, m: Messages): string {
  const [invisible, barely, noticeable, clear, different] = m.change.delta
  if (deltaE < 1) return invisible!
  if (deltaE < 2) return barely!
  if (deltaE < 5) return noticeable!
  if (deltaE < 10) return clear!
  return different!
}

/** `{ theme: "dark" }` → `theme: dark`; no condition → every theme (or everywhere). */
export function appliesIn(when: Change['when'], axes: string[], m: Messages): string {
  if (when && Object.keys(when).length)
    return Object.entries(when)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')
  return m.change.appliesEverywhere(axes)
}
