import type { Change, Changeset, Level } from '@dsgraph/core'
import { formatDelta, formatSide, formatSource, formatValue, formatWhen } from './values.js'

export type Format = 'text' | 'markdown' | 'json'

const LEVEL_TITLE: Record<Level, string> = {
  major: 'Breaking (major)',
  minor: 'Minor',
  patch: 'Patch',
  none: 'No impact',
}

const typeOf = (c: Change): string | null => {
  const side = (c.after ?? c.before) as { type?: string | null; value?: unknown } | undefined
  if (side && typeof side === 'object' && 'type' in side) return side.type ?? null
  return null
}

/** One line describing a change; `type` comes from the head token when known. */
function describe(c: Change, types: Map<string, string | null>, code: (s: string) => string): string {
  const t = types.get(c.target) ?? typeOf(c)
  const where = formatWhen(c.when)
  switch (c.kind) {
    case 'token.added':
      return `added ${code(c.target)}`
    case 'token.removed': {
      const maybe = c.possibleRenames?.length
        ? ` — possibly renamed to ${c.possibleRenames.map(code).join(' or ')}`
        : ''
      return `removed ${code(c.target)}${maybe}`
    }
    case 'token.renamed':
      return `renamed ${code(c.from ?? '?')} → ${code(c.target)}${c.confidence < 0.8 ? ` (likely, ${c.confidence})` : ''}`
    case 'token.value-changed': {
      const delta = formatDelta(c.delta)
      return `${code(c.target)}${where}: ${formatSide(t, c.before)} → ${formatSide(t, c.after)}${delta ? ` (${delta})` : ''}`
    }
    case 'token.notation-changed':
      return `${code(c.target)}${where}: same value, written differently`
    case 'token.alias-retargeted':
      return `${code(c.target)}${where}: now ${formatSide(t, c.after)}, same value`
    case 'token.type-changed':
      return `${code(c.target)}: type ${String(c.before)} → ${String(c.after)}`
    case 'token.missing-in-context':
      return `${code(c.target)} is no longer defined${where}`
    case 'token.contexts-changed':
      return `${code(c.target)}: depends on ${JSON.stringify(c.before)} → ${JSON.stringify(c.after)}`
    case 'token.deprecated': {
      const d = c.after as { replacement?: string; reason?: string } | undefined
      return `deprecated ${code(c.target)}${d?.replacement ? ` — use ${code(d.replacement)}` : d?.reason ? ` — ${d.reason}` : ''}`
    }
    case 'token.undeprecated':
      return `no longer deprecated ${code(c.target)}`
    case 'token.description-changed':
      return `${code(c.target)}: description changed`
    case 'token.extensions-changed':
      return `${code(c.target)}: $extensions changed`
    case 'group.extends-changed':
      return `group ${code(c.target)}: $extends ${String(c.before ?? '—')} → ${String(c.after ?? '—')}`
    case 'context.added':
    case 'context.removed':
      return `${c.kind === 'context.added' ? 'added' : 'removed'} context ${code(c.target)}`
    case 'modifier.added':
    case 'modifier.removed':
      return `${c.kind === 'modifier.added' ? 'added' : 'removed'} modifier ${code(c.target)}`
    default:
      return `${c.kind} ${code(c.target)}`
  }
}

export interface ChangesetFormatOptions {
  format?: Format
  /** Token types by id (from the head graph) for value formatting. */
  types?: Map<string, string | null>
  /** Max propagated targets listed under a cause. */
  maxPropagated?: number
}

/** Formats a changeset. Propagated value changes are listed under the direct change that caused them. */
export function formatChangeset(cs: Changeset, opts: ChangesetFormatOptions = {}): string {
  const format = opts.format ?? 'text'
  if (format === 'json') return `${JSON.stringify(cs, null, 2)}\n`
  const md = format === 'markdown'
  const code = (s: string) => (md ? `\`${s}\`` : s)
  const types = opts.types ?? new Map()
  const max = opts.maxPropagated ?? 5

  const propagatedBy = new Map<string, Change[]>()
  for (const c of cs.changes)
    for (const cause of c.cause) propagatedBy.set(cause, [...(propagatedBy.get(cause) ?? []), c])
  const shown = cs.changes.filter((c) => !(c.origin === 'propagated' && c.cause.length > 0))

  const counts = cs.summary.counts
  const summary = [
    counts.removed ? `${counts.removed} removed` : '',
    counts.renamed ? `${counts.renamed} renamed` : '',
    counts.changed
      ? `${counts.changed} changed${counts.propagated ? ` (+${counts.propagated} via aliases)` : ''}`
      : '',
    counts.added ? `${counts.added} added` : '',
    counts.deprecated ? `${counts.deprecated} deprecated` : '',
  ].filter(Boolean)

  const lines: string[] = []
  const title = cs.changes.length === 0 ? 'no changes' : `suggested bump: ${cs.summary.level}`
  if (md) {
    lines.push(`## dsgraph diff — ${title}`, '')
    lines.push(`${formatSource(cs.base.source)} → ${formatSource(cs.head.source)}`, '')
    if (summary.length) lines.push(`**${summary.join(' · ')}**`, '')
  } else {
    lines.push(`dsgraph diff — ${title}`, `${formatSource(cs.base.source)} → ${formatSource(cs.head.source)}`)
    if (summary.length) lines.push(summary.join(' · '))
    lines.push('')
  }

  for (const level of ['major', 'minor', 'patch', 'none'] as Level[]) {
    const group = shown.filter((c) => c.level === level)
    if (group.length === 0) continue
    const collapsible = md && (level === 'patch' || level === 'none')
    if (collapsible) lines.push(`<details><summary>${LEVEL_TITLE[level]} (${group.length})</summary>`, '')
    else
      lines.push(
        md ? `### ${LEVEL_TITLE[level]} (${group.length})` : `${LEVEL_TITLE[level]} (${group.length})`,
        '',
      )
    for (const c of group) {
      lines.push(`${md ? '- ' : '  '}${describe(c, types, code)}`)
      const via = propagatedBy.get(c.id)
      if (via?.length) {
        const names = [...new Set(via.map((p) => p.target))]
        const listed = names.slice(0, max).map(code).join(', ')
        lines.push(
          `${md ? '  - ' : '      '}affects ${listed}${names.length > max ? ` and ${names.length - max} more` : ''}`,
        )
      }
    }
    lines.push('')
    if (collapsible) lines.push('</details>', '')
  }
  if (cs.contexts.partial)
    lines.push(
      md
        ? '> Some contexts were not fully compared (too many permutations).'
        : 'Note: some contexts were not fully compared.',
      '',
    )
  return `${lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()}\n`
}

export { formatValue }
