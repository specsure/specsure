import type { Change, Changeset, Impact, ImpactSite, Level } from '@dsgraph/core'
import { type ChangeGroup, colorDirection, colorSize, groupOf, valueOfSide } from './meaning.js'
import { formatDelta, formatSide, formatSource, formatValue, formatWhen } from './values.js'

export type Format = 'text' | 'markdown' | 'json'

export interface ChangesetFormatOptions {
  format?: Format
  /** Token types by id (from the head graph) for value formatting. */
  types?: Map<string, string | null>
  /** Max tokens named under a change that they follow through references. */
  maxPropagated?: number
  /** Where the changes reach into a project's code (`impactOf`); adds an "In your code" section. */
  impact?: Impact
  /** Max places listed in the code section. */
  maxSites?: number
  /**
   * With `impact`: only what reaches the code and what breaks; the rest becomes one line.
   * For people upgrading a token package, not releasing one.
   */
  focusOnCode?: boolean
  /**
   * The default context of each modifier (`DsGraph.defaultInput()`), for the version a removed
   * token was in (`base`) and an added one is in (`head`): its value is listed first.
   */
  defaults?: { base?: Record<string, string>; head?: Record<string, string> }
}

const TITLE: Record<Level, string> = {
  major: 'Breaking release',
  minor: 'Minor release',
  patch: 'Patch release',
  none: 'No visible changes',
}

const SECTION: Record<ChangeGroup, string> = {
  breaks: 'Breaks',
  looks: 'Looks different',
  added: 'New',
  deprecated: 'Deprecated',
  other: 'Other changes',
  quiet: 'Hard to notice',
}

const DIRECTION = {
  lighter: 'lighter',
  darker: 'darker',
  'more-saturated': 'more saturated',
  'less-saturated': 'less saturated',
  hue: 'another hue',
  alpha: 'another opacity',
} as const

const SIZE = {
  invisible: 'invisible',
  barely: 'barely visible',
  noticeable: 'noticeable',
  clear: 'clearly visible',
  different: 'very different',
} as const

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** One sentence under the title: what made the level, and what it means for the people who use the tokens. */
function reasonOf(cs: Changeset): string {
  const direct = cs.changes.filter((c) => c.origin === 'direct')
  if (cs.changes.length === 0) return 'The two versions hold the same tokens with the same values.'
  switch (cs.summary.level) {
    case 'major': {
      const breaking = direct.filter((c) => c.level === 'major')
      const words: Partial<Record<Change['kind'], string>> = {
        'token.removed': 'removed',
        'token.renamed': 'renamed',
        'token.type-changed': 'given another type',
        'token.missing-in-context': 'left out of a theme',
      }
      const what =
        [...new Set(breaking.map((c) => words[c.kind]).filter(Boolean))].join(' or ') ||
        'changed in a breaking way'
      const n = breaking.length
      return `${plural(n, 'token')} ${n === 1 ? 'was' : 'were'} ${what}: code and designs that use ${n === 1 ? 'it' : 'them'} stop working until they are updated.`
    }
    case 'minor':
      return 'Values changed or tokens were added. Nothing that uses the tokens breaks, but people will see the difference.'
    case 'patch':
      return 'Only changes that are hard to notice: tiny color or size shifts, references, descriptions.'
    default:
      return 'Only the way values are written changed; nobody will see a difference.'
  }
}

/** The difference in words: `lighter, noticeable (ΔE 3.4)`, `+2px`. */
function differenceOf(c: Change): string {
  const d = c.delta
  if (typeof d?.deltaEOK === 'number') {
    const dir = colorDirection(c.before, c.after)
    return `${dir ? `${DIRECTION[dir]}, ` : ''}${SIZE[colorSize(d.deltaEOK)]} (ΔE ${d.deltaEOK})`
  }
  // Shadow and border layers by number mean little to a reader; the changed fields say enough.
  const text = formatDelta(d && { ...d, layers: undefined, stops: undefined })
  return text || fieldsChanged(valueOfSide(c.before), valueOfSide(c.after))
}

const FIELD: Record<string, string> = {
  offsetX: 'x offset',
  offsetY: 'y offset',
  fontSize: 'size',
  fontWeight: 'weight',
  fontFamily: 'font',
  lineHeight: 'line height',
  letterSpacing: 'letter spacing',
}

/** `changed: blur, color` for composite values (shadow, border, typography). */
function fieldsChanged(a: unknown, b: unknown): string {
  const layers = (v: unknown) => (Array.isArray(v) ? v : [v]) as Array<Record<string, unknown> | undefined>
  const la = layers(a)
  const lb = layers(b)
  if (la.length !== lb.length) return `${la.length} → ${lb.length} layers`
  const fields = new Set<string>()
  la.forEach((x, i) => {
    const y = lb[i]
    if (!x || !y || typeof x !== 'object' || typeof y !== 'object') return
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)]))
      if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) fields.add(FIELD[k] ?? k)
  })
  return fields.size ? `changed: ${[...fields].join(', ')}` : ''
}

const hasValue = (s: unknown) => typeof s === 'object' && s !== null && 'value' in s

export function formatChangeset(cs: Changeset, opts: ChangesetFormatOptions = {}): string {
  const format = opts.format ?? 'text'
  if (format === 'json')
    return `${JSON.stringify(opts.impact ? { ...cs, impact: opts.impact } : cs, null, 2)}\n`
  const md = format === 'markdown'
  const code = (s: string) => (md ? `\`${s}\`` : s)
  const cell = (s: string) => s.replace(/\|/g, '\\|')
  const types = opts.types ?? new Map()
  const max = opts.maxPropagated ?? 5
  const maxSites = opts.maxSites ?? 50
  const typeOf = (c: Change) => {
    const side = (c.after ?? c.before) as { type?: string | null } | undefined
    return (
      types.get(c.target) ?? (side && typeof side === 'object' && 'type' in side ? (side.type ?? null) : null)
    )
  }
  /** A side's value; colors in backticks so that GitHub draws a swatch. */
  const val = (c: Change, side: unknown) => {
    if (!hasValue(side)) return md ? code(formatValue(typeOf(c), side)) : formatValue(typeOf(c), side)
    if (!md) return formatSide(typeOf(c), side)
    // The value on its own in backticks, so that GitHub draws a color swatch; the reference after it.
    const raw = (side as { raw?: unknown }).raw
    const alias = typeof raw === 'string' && /^\{[^{}]+\}$/.test(raw) ? raw.slice(1, -1) : undefined
    return `${code(formatValue(typeOf(c), (side as { value: unknown }).value))}${alias ? ` (from ${code(alias)})` : ''}`
  }
  const name = (c: Change) => `${code(c.target)}${formatWhen(c.when)}`
  /**
   * An added or removed token's values: one when every theme agrees, else each with its theme,
   * the default first and the rest as the resolver lists them (`#ffffff in light · #17171c in dark`).
   */
  const valuesOf = (c: Change, side: unknown, defaults: Record<string, string> | undefined) => {
    type Entry = { when?: Record<string, string>; raw?: unknown; value: unknown }
    const entries = (side as { values?: Entry[] } | undefined)?.values ?? []
    const shown = entries.map((e) => ({ when: e.when ?? {}, text: val(c, e) }))
    if (new Set(shown.map((s) => s.text)).size <= 1) return shown[0]?.text ?? ''
    const matches = (when: Record<string, string>, input: Record<string, string>) =>
      Object.entries(when).every(([k, v]) => input[k] === v)
    const rank = (when: Record<string, string>) => {
      if (defaults && matches(when, defaults)) return -1
      const i = cs.contexts.compared.findIndex((input) => matches(when, input))
      return i < 0 ? cs.contexts.compared.length : i
    }
    const keys = new Set(shown.flatMap((s) => Object.keys(s.when)))
    // One modifier: the context's name is enough; several: each named.
    const label = (when: Record<string, string>) =>
      keys.size === 1
        ? Object.values(when).join('')
        : Object.entries(when)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ')
    return shown
      .map((s, i) => ({ ...s, i, rank: rank(s.when) }))
      .sort((a, b) => a.rank - b.rank || a.i - b.i)
      .map((s) => `${s.text}${Object.keys(s.when).length ? ` in ${label(s.when)}` : ''}`)
      .join(' · ')
  }

  const propagatedBy = new Map<string, Change[]>()
  for (const c of cs.changes)
    for (const cause of c.cause) propagatedBy.set(cause, [...(propagatedBy.get(cause) ?? []), c])
  const alsoOf = (c: Change) => {
    const names = [...new Set((propagatedBy.get(c.id) ?? []).map((p) => p.target))]
    if (!names.length) return ''
    const listed = names.slice(0, max).map(code).join(', ')
    return `also changes ${listed}${names.length > max ? ` and ${names.length - max} more` : ''}`
  }

  const listed = cs.changes.filter((c) => !(c.origin === 'propagated' && c.cause.length > 0))
  const reaching = new Set((opts.impact?.changes ?? []).map((ci) => ci.change))
  const focus = !!(opts.focusOnCode && opts.impact)
  const shown = focus ? listed.filter((c) => reaching.has(c.id) || c.level === 'major') : listed
  const hidden = listed.length - shown.length
  const byGroup = new Map<ChangeGroup, Change[]>()
  for (const c of shown) byGroup.set(groupOf(c), [...(byGroup.get(groupOf(c)) ?? []), c])

  const lines: string[] = []
  const heading = (text: string, level: 2 | 3) => lines.push(md ? `${'#'.repeat(level)} ${text}` : text, '')

  // Title, sources, the reason in one sentence, the counts.
  const title = cs.changes.length === 0 ? 'No changes' : TITLE[cs.summary.level]
  heading(md ? title : `dsgraph diff — ${title}`, 2)
  lines.push(
    `${code(formatSource(cs.base.source))} → ${code(formatSource(cs.head.source))}${cs.changes.length ? ` · suggested version: ${md ? `**${cs.summary.level}**` : cs.summary.level}` : ''}`,
    '',
    reasonOf(cs),
    '',
  )
  const counts = cs.summary.counts
  const summary = [
    counts.removed ? `${counts.removed} removed` : '',
    counts.renamed ? `${counts.renamed} renamed` : '',
    counts.changed
      ? `${counts.changed} changed${counts.propagated ? ` (+${counts.propagated} through references)` : ''}`
      : '',
    counts.added ? `${counts.added} added` : '',
    counts.deprecated ? `${counts.deprecated} deprecated` : '',
  ].filter(Boolean)
  if (summary.length) lines.push(summary.join(' · '), '')

  // Your code first: the places to fix are what a pull request author needs.
  if (opts.impact) {
    const impact = opts.impact
    heading('In your code', 3)
    if (impact.breaks === 0 && impact.looksDifferent === 0)
      lines.push('Nothing in the code uses the changed tokens.', '')
    else {
      lines.push(
        `${[
          impact.breaks
            ? `${plural(impact.breaks, 'place')} ${impact.breaks === 1 ? 'breaks' : 'break'}`
            : '',
          impact.looksDifferent
            ? `${plural(impact.looksDifferent, 'place')} ${impact.looksDifferent === 1 ? 'looks' : 'look'} different`
            : '',
        ]
          .filter(Boolean)
          .join(', ')
          .replace(/^./, (ch) => ch.toUpperCase())} (${plural(impact.files.length, 'file')}).`,
        '',
      )
      const byChange = new Map(cs.changes.map((c) => [c.id, c]))
      // One row per place; a place several changes reach lists them all.
      const rows = new Map<string, { site: ImpactSite; what: string[]; breaks: boolean }>()
      for (const ci of impact.changes) {
        const c = byChange.get(ci.change)
        for (const site of ci.sites) {
          const own = site.token === ci.target || (c?.kind === 'token.renamed' && site.token === c.from)
          const what =
            c?.kind === 'token.removed'
              ? `breaks: ${code(ci.target)} was removed${c.possibleRenames?.length ? `, maybe renamed to ${code(c.possibleRenames[0]!)}` : ''}`
              : c?.kind === 'token.renamed'
                ? `breaks: renamed to ${code(ci.target)}`
                : ci.effect === 'breaks'
                  ? `breaks: ${code(ci.target)} ${c ? describeKind(c) : 'changed'}`
                  : `looks different: ${code(ci.target)} changed${formatWhen(c?.when)}${own ? '' : ` (used through ${code(site.token)})`}`
          const key = `${site.file}:${site.line}:${site.column}:${site.text ?? site.name}`
          const row = rows.get(key) ?? { site, what: [], breaks: false }
          row.what.push(what)
          row.breaks ||= ci.effect === 'breaks'
          rows.set(key, row)
        }
      }
      const sorted = [...rows.values()].sort(
        (a, b) =>
          Number(b.breaks) - Number(a.breaks) ||
          a.site.file.localeCompare(b.site.file) ||
          a.site.line - b.site.line,
      )
      const usesOf = (s: ImpactSite) => s.text ?? s.name
      const shownRows = sorted.slice(0, maxSites)
      if (md) {
        lines.push('| Where | Uses | What happens |', '|---|---|---|')
        for (const r of shownRows)
          lines.push(
            `| ${code(`${r.site.file}:${r.site.line}`)} | ${code(cell(usesOf(r.site)))} | ${cell(joinWhat(r.what))} |`,
          )
      } else {
        const width = Math.min(40, Math.max(...shownRows.map((r) => `${r.site.file}:${r.site.line}`.length)))
        for (const r of shownRows)
          lines.push(
            `  ${`${r.site.file}:${r.site.line}`.padEnd(width)}  ${usesOf(r.site)}  ${joinWhat(r.what)}`,
          )
      }
      if (sorted.length > maxSites) lines.push('', `…and ${plural(sorted.length - maxSites, 'more place')}.`)
      lines.push('')
    }
  }

  const section = (group: ChangeGroup, render: (items: Change[]) => void) => {
    const items = byGroup.get(group)
    if (!items?.length) return
    const quiet = group === 'quiet'
    if (md && quiet) lines.push(`<details><summary>${SECTION[group]} (${items.length})</summary>`, '')
    else heading(`${SECTION[group]} (${items.length})`, 3)
    render(items)
    lines.push('')
    if (md && quiet) lines.push('</details>', '')
  }
  const bullet = md ? '- ' : '  '
  const sub = md ? '  - ' : '      '

  section('breaks', (items) => {
    for (const c of items) {
      const also = alsoOf(c)
      switch (c.kind) {
        case 'token.removed': {
          const was = valuesOf(c, c.before, opts.defaults?.base)
          lines.push(
            `${bullet}${md ? '**Removed**' : 'Removed'} ${name(c)}${was ? `, it was ${was}` : ''}.${c.possibleRenames?.length ? ` Maybe renamed to ${c.possibleRenames.map(code).join(' or ')}.` : ''}`,
          )
          break
        }
        case 'token.renamed':
          lines.push(
            `${bullet}${md ? '**Renamed**' : 'Renamed'} ${code(c.from ?? '?')} → ${name(c)}: replace the old name.${c.confidence < 1 ? ` A guess from the same value and a similar name (${Math.round(c.confidence * 100)}%): check it.` : ''}`,
          )
          break
        default:
          lines.push(
            `${bullet}${name(c)}: ${describeKind(c)}${hasValue(c.before) || hasValue(c.after) ? `, ${val(c, c.before)} → ${val(c, c.after)}` : ''}.`,
          )
      }
      if (also) lines.push(`${sub}${also}`)
    }
  })

  section('looks', (items) => {
    if (md) {
      lines.push('| Token | Before | After | Difference |', '|---|---|---|---|')
      for (const c of items) {
        const diff = [differenceOf(c), alsoOf(c)].filter(Boolean).join('; ')
        lines.push(
          `| ${cell(name(c))} | ${cell(val(c, c.before))} | ${cell(val(c, c.after))} | ${cell(diff)} |`,
        )
      }
    } else {
      const width = Math.min(40, Math.max(...items.map((c) => name(c).length)))
      for (const c of items) {
        const diff = [differenceOf(c), alsoOf(c)].filter(Boolean).join('; ')
        lines.push(
          `  ${name(c).padEnd(width)}  ${val(c, c.before)} → ${val(c, c.after)}${diff ? `  ${diff}` : ''}`,
        )
      }
    }
  })

  section('added', (items) => {
    for (const c of items) {
      const values = valuesOf(c, c.after, opts.defaults?.head)
      lines.push(`${bullet}${name(c)}${values ? ` ${values}` : ''}`)
    }
  })

  section('deprecated', (items) => {
    for (const c of items) {
      const d = c.after as { replacement?: string; reason?: string } | undefined
      lines.push(
        `${bullet}${name(c)}${d?.replacement ? `: use ${code(d.replacement)}` : d?.reason ? `: ${d.reason}` : ''}`,
      )
    }
  })

  section('other', (items) => {
    for (const c of items) lines.push(`${bullet}${name(c)}: ${describeKind(c)}`)
  })

  section('quiet', (items) => {
    for (const c of items) {
      const diff = c.kind === 'token.value-changed' ? differenceOf(c) : ''
      lines.push(
        `${bullet}${name(c)}: ${c.kind === 'token.value-changed' ? `${val(c, c.before)} → ${val(c, c.after)}${diff ? ` (${diff})` : ''}` : describeKind(c)}`,
      )
    }
  })

  if (hidden)
    lines.push(`${plural(hidden, 'other change')} ${hidden === 1 ? 'does' : 'do'} not reach the code.`, '')
  if (cs.contexts.partial)
    lines.push(
      md
        ? '> Some theme combinations were not compared (too many to compare all).'
        : 'Note: some theme combinations were not compared.',
      '',
    )
  return `${lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()}\n`
}

/** `looks different: a; looks different: b` → `looks different: a; b`. */
function joinWhat(what: string[]): string {
  const out: string[] = []
  let last = ''
  for (const w of what) {
    const [label, ...rest] = w.split(': ')
    const text = rest.join(': ')
    out.push(label === last ? text : w)
    last = label ?? ''
  }
  return out.join('; ')
}

/** A change kind in words, for lines that have no section of their own. */
function describeKind(c: Change): string {
  switch (c.kind) {
    case 'token.type-changed':
      return `type ${String(c.before)} → ${String(c.after)}`
    case 'token.missing-in-context':
      return 'no longer defined here'
    case 'token.notation-changed':
      return 'same value, written differently'
    case 'token.alias-retargeted':
      return 'references another token with the same value'
    case 'token.contexts-changed':
      return `depends on other themes: ${JSON.stringify(c.before)} → ${JSON.stringify(c.after)}`
    case 'token.undeprecated':
      return 'no longer deprecated'
    case 'token.description-changed':
      return 'description changed'
    case 'token.extensions-changed':
      return '$extensions changed'
    case 'group.extends-changed':
      return `group $extends ${String(c.before ?? '—')} → ${String(c.after ?? '—')}`
    case 'context.added':
      return 'theme added'
    case 'context.removed':
      return 'theme removed'
    case 'modifier.added':
      return 'modifier added'
    case 'modifier.removed':
      return 'modifier removed'
    case 'token.value-changed':
      return 'value changed'
    default:
      return c.kind
  }
}

export { formatValue }
