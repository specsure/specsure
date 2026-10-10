import { buildSnapshot, DiagnosticBag, DsGraph, diff, systemFromDocuments } from '@dsgraph/core'
import { describe, expect, it } from 'vitest'
import { formatChangeset, formatFindings, formatValue } from '../src/index.js'

const srgb = (r: number, g: number, b: number) => ({ colorSpace: 'srgb', components: [r, g, b] })
const g = async (tree: unknown) =>
  DsGraph.from(
    await buildSnapshot(systemFromDocuments([{ file: 't.tokens.json', tree }]), {
      diagnostics: new DiagnosticBag(),
      source: { kind: 'npm', package: '@acme/tokens', version: '1.0.0' },
    }),
  )

describe('values', () => {
  it('formats colors, dimensions and shadows', () => {
    expect(formatValue('color', { space: 'srgb', components: [0, 0, 0], alpha: 0.5 })).toBe('#000000 50%')
    expect(formatValue('dimension', { value: 1.5, unit: 'rem' })).toBe('1.5rem')
    expect(
      formatValue('shadow', [
        {
          color: { space: 'srgb', components: [0, 0, 0], alpha: 1 },
          offsetX: { value: 0, unit: 'px' },
          offsetY: { value: 1, unit: 'px' },
          blur: { value: 2, unit: 'px' },
          spread: { value: 0, unit: 'px' },
          inset: false,
        },
      ]),
    ).toBe('0px 1px 2px 0px #000000')
  })
})

describe('changeset', () => {
  it('groups by level and lists propagated changes under their cause', async () => {
    const base = await g({
      color: { $type: 'color', brand: { $value: srgb(0.18, 0.36, 1) }, old: { $value: srgb(1, 1, 1) } },
      action: { $type: 'color', bg: { $value: '{color.brand}' }, border: { $value: '{color.brand}' } },
    })
    const head = await g({
      color: { $type: 'color', brand: { $value: srgb(0.2, 0.4, 1) } },
      action: { $type: 'color', bg: { $value: '{color.brand}' }, border: { $value: '{color.brand}' } },
    })
    const cs = await diff(base, head)
    const types = new Map(head.tokens().map((t) => [t.id, t.type]))
    const md = formatChangeset(cs, { format: 'markdown', types })
    expect(md).toContain('## dsgraph diff — suggested bump: major')
    expect(md).toContain('### Breaking (major) (1)')
    expect(md).toContain('- removed `color.old`')
    expect(md).toMatch(/- `color\.brand`: #2e5cff → #3366ff \(ΔE \d+(\.\d+)?\)/)
    expect(md).toContain('  - affects `action.bg`, `action.border`')
    expect(md).not.toMatch(/^- `action\.bg`/m)
    expect(formatChangeset(cs)).toContain('1 removed · 1 changed (+2 via aliases)')
  })

  it('says when there are no changes', async () => {
    const a = await g({ n: { $type: 'number', $value: 1 } })
    expect(formatChangeset(await diff(a, a))).toContain('no changes')
  })
})

describe('findings', () => {
  it('formats a summary and rows', () => {
    const text = formatFindings([
      {
        id: 'x#1',
        rule: 'color/hex-mismatch',
        severity: 'warning',
        message: 'm',
        nodes: ['a'],
        loc: { file: 't.json' },
      },
    ])
    expect(text).toContain('0 errors · 1 warnings · 0 info')
    expect(formatFindings([], { format: 'markdown' })).toBe('## dsgraph check — no findings\n')
  })
})

describe('findings', () => {
  const f = (rule: string, message: string, node: string, severity: 'error' | 'warning' = 'warning') => ({
    id: `${rule}#${node}`,
    rule,
    severity,
    message,
    nodes: [node],
    loc: { file: 'a.tokens.json', pointer: `/${node}` },
  })
  const findings = [
    f('dtcg/untyped', 'Token "x" has no $type', 'x', 'error'),
    ...['a', 'b', 'c', 'd', 'e'].map((n) =>
      f('dtcg/legacy-syntax', `Color "#${n}" is a string; use "object"`, n),
    ),
  ]

  it('groups messages that differ only in quoted values and keeps shared ones', async () => {
    const { groupFindings } = await import('../src/index.js')
    const groups = groupFindings(findings)
    expect(groups.map((g) => [g.rule, g.findings.length, g.pattern, g.file])).toEqual([
      ['dtcg/untyped', 1, 'Token "x" has no $type', 'a.tokens.json'],
      ['dtcg/legacy-syntax', 5, 'Color "…" is a string; use "object"', 'a.tokens.json'],
    ])
  })

  it('collapses repeated findings in text and markdown, and lists all with group: false', () => {
    const text = formatFindings(findings)
    expect(text).toContain('5× Color "…" is a string; use "object"  (a.tokens.json)')
    expect(text).toContain('a, b, c, … and 2 more')
    expect(
      formatFindings(findings, { group: false })
        .split('\n')
        .filter((l) => l.includes('legacy')),
    ).toHaveLength(5)
    const md = formatFindings(findings, { format: 'markdown' })
    expect(md).toContain(
      '| ▲ warning | `dtcg/legacy-syntax` | 5 | Color "…" is a string; use "object" | `a.tokens.json` |',
    )
    expect(md).toContain(
      '<details><summary>▲ <code>dtcg/legacy-syntax</code> — 5 × Color "…" is a string; use "object"</summary>',
    )
    expect(md).toContain('- Color "#e" is a string; use "object" — `e`')
  })
})
