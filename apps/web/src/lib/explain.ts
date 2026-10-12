import type { Change, Changeset, Level } from '@dsgraph/core'

/**
 * Plain-language lines for the report: why a release gets its level, what one change means for
 * the people who use the tokens, and how big a color difference looks.
 */

const MAJOR_WORDS: Partial<Record<Change['kind'], string>> = {
  'token.removed': 'removed',
  'token.renamed': 'renamed',
  'token.type-changed': 'changed type',
  'token.missing-in-context': 'missing in a theme',
  'modifier.removed': 'a theme removed',
  'context.removed': 'a theme removed',
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** One sentence under the verdict: what made the level, and what it means. */
export function verdictReason(cs: Changeset): string {
  const direct = cs.changes.filter((c) => c.origin === 'direct')
  switch (cs.summary.level) {
    case 'major': {
      const breaking = direct.filter((c) => c.level === 'major')
      const words = [...new Set(breaking.map((c) => MAJOR_WORDS[c.kind]).filter(Boolean))]
      const what = words.length ? words.join(' or ') : 'changed in a breaking way'
      return `${plural(breaking.length, 'token')} ${breaking.length === 1 ? 'was' : 'were'} ${what}: code and designs that use ${breaking.length === 1 ? 'it' : 'them'} stop working until they are updated.`
    }
    case 'minor':
      return 'Values changed or tokens were added. Nothing that uses the tokens breaks, but people will see the difference.'
    case 'patch':
      return 'Only changes that are hard to notice: tiny color or size shifts, references, descriptions.'
    default:
      return direct.length
        ? 'Only notation or metadata changed: nobody using the tokens sees a difference.'
        : 'The two versions hold the same tokens with the same values.'
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
const NAME: Record<Level, string> = { major: 'major', minor: 'minor', patch: 'patch', none: 'no' }

/** How the release was published compared with what its token changes need, when versions are known. */
export function publishedNote(cs: Changeset): { text: string; tone: 'warning' | 'muted' } | undefined {
  const versions = versionsOf(cs)
  if (!versions) return undefined
  const published = bumpOf(...versions)
  const needed = cs.summary.level
  if (published === 'none') return undefined
  if (RANK[published] < RANK[needed])
    return {
      text: `Published as a ${NAME[published]} version, but the token changes need a ${NAME[needed]} one.`,
      tone: 'warning',
    }
  if (RANK[published] > RANK[needed])
    return {
      text: `Published as a ${NAME[published]} version; the token changes alone need ${needed === 'none' ? 'no new version' : `a ${NAME[needed]} one`}. Other changes in the package may explain the rest.`,
      tone: 'muted',
    }
  return {
    text: `Published as a ${NAME[published]} version, which matches the token changes.`,
    tone: 'muted',
  }
}

/** What one change means for people who use the token. */
export function meaningOf(c: Change): string {
  switch (c.kind) {
    case 'token.removed':
      return c.possibleRenames?.length
        ? 'Gone from the new version. It may have been renamed to one of the tokens below; check before you update.'
        : 'Gone from the new version: code and designs that use it stop working.'
    case 'token.renamed':
      return c.confidence < 1
        ? 'Same value under a new name, matched by name and value. Everything that uses the old name has to switch.'
        : 'Same token under a new name. Everything that uses the old name has to switch.'
    case 'token.added':
      return 'New in this version. Nothing breaks.'
    case 'token.value-changed':
      return c.level === 'patch'
        ? 'The value moved so little that people are unlikely to notice.'
        : 'Everything that uses this token will look different after the update.'
    case 'token.alias-retargeted':
      return 'Now points to another token, with the same resulting value. Nothing looks different today, but it will follow the new token from now on.'
    case 'token.type-changed':
      return 'The kind of value changed (for example, from a size to a number). Code that reads it may break.'
    case 'token.missing-in-context':
      return 'Missing in this theme, so the theme falls back or breaks.'
    case 'token.contexts-changed':
      return 'Now differs between themes (or stopped differing). Check it in each theme.'
    case 'token.deprecated':
      return 'Marked as deprecated: it still works, but will go away. Switch to the replacement.'
    case 'token.undeprecated':
      return 'No longer deprecated.'
    case 'token.notation-changed':
      return 'Written differently, same value. Nobody sees a difference.'
    case 'token.description-changed':
      return 'Only the description changed.'
    case 'token.extensions-changed':
      return 'Only tool metadata changed. Nobody sees a difference.'
    default:
      return ''
  }
}

/** How big a color difference looks (ΔE in OKLab ×100). */
export function deltaWords(deltaE: number): string {
  if (deltaE < 1) return 'invisible'
  if (deltaE < 2) return 'barely visible side by side'
  if (deltaE < 5) return 'noticeable side by side'
  if (deltaE < 10) return 'clearly visible'
  return 'a different color'
}

/** `{ theme: "dark" }` → `theme: dark`; no condition → `every theme` (or `everywhere`). */
export function appliesIn(when: Change['when'], axes: string[]): string {
  if (when && Object.keys(when).length)
    return Object.entries(when)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')
  return axes.length === 1 ? `every ${axes[0]}` : axes.length ? 'every combination' : 'everywhere'
}

/** Plain words for common checks: what the rule means and whether it needs action. */
export const CHECK_HELP: Record<string, string> = {
  'dtcg/legacy-syntax':
    'Written in an older style (a color or size as text). Most tools read it; the DTCG 2025.10 format asks for objects.',
  'dtcg/invalid-unit':
    'A unit other than px or rem. Fine for CSS, but other platforms may not understand it.',
  'dtcg/typography-missing-field':
    'A text style without one of its parts; tools fill it in with their own default.',
  'dtcg/unknown-type': 'A type the DTCG format does not define. Tools that do not know it skip the token.',
  'dtcg/invalid-shadow': 'A shadow with a part the format does not define.',
  'dtcg/shadow-missing-spread': 'A shadow without spread; read as 0.',
  'dtcg/unknown-reference': 'Points to a token that does not exist. The value cannot be worked out.',
  'dtcg/alias-cycle': 'Tokens point to each other in a loop, so none of them has a value.',
  'palette/duplicate-stops': 'Two steps of a color ramp are the same color, so one of them adds nothing.',
  'palette/non-monotonic': 'A color ramp gets lighter where it should get darker (or the other way round).',
  'color/out-of-gamut': 'A color outside what most screens show; it will be clipped.',
  'color/hex-mismatch': 'The hex fallback does not match the color itself.',
  'token/deprecated-reference': 'Uses a deprecated token.',
  'naming/normalized-collision': 'Two names differ only in case or separators and will collide in code.',
  'a11y/contrast-matrix': 'Text and background pairs below the contrast you asked for.',
  'layer/alias-depth': 'A long chain of references, which is hard to follow.',
  'layer/allowed-sources': 'A token points into a layer it should not use.',
}
