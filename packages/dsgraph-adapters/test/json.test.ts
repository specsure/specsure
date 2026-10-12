import { DsGraph, diff, evaluateMath, scan } from '@dsgraph/core'
import { MemorySource } from '@dsgraph/sources'
import { describe, expect, it } from 'vitest'
import { cssTokens, fontWeight, jsonTokens, normalizeRefs } from '../src/index.js'

const json = (v: unknown) => JSON.stringify(v, null, 2)
const adapters = [jsonTokens, cssTokens]

async function scanFiles(files: Record<string, string>, config = {}) {
  const snapshot = await scan(new MemorySource(files), config, { adapters })
  const errors = snapshot.diagnostics.filter((d) => d.severity === 'error')
  return { snapshot, graph: DsGraph.from(snapshot), errors }
}

const core = {
  colors: {
    gray: { 50: { value: '#fafafa', type: 'color' }, 900: { value: '#111111', type: 'color' } },
    blue: {
      500: { value: '#3366ff', type: 'color' },
      hover: {
        value: '{colors.blue.500}',
        type: 'color',
        $extensions: { 'studio.tokens': { modify: { type: 'darken', value: '0.2', space: 'lch' } } },
      },
      faded: {
        value: '{colors.blue.500}',
        type: 'color',
        $extensions: {
          'studio.tokens': { modify: { type: 'alpha', value: '{opacity.muted}', space: 'srgb' } },
        },
      },
    },
  },
  spacing: {
    base: { value: '8', type: 'spacing' },
    lg: { value: '{spacing.base} * 2', type: 'spacing' },
  },
  radius: { md: { value: '4', type: 'borderRadius' } },
  opacity: { muted: { value: '50%', type: 'opacity' } },
  fontFamilies: { sans: { value: 'Inter, sans-serif', type: 'fontFamilies' } },
  fontWeights: { bold: { value: 'Semi Bold', type: 'fontWeights' } },
  lineHeights: { body: { value: '150%', type: 'lineHeights' } },
  typography: {
    body: {
      type: 'typography',
      value: {
        fontFamily: '{fontFamilies.sans}',
        fontWeight: '{fontWeights.bold}',
        fontSize: '16',
        lineHeight: '{lineHeights.body}',
        letterSpacing: '-2%',
      },
    },
  },
  shadow: {
    card: {
      type: 'boxShadow',
      value: { x: 0, y: 2, blur: 4, spread: 0, color: 'rgba({colors.gray.900}, 0.2)', type: 'dropShadow' },
    },
  },
}

const studio = {
  'tokens/$metadata.json': json({ tokenSetOrder: ['core', 'theme/light', 'theme/dark'] }),
  'tokens/$themes.json': json([
    {
      id: 'l',
      name: 'Light',
      group: 'Mode',
      selectedTokenSets: { core: 'source', 'theme/light': 'enabled' },
    },
    { id: 'd', name: 'Dark', group: 'Mode', selectedTokenSets: { core: 'source', 'theme/dark': 'enabled' } },
  ]),
  'tokens/core.json': json(core),
  'tokens/theme/light.json': json({
    bg: { default: { value: '{colors.gray.50}', type: 'color' } },
    fg: { default: { value: '{colors.gray.900}', type: 'color' } },
  }),
  'tokens/theme/dark.json': json({
    bg: { default: { value: '{colors.gray.900}', type: 'color' } },
    fg: { default: { value: '{colors.gray.50}', type: 'color' } },
  }),
  'package.json': json({ name: 'tokens', version: '1.0.0' }),
}

describe('tokens-json: Tokens Studio', () => {
  it('reads sets in order and turns theme groups into modifiers', async () => {
    const { snapshot, graph, errors } = await scanFiles(studio)
    expect(errors).toEqual([])
    expect(snapshot.contexts.modifiers).toEqual([
      { name: 'Mode', contexts: ['Light', 'Dark'], default: 'Light' },
    ])
    const bg = (ctx: string) => graph.value('bg.default', { Mode: ctx })
    expect(bg('Light')).toMatchObject({ hex: '#fafafa' })
    expect(bg('Dark')).toMatchObject({ hex: '#111111' })
  })

  it('converts values to DTCG and evaluates math and color modifiers', async () => {
    const { graph } = await scanFiles(studio)
    const v = (id: string) => graph.value(id)
    expect(v('spacing.base')).toEqual({ value: 8, unit: 'px' })
    expect(v('spacing.lg')).toEqual({ value: 16, unit: 'px' })
    expect(graph.entry('spacing.lg')?.refs).toEqual([{ to: 'spacing.base' }])
    expect(v('opacity.muted')).toBe(0.5)
    expect(v('fontWeights.bold')).toBe(600)
    expect(v('fontFamilies.sans')).toEqual(['Inter', 'sans-serif'])
    expect(v('typography.body')).toMatchObject({
      fontWeight: 600,
      fontSize: { value: 16, unit: 'px' },
      lineHeight: 1.5,
      letterSpacing: { value: -0.02, unit: 'em' },
    })
    expect(v('shadow.card')).toEqual([
      expect.objectContaining({
        offsetY: { value: 2, unit: 'px' },
        inset: false,
        color: expect.objectContaining({ alpha: 0.2 }),
      }),
    ])
    const hover = v('colors.blue.hover') as { space: string; components: number[] }
    expect(hover.space).toBe('lch')
    expect(v('colors.blue.faded')).toMatchObject({ space: 'srgb', alpha: 0.5 })
    expect(graph.token('spacing.base')?.type).toBe('dimension')
  })

  it('reports what a change in a base value moves', async () => {
    const before = await scanFiles(studio)
    const changed = structuredClone(core)
    changed.spacing.base.value = '10'
    changed.colors.blue[500].value = '#2255ee'
    const after = await scanFiles({ ...studio, 'tokens/core.json': json(changed) })
    const cs = await diff(before.graph, after.graph)
    const targets = cs.changes.map((c) => `${c.origin}:${c.target}`)
    expect(targets).toContain('direct:spacing.base')
    expect(targets).toContain('propagated:spacing.lg')
    expect(targets).toContain('propagated:colors.blue.hover')
  })

  it('reads one exported file whose top-level keys are token sets', async () => {
    const file = {
      global: { space: { sm: { value: '4', type: 'spacing' } } },
      components: { button: { pad: { value: '{space.sm} * 3', type: 'spacing' } } },
    }
    const { graph, errors } = await scanFiles({ 'tokens.json': json(file) })
    expect(errors).toEqual([])
    expect(graph.value('button.pad')).toEqual({ value: 12, unit: 'px' })
  })
})

describe('tokens-json: real-world shapes', () => {
  it('folds a theme group with a single theme into the base', async () => {
    const files = {
      '$themes.json': json([
        { name: 'Core', group: 'core', selectedTokenSets: { primitives: 'source' } },
        { name: 'A', group: 'brand', selectedTokenSets: { 'brand/a': 'enabled' } },
        { name: 'B', group: 'brand', selectedTokenSets: { 'brand/b': 'enabled' } },
      ]),
      'primitives.json': json({
        blue: { value: '#0000ff', type: 'color' },
        red: { value: '#ff0000', type: 'color' },
      }),
      'brand/a.json': json({ accent: { value: '{blue}', type: 'color' } }),
      'brand/b.json': json({ accent: { value: '{red}', type: 'color' } }),
    }
    const { snapshot, graph, errors } = await scanFiles(files)
    expect(errors).toEqual([])
    expect(snapshot.contexts.modifiers).toEqual([{ name: 'brand', contexts: ['A', 'B'], default: 'A' }])
    expect(graph.value('accent', { brand: 'B' })).toMatchObject({ hex: '#ff0000' })
  })

  it('reads top-level token sets when references leave the set name out', async () => {
    const file = {
      global: { colors: { ink: { value: '#111111', type: 'color' } } },
      dark: { fg: { value: '{colors.ink}', type: 'color' } },
    }
    const { graph, errors } = await scanFiles({ 'tokens.json': json(file) })
    expect(errors).toEqual([])
    expect(graph.value('fg')).toMatchObject({ hex: '#111111' })
  })

  it('reads one of several exports of the same tokens', async () => {
    const names = Array.from({ length: 12 }, (_, i) => i)
    const hex = (i: number) => `#${(i * 20 + 16).toString(16).padStart(2, '0')}0000`
    const studioFile = Object.fromEntries(names.map((i) => [`red-${i}`, { value: hex(i), type: 'color' }]))
    const untyped = Object.fromEntries(names.map((i) => [`--red-${i}`, { $value: hex(i) }]))
    const { snapshot, graph } = await scanFiles({
      'pkg.figma-tokens.json': json({ color: studioFile }),
      'pkg.tokens.json': json(untyped),
    })
    expect(graph.tokens()).toHaveLength(12)
    expect(graph.token('color.red-0')).toBeDefined()
    expect(snapshot.diagnostics.map((d) => d.code)).toContain('tokens/alternative-exports')
  })

  it('keeps CSS that no DTCG value can hold as text', async () => {
    const file = {
      radius: { round: { value: 'clamp(0px, 1vw, 8px)', type: 'borderRadius' } },
      other: { ease: { value: 'cubic-bezier(0, 0, 0.5, 1)', type: 'other' } },
    }
    const { graph, errors } = await scanFiles({ 'tokens.json': json(file) })
    expect(errors).toEqual([])
    expect(graph.token('radius.round')?.type).toBe('css-expression')
    expect(graph.token('other.ease')?.type).toBe('cubicBezier')
  })
})

describe('tokens-json: Style Dictionary', () => {
  const sd = {
    'tokens/color/base.json': json({
      color: { base: { red: { value: '#ff0000' }, ink: { value: '#1c1c1a' } } },
    }),
    'tokens/color/font.json': json({
      color: { font: { primary: { value: '{color.base.red.value}', comment: 'Headings' } } },
    }),
    'tokens/size/font.json': json({ size: { font: { base: { value: '1' }, small: { value: '0.75' } } } }),
    'tokens/time.json': json({ time: { fast: { value: '200' } } }),
  }

  it('merges files and types tokens by category', async () => {
    const { snapshot, graph, errors } = await scanFiles(sd)
    expect(errors).toEqual([])
    expect(snapshot.contexts.modifiers).toEqual([])
    const t = graph.token('color.font.primary')
    expect(t?.type).toBe('color')
    expect(graph.value('color.font.primary')).toMatchObject({ hex: '#ff0000' })
    expect(t?.description).toBe('Headings')
    expect(graph.value('size.font.base')).toEqual({ value: 1, unit: 'rem' })
    expect(graph.value('time.fast')).toEqual({ value: 200, unit: 'ms' })
  })

  it('wins over CSS output in the same package', async () => {
    const { graph } = await scanFiles({ ...sd, 'build/tokens.css': ':root { --color-base-red: #ff0000; }' })
    expect(graph.token('color.base.red')).toBeDefined()
    expect(graph.token('color-base-red')).toBeUndefined()
  })
})

describe('modes in $extensions.mode', () => {
  const exported = {
    Colors: {
      bg: {
        $type: 'color',
        $value: '{Colors.white}',
        $extensions: { mode: { Light: '{Colors.white}', Dark: '{Colors.black}' } },
      },
      white: { $type: 'color', $value: { colorSpace: 'srgb', components: [1, 1, 1], hex: '#ffffff' } },
      black: { $type: 'color', $value: { colorSpace: 'srgb', components: [0, 0, 0], hex: '#000000' } },
      overlay: { $type: 'color', $value: { components: '{Colors.black}', alpha: 0.5 } },
    },
    Spacing: {
      gap: {
        $type: 'dimension',
        $value: { value: 8, unit: 'px' },
        $extensions: { mode: { Mobile: { value: 8, unit: 'px' }, Desktop: { value: 12, unit: 'px' } } },
      },
    },
  }

  it('turns each set of mode names into a modifier', async () => {
    const { snapshot, graph, errors } = await scanFiles({ 'design.json': json(exported) })
    expect(errors).toEqual([])
    expect(snapshot.contexts.modifiers).toEqual([
      { name: 'theme', contexts: ['Light', 'Dark'], default: 'Light' },
      { name: 'Spacing', contexts: ['Mobile', 'Desktop'], default: 'Mobile' },
    ])
    const at = (input: Record<string, string>, id: string) => graph.value(id, input)
    expect(at({ theme: 'Dark', Spacing: 'Mobile' }, 'Colors.bg')).toMatchObject({ hex: '#000000' })
    expect(at({ theme: 'Light', Spacing: 'Desktop' }, 'Spacing.gap')).toEqual({ value: 12, unit: 'px' })
    expect(graph.value('Colors.overlay')).toMatchObject({ components: [0, 0, 0], alpha: 0.5 })
  })

  it('reads legacy-syntax exports with modes too', async () => {
    const legacy = {
      color: {
        bg: { type: 'color', value: '#ffffff', $extensions: { mode: { light: '#ffffff', dark: '#000000' } } },
      },
    }
    const { snapshot, graph, errors } = await scanFiles({ 'tokens.json': json(legacy) })
    expect(errors).toEqual([])
    expect(snapshot.contexts.modifiers.map((m) => m.name)).toEqual(['theme'])
    expect(graph.value('color.bg', { theme: 'dark' })).toMatchObject({ hex: '#000000' })
  })
})

describe('json values', () => {
  it('normalizes references and font weights', () => {
    expect(normalizeRefs('{a.b.value}')).toBe('{a.b}')
    expect(normalizeRefs('{a.b.$value} * 2')).toBe('{a.b} * 2')
    expect(normalizeRefs('$a.b')).toBe('{a.b}')
    expect(fontWeight('Bold Italic')).toBe(700)
    expect(fontWeight('ExtraLight')).toBe(200)
    expect(fontWeight('Compressed Black')).toBe(900)
    expect(fontWeight('Display')).toBe('Display')
  })

  it('evaluates arithmetic with units', () => {
    expect(evaluateMath('8px * 2')).toEqual({ value: 16, unit: 'px' })
    expect(evaluateMath('(4 + 4) / 2')).toEqual({ value: 4, unit: '' })
    expect(evaluateMath('calc(2 * 3rem)')).toEqual({ value: 6, unit: 'rem' })
    expect(evaluateMath('-2px + 1')).toEqual({ value: -1, unit: 'px' })
    expect(evaluateMath('1rem + 2px')).toBeUndefined()
    expect(evaluateMath('roundTo(2.5)')).toBeUndefined()
  })
})

describe('shapes found in published packages', () => {
  it('reads JSON5 token files', async () => {
    const text = `{
  // comments, unquoted keys and single quotes
  color: { ink: { $type: 'color', $value: '#111111' } },
}`
    const { graph, errors } = await scanFiles({ 'src/tokens/color.json5': text })
    expect(errors).toEqual([])
    expect(graph.value('color.ink')).toMatchObject({ hex: '#111111' })
  })

  it('reads build output only when there is nothing else, or when asked', async () => {
    const dtcg = (hex: string) => json({ ink: { $type: 'color', $value: hex } })
    const onlyDist = await scanFiles({ 'dist/tokens.json': dtcg('#111111') })
    expect(onlyDist.graph.value('ink')).toMatchObject({ hex: '#111111' })
    expect(onlyDist.snapshot.diagnostics.map((d) => d.code)).toContain('tokens/build-output')
    const both = await scanFiles({ 'src/tokens.json': dtcg('#222222'), 'dist/tokens.json': dtcg('#111111') })
    expect(both.graph.value('ink')).toMatchObject({ hex: '#222222' })
    const asked = await scanFiles(
      { 'src/tokens.json': dtcg('#222222'), 'dist/tokens.json': dtcg('#111111') },
      { tokens: { include: ['dist/**/*.json'] } },
    )
    expect(asked.graph.value('ink')).toMatchObject({ hex: '#111111' })
  })

  it('finds theme files that hold only a class rule', async () => {
    const { snapshot } = await scanFiles({
      'blue.css': ':root, .light { --blue-1: #fbfdff; }',
      'blue-dark.css': '.dark, .dark-theme { --blue-1: #0d1520; }',
    })
    expect(snapshot.contexts.modifiers.map((m) => m.name)).toEqual(['theme'])
  })

  it('reads values per mode under sets, and merges a smaller set of modes into a larger one', async () => {
    const file = {
      'gray-100': {
        $schema: 'https://example.com/schemas/token-types/color-set.json',
        sets: {
          light: {
            $schema: 'https://example.com/schemas/token-types/color.json',
            value: 'rgb(250, 250, 250)',
          },
          dark: { $schema: 'https://example.com/schemas/token-types/color.json', value: 'rgb(20, 20, 20)' },
          wireframe: {
            $schema: 'https://example.com/schemas/token-types/color.json',
            value: 'rgb(255, 255, 255)',
          },
        },
      },
      'bg-default': {
        sets: { light: { value: '{gray-100}' }, dark: { value: '{gray-100}' } },
      },
      'gap-small': {
        $schema: 'https://example.com/schemas/token-types/scale-set.json',
        sets: {
          desktop: { $schema: 'https://example.com/schemas/token-types/dimension.json', value: '8px' },
          mobile: { $schema: 'https://example.com/schemas/token-types/dimension.json', value: '10px' },
        },
      },
    }
    const { snapshot, graph, errors } = await scanFiles({ 'src/palette.json': json(file) })
    expect(errors).toEqual([])
    expect(snapshot.contexts.modifiers).toEqual([
      { name: 'theme', contexts: ['light', 'dark', 'wireframe'], default: 'light' },
      { name: 'mode', contexts: ['desktop', 'mobile'], default: 'desktop' },
    ])
    expect(graph.token('gray-100')?.type).toBe('color')
    expect(graph.value('bg-default', { theme: 'dark', mode: 'desktop' })).toMatchObject({ hex: '#141414' })
    expect(graph.value('gap-small', { theme: 'light', mode: 'mobile' })).toEqual({ value: 10, unit: 'px' })
  })

  it('splits path-like names and keeps a token that is also a group as its $root', async () => {
    const file = {
      tokens: {
        'Dark/color.background.selected': { value: '#1c2b41' },
        'Dark/color.background.selected.hovered': { value: '#25395a' },
      },
    }
    const { graph, errors } = await scanFiles({ 'figma/dark.json': json(file) })
    expect(errors).toEqual([])
    expect(graph.value('tokens.Dark.color.background.selected.$root')).toMatchObject({ hex: '#1c2b41' })
    expect(graph.value('tokens.Dark.color.background.selected.hovered')).toMatchObject({ hex: '#25395a' })
  })

  it('skips JSON Schema documents and keeps sibling files that share common values', async () => {
    const sizes = (prefix: string, n: number) =>
      Object.fromEntries(
        Array.from({ length: n }, (_, i) => [`${prefix}-${i}`, { value: `${(i % 6) * 2 + 2}px` }]),
      )
    const { graph } = await scanFiles({
      'schemas/token-types/dimension.json': json({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: { value: { type: 'string' } },
      }),
      'src/layout.json': json(sizes('space', 40)),
      'src/card.json': json(sizes('card', 12)),
    })
    expect(graph.tokens().filter((t) => t.id.startsWith('card-'))).toHaveLength(12)
    expect(graph.tokens()).toHaveLength(52)
  })

  it('matches a rename by a stable id, even when the value changed too', async () => {
    const before = await scanFiles({ 'a.json': json({ 'banner-gap': { value: '8px', uuid: 'u-1' } }) })
    const after = await scanFiles({ 'a.json': json({ gap: { value: '12px', uuid: 'u-1' } }) })
    const cs = await diff(before.graph, after.graph)
    const kinds = cs.changes.filter((c) => c.origin === 'direct').map((c) => `${c.kind} ${c.target}`)
    expect(kinds).toContain('token.renamed gap')
    expect(kinds).toContain('token.value-changed gap')
    expect(cs.changes.find((c) => c.kind === 'token.renamed')?.confidence).toBe(1)
  })
})
