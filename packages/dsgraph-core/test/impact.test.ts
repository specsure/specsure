import { describe, expect, it } from 'vitest'
import {
  buildSnapshot,
  type CodeIndex,
  DiagnosticBag,
  DsGraph,
  diff,
  impactOf,
  systemFromDocuments,
} from '../src/index.js'

const srgb = (r: number, g: number, b: number) => ({ colorSpace: 'srgb', components: [r, g, b] })
const px = (value: number) => ({ value, unit: 'px' })

async function graph(tree: unknown) {
  return DsGraph.from(
    await buildSnapshot(systemFromDocuments([{ file: 't.tokens.json', tree }]), {
      diagnostics: new DiagnosticBag(),
    }),
  )
}

const base = {
  color: {
    $type: 'color',
    blue: { $value: srgb(0.1, 0.4, 0.9) },
    accent: { $value: '{color.blue}' },
    danger: { $value: srgb(0.9, 0.2, 0.2) },
  },
  space: { $type: 'dimension', sm: { $value: px(8) }, md: { $value: px(16) } },
}
const head = {
  color: {
    $type: 'color',
    blue: { $value: srgb(0.2, 0.4, 1) },
    accent: { $value: '{color.blue}' },
  },
  space: { $type: 'dimension', small: { $value: px(8) }, md: { $value: px(16) } },
}

const use = (file: string, line: number, name: string) => ({ file, line, column: 1, name, property: 'x' })
const code: CodeIndex = {
  files: ['a.css', 'b.css'],
  skipped: [],
  literals: [],
  uses: [
    use('a.css', 1, '--color-accent'),
    use('a.css', 2, '--color-danger'),
    use('b.css', 1, '--space-sm'),
    use('b.css', 2, '--space-md'),
    use('b.css', 3, '--color-blue'),
  ],
}

describe('impactOf', () => {
  it('finds the places each change reaches, through references, and what breaks', async () => {
    const [b, h] = await Promise.all([graph(base), graph(head)])
    const cs = await diff(b, h)
    const impact = impactOf(cs, b, h, code)
    const summary = impact.changes.map(
      (c) =>
        `${c.effect} ${c.kind} ${c.target}: ${c.sites.map((s) => `${s.file}:${s.line} (${s.token})`).join(', ')}`,
    )
    expect(summary).toEqual([
      'breaks token.removed color.danger: a.css:2 (color.danger)',
      'breaks token.renamed space.small: b.css:1 (space.sm)',
      'changes token.value-changed color.blue: a.css:1 (color.accent), b.css:3 (color.blue)',
    ])
    expect(impact).toMatchObject({ breaks: 2, looksDifferent: 2, files: ['a.css', 'b.css'] })
  })

  it('reaches nothing when the code does not use the changed tokens', async () => {
    const [b, h] = await Promise.all([graph(base), graph(head)])
    const impact = impactOf(await diff(b, h), b, h, { ...code, uses: [use('a.css', 1, '--space-md')] })
    expect(impact).toEqual({ changes: [], breaks: 0, looksDifferent: 0, files: [] })
  })
})
