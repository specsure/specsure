import type { Finding, Severity } from '@dsgraph/core'
import type { Format } from './changeset.js'
import { formatWhen } from './values.js'

const ICON: Record<Severity, string> = { error: '✖', warning: '▲', info: '•' }

/** Findings of one rule whose messages differ only in quoted values (`Color "…" is a string`). */
export interface FindingGroup {
  rule: string
  severity: Severity
  /** The message with quoted values replaced by `"…"`; the message itself for a group of one. */
  pattern: string
  findings: Finding[]
  /** The file shared by every finding, if any. */
  file?: string
}

const QUOTED = /"[^"]*"/g
/** What differs between repeated messages: quoted values and numbers (`steps 0 and 1`). */
const VARIABLE = /"[^"]*"|\b\d+(?:\.\d+)?\b/g
const mask = (part: string) => (part.startsWith('"') ? '"…"' : '…')

/** Groups repeated findings: same rule, same severity, same message up to quoted values and numbers. Order is kept. */
export function groupFindings(findings: readonly Finding[]): FindingGroup[] {
  const groups = new Map<string, FindingGroup>()
  for (const f of findings) {
    const pattern = f.message.replace(VARIABLE, mask)
    const key = `${f.severity}\u0000${f.rule}\u0000${pattern}`
    const g = groups.get(key)
    if (g) g.findings.push(f)
    else groups.set(key, { rule: f.rule, severity: f.severity, pattern, findings: [f] })
  }
  for (const g of groups.values()) {
    g.pattern = restoreShared(g.findings.map((f) => f.message))
    const files = new Set(g.findings.map((f) => f.loc?.file))
    const [file] = files
    if (files.size === 1 && file) g.file = file
  }
  return [...groups.values()]
}

/** Masks only the values that differ between messages; a shared one stays (`use "px"`, `2025.10`). */
function restoreShared(messages: string[]): string {
  const parts = messages.map((m) => m.match(VARIABLE) ?? [])
  let i = 0
  return messages[0]!.replace(VARIABLE, (q) => {
    const k = i++
    return parts.every((ps) => ps[k] === q) ? q : mask(q)
  })
}

/** What tells one finding of a group from another: its token, else the quoted values of its message. */
export function findingLabel(f: Finding): string {
  const subject = f.nodes[0] ?? f.message.match(QUOTED)?.join(' ') ?? f.message
  return `${subject}${formatWhen(f.when)}`
}

export interface FindingsFormatOptions {
  format?: Format
  /**
   * Collapse repeated findings (default true). Text lists `examples` labels per group;
   * Markdown puts every finding of a group into a `<details>` block, up to `maxListed`.
   */
  group?: boolean
  examples?: number
  maxListed?: number
}

const summaryOf = (findings: readonly Finding[]): string => {
  const counts = { error: 0, warning: 0, info: 0 }
  for (const f of findings) counts[f.severity]++
  return `${counts.error} errors · ${counts.warning} warnings · ${counts.info} info`
}

const cell = (s: string) => s.replace(/\|/g, '\\|')

export function formatFindings(findings: readonly Finding[], opts: FindingsFormatOptions = {}): string {
  const format = opts.format ?? 'text'
  if (format === 'json') return `${JSON.stringify(findings, null, 2)}\n`
  const grouped = opts.group ?? true
  const md = format === 'markdown'
  if (findings.length === 0) return md ? '## dsgraph check — no findings\n' : 'dsgraph check — no findings\n'
  const summary = summaryOf(findings)

  if (md) {
    if (!grouped) {
      const rows = findings.map(
        (f) =>
          `| ${ICON[f.severity]} ${f.severity} | \`${f.rule}\` | ${cell(f.message)}${formatWhen(f.when)} | ${f.loc?.file ? `\`${f.loc.file}\`` : ''} |`,
      )
      return `## dsgraph check — ${summary}\n\n| | Rule | Finding | File |\n|---|---|---|---|\n${rows.join('\n')}\n`
    }
    const groups = groupFindings(findings)
    const max = opts.maxListed ?? 50
    const rows = groups.map(
      (g) =>
        `| ${ICON[g.severity]} ${g.severity} | \`${g.rule}\` | ${g.findings.length} | ${cell(g.pattern)}${g.findings.length === 1 ? formatWhen(g.findings[0]!.when) : ''} | ${g.file ? `\`${g.file}\`` : ''} |`,
    )
    const details = groups
      .filter((g) => g.findings.length > 1)
      .map((g) => {
        const items = g.findings
          .slice(0, max)
          .map((f) => `- ${cell(f.message)}${formatWhen(f.when)}${f.nodes[0] ? ` — \`${f.nodes[0]}\`` : ''}`)
        if (g.findings.length > max) items.push(`- … and ${g.findings.length - max} more`)
        return `<details><summary>${ICON[g.severity]} <code>${g.rule}</code> — ${g.findings.length} × ${escapeHtml(g.pattern)}</summary>\n\n${items.join('\n')}\n\n</details>`
      })
    return `## dsgraph check — ${summary}\n\n| | Rule | Count | Finding | File |\n|---|---|---|---|---|\n${rows.join('\n')}\n${details.length ? `\n${details.join('\n\n')}\n` : ''}`
  }

  const line = (severity: Severity, rule: string, text: string) =>
    `${ICON[severity]} ${severity.padEnd(7)} ${rule.padEnd(30)} ${text}`
  if (!grouped)
    return `dsgraph check — ${summary}\n\n${findings
      .map((f) =>
        line(
          f.severity,
          f.rule,
          `${f.message}${formatWhen(f.when)}${f.loc?.file ? `  (${f.loc.file})` : ''}`,
        ),
      )
      .join('\n')}\n`

  const examples = opts.examples ?? 3
  const indent = ' '.repeat(41)
  const lines: string[] = []
  for (const g of groupFindings(findings)) {
    const n = g.findings.length
    const file = g.file ? `  (${g.file})` : ''
    if (n === 1) {
      const f = g.findings[0]!
      lines.push(
        line(
          f.severity,
          f.rule,
          `${f.message}${formatWhen(f.when)}${f.loc?.file ? `  (${f.loc.file})` : ''}`,
        ),
      )
      continue
    }
    lines.push(line(g.severity, g.rule, `${n}× ${g.pattern}${file}`))
    const labels = g.findings.slice(0, examples).map(findingLabel)
    lines.push(`${indent}${labels.join(', ')}${n > examples ? `, … and ${n - examples} more` : ''}`)
  }
  return `dsgraph check — ${summary}\n\n${lines.join('\n')}\n`
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
