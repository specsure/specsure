import { buildSnapshot, DiagnosticBag, DsGraph, systemFromDocuments } from '@dsgraph/core'
import { describe, expect, it } from 'vitest'
import { check, contrastRatio, resolveSettings } from '../src/index.js'

const srgb = (r: number, g: number, b: number) => ({ colorSpace: 'srgb', components: [r, g, b] })
async function graphOf(tree: unknown, layers?: Record<string, { match: string[]; public?: boolean }>) {
  const snapshot = await buildSnapshot(systemFromDocuments([{ file: 't.tokens.json', tree }]), {
    diagnostics: new DiagnosticBag(),
    ...(layers ? { layers } : {}),
  })
  return DsGraph.from(snapshot)
}
const rulesOf = (fs: Array<{ rule: string }>) => fs.map((f) => f.rule)

describe('settings', () => {
  it('applies defaults, then presets, then config rules', () => {
    const s = resolveSettings({
      extends: ['recommended', 'two-layer'],
      rules: { 'color/out-of-gamut': 'off', 'layer/alias-depth': ['error', { max: 1 }] },
    })
    expect(s.get('color/out-of-gamut')?.severity).toBe('off')
    expect(s.get('layer/alias-depth')).toEqual({ severity: 'error', options: { layer: 'semantic', max: 1 } })
    expect(() => resolveSettings({ extends: ['brand-x'] })).toThrow(/Unknown preset/)
  })
})

describe('built-in rules', () => {
  it('reports parse diagnostics as findings, with overridable severity', async () => {
    const g = await graphOf({
      a: { $type: 'color', $value: '#ff0000' },
      b: { $type: 'number', $value: '{missing}' },
    })
    const findings = await check(g, { rules: { 'dtcg/legacy-syntax': 'off' } })
    expect(rulesOf(findings)).toContain('dtcg/unknown-reference')
    expect(rulesOf(findings)).not.toContain('dtcg/legacy-syntax')
    expect(findings.find((f) => f.rule === 'dtcg/unknown-reference')?.nodes).toEqual(['b'])
  })

  it('token/deprecated-reference suggests the replacement', async () => {
    const g = await graphOf({
      old: { $type: 'number', $value: 1, $deprecated: 'Use {new}' },
      new: { $type: 'number', $value: 1 },
      user: { $value: '{old}' },
    })
    const f = (await check(g)).find((x) => x.rule === 'token/deprecated-reference')!
    expect(f.message).toBe('"user" references deprecated "old"; use "new"')
  })

  it('color/hex-mismatch and naming/normalized-collision', async () => {
    const g = await graphOf({
      a: { $type: 'color', $value: { ...srgb(1, 0, 0), hex: '#00ff00' } },
      fontSize: { $type: 'number', $value: 1 },
      'font-size': { $type: 'number', $value: 2 },
    })
    expect(rulesOf(await check(g))).toEqual(
      expect.arrayContaining(['color/hex-mismatch', 'naming/normalized-collision']),
    )
  })

  it('palette rules find non-monotonic ramps and duplicate stops', async () => {
    const g = await graphOf({
      green: {
        $type: 'color',
        '100': { $value: srgb(0.9, 1, 0.9) },
        '500': { $value: srgb(0.12, 0.6, 0.4) },
        '550': { $value: srgb(0.08, 0.62, 0.39) },
        '600': { $value: srgb(0, 0.63, 0.37) },
        '900': { $value: srgb(0, 0.1, 0.04) },
      },
      amber: {
        $type: 'color',
        '500': { $value: srgb(0.77, 0.49, 0) },
        '550': { $value: srgb(0.77, 0.49, 0) },
        '900': { $value: srgb(0.1, 0.06, 0) },
      },
    })
    const fs = await check(g)
    expect(fs.filter((f) => f.rule === 'palette/non-monotonic').map((f) => f.nodes)).toEqual([
      ['green.500', 'green.550'],
      ['green.550', 'green.600'],
    ])
    expect(fs.find((f) => f.rule === 'palette/duplicate-stops')?.nodes).toEqual(['amber.500', 'amber.550'])
  })

  it('a11y/contrast-matrix checks every pair and respects acknowledged pairs', async () => {
    const g = await graphOf({
      text: { $type: 'color', body: { $value: srgb(0.1, 0.1, 0.1) }, faint: { $value: srgb(0.6, 0.6, 0.6) } },
      surface: {
        $type: 'color',
        page: { $value: srgb(1, 1, 1) },
        sunken: { $value: srgb(0.93, 0.93, 0.91) },
      },
    })
    const fs = await check(g, {
      rules: {
        'a11y/contrast-matrix': [
          'error',
          { text: ['text.*'], surfaces: ['surface.*'], acknowledged: ['text.faint × surface.sunken'] },
        ],
      },
    })
    const contrast = fs.filter((f) => f.rule === 'a11y/contrast-matrix')
    expect(contrast.map((f) => [f.nodes.join(' × '), f.severity])).toEqual([
      ['text.faint × surface.page', 'error'],
      ['text.faint × surface.sunken', 'info'],
    ])
    expect(
      contrastRatio(
        { space: 'srgb', components: [0, 0, 0], alpha: 1 },
        { space: 'srgb', components: [1, 1, 1], alpha: 1 },
      ),
    ).toBeCloseTo(21, 5)
  })

  it('two-layer preset: core aliases nothing, semantic references core directly', async () => {
    const g = await graphOf(
      {
        core: { $type: 'color', blue: { $value: srgb(0, 0, 1) }, alias: { $value: '{core.blue}' } },
        semantic: {
          $type: 'color',
          action: { $value: '{core.blue}' },
          link: { $value: '{semantic.action}' },
        },
      },
      { core: { match: ['core.**'] }, semantic: { match: ['semantic.**'] } },
    )
    const fs = await check(g, { extends: ['recommended', 'two-layer'] })
    expect(fs.filter((f) => f.rule.startsWith('layer/')).map((f) => [f.rule, f.nodes[0]])).toEqual([
      ['layer/alias-depth', 'semantic.link'],
      ['layer/allowed-sources', 'core.alias'],
    ])
  })

  it('finding ids are stable', async () => {
    const g = await graphOf({ a: { $type: 'number', $value: '{missing}' } })
    expect((await check(g))[0]!.id).toBe((await check(g))[0]!.id)
  })
})
