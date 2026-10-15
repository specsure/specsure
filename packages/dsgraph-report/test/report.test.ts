import { buildSnapshot, DiagnosticBag, DsGraph, diff, systemFromDocuments } from '@dsgraph/core'
import { describe, expect, it } from 'vitest'
import {
  colorDirection,
  colorSize,
  formatChangeset,
  formatFindings,
  formatValue,
  groupOf,
} from '../src/index.js'

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
    expect(formatValue('color', { space: 'srgb', components: [0, 0, 0], alpha: 0.5 })).toBe(
      'rgb(0 0 0 / 50%)',
    )
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
    ).toBe('0 1px 2px #000000')
  })
})

describe('changeset', () => {
  it('groups by meaning, says why, and lists propagated changes under their cause', async () => {
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
    expect(md).toContain('## Breaking release')
    expect(md).toContain('`npm:@acme/tokens@1.0.0` → `npm:@acme/tokens@1.0.0` · suggested version: **major**')
    expect(md).toContain(
      '1 token was removed: code and designs that use it stop working until they are updated.',
    )
    expect(md).toContain('### Breaks (1)')
    expect(md).toContain('- **Removed** `color.old`, it was `#ffffff`.')
    expect(md).toContain('### Looks different (1)')
    expect(md).toMatch(
      /\| `color\.brand` \| `#2e5cff` \| `#3366ff` \| lighter, (barely visible|noticeable) \(ΔE [\d.]+\); also changes `action\.bg`, `action\.border` \|/,
    )
    expect(md).not.toMatch(/\| `action\.bg`/)
    expect(formatChangeset(cs)).toContain('1 removed · 1 changed (+2 through references)')
  })

  it('says when there are no changes', async () => {
    const a = await g({ n: { $type: 'number', $value: 1 } })
    expect(formatChangeset(await diff(a, a))).toContain('No changes')
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

describe('meaning', () => {
  const c = (r: number, g: number, b: number, alpha = 1) => ({ space: 'srgb', components: [r, g, b], alpha })
  it('says which way a color moved, by the largest part of the difference', () => {
    expect(colorDirection(c(0.15, 0.39, 0.92), c(0.2, 0.4, 1))).toBe('lighter')
    expect(colorDirection(c(0.07, 0.09, 0.15), c(0.04, 0.06, 0.1))).toBe('darker')
    expect(colorDirection(c(0.5, 0.5, 0.5), c(0.6, 0.45, 0.45))).toBe('more-saturated')
    expect(colorDirection(c(0.9, 0.2, 0.2), c(0.2, 0.75, 0.2))).toBe('hue')
    expect(colorDirection(c(0, 0, 0, 0.08), c(0, 0, 0, 0.1))).toBe('alpha')
    expect(colorDirection({ value: 1, unit: 'px' }, { value: 2, unit: 'px' })).toBeUndefined()
  })

  it('words how visible a difference is', () => {
    expect([0.5, 1.5, 3, 7, 20].map(colorSize)).toEqual([
      'invisible',
      'barely',
      'noticeable',
      'clear',
      'different',
    ])
  })

  it('groups changes by what they mean for people who use the tokens', () => {
    const ch = (kind: string, level: string) => ({ kind, level }) as Parameters<typeof groupOf>[0]
    expect(groupOf(ch('token.removed', 'major'))).toBe('breaks')
    expect(groupOf(ch('token.value-changed', 'minor'))).toBe('looks')
    expect(groupOf(ch('token.added', 'minor'))).toBe('added')
    expect(groupOf(ch('token.deprecated', 'minor'))).toBe('deprecated')
    expect(groupOf(ch('token.value-changed', 'patch'))).toBe('quiet')
  })
})
