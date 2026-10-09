import { describe, expect, it } from 'vitest'
import { px, snap, srgb } from './helpers.js'

describe('Format 2025.10 — tokens, groups, names', () => {
  it('flattens groups into dot paths and keeps $root in the path', async () => {
    const { graph } = await snap({
      color: {
        $type: 'color',
        accent: { $root: { $value: srgb(1, 0, 0) }, light: { $value: srgb(1, 0.5, 0.5) } },
      },
    })
    expect(graph.tokens().map((t) => t.id)).toEqual(['color.accent.$root', 'color.accent.light'])
    expect(graph.token('color.accent.$root')?.typeSource).toBe('inherited')
  })

  it('rejects names with {, } or . and objects that are both token and group', async () => {
    const { codes, graph } = await snap({
      'a.b': { $type: 'number', $value: 1 },
      bad: { $type: 'number', $value: 1, child: { $value: 2 } },
    })
    expect(codes).toContain('dtcg/invalid-name')
    expect(codes).toContain('dtcg/token-with-children')
    expect(graph.token('a.b')).toBeUndefined()
  })

  it('reports tokens whose paths differ only by case', async () => {
    const { codes } = await snap({
      'font-size': { $type: 'dimension', $value: px(16) },
      'FONT-SIZE': { $type: 'dimension', $value: px(12) },
    })
    expect(codes).toContain('naming/case-collision')
  })
})

describe('Format 2025.10 — types', () => {
  it('uses explicit type, then the referenced token type, then the closest group type', async () => {
    const { graph } = await snap({
      base: { $type: 'color', blue: { $value: srgb(0, 0, 1) } },
      semantic: { $type: 'dimension', link: { $value: '{base.blue}' } },
      plain: { $type: 'number', n: { $value: 1 } },
    })
    expect(graph.token('base.blue')?.typeSource).toBe('inherited')
    expect(graph.token('semantic.link')?.type).toBe('color')
    expect(graph.token('semantic.link')?.typeSource).toBe('alias')
    expect(graph.token('plain.n')?.type).toBe('number')
  })

  it('never guesses a type from the value', async () => {
    const { graph, codes } = await snap({ orphan: { $value: srgb(0, 0, 0) } })
    expect(codes).toContain('dtcg/untyped')
    expect(graph.token('orphan')?.type).toBeNull()
  })

  it('keeps unknown types as opaque values with a diagnostic', async () => {
    const { graph, codes } = await snap({ x: { $type: 'string', $value: 'amber' } })
    expect(codes).toContain('dtcg/unknown-type')
    expect(graph.value('x')).toBe('amber')
  })
})

describe('Format 2025.10 — references', () => {
  it('follows chained aliases to the literal value', async () => {
    const { graph } = await snap({
      base: { primary: { $type: 'color', $value: srgb(0, 0.4, 0.8) } },
      semantic: { brand: { $value: '{base.primary}' }, link: { $value: '{semantic.brand}' } },
    })
    expect(graph.chain('semantic.link')).toEqual(['semantic.link', 'semantic.brand', 'base.primary'])
    expect(graph.value('semantic.link')).toEqual(graph.value('base.primary'))
  })

  it('reports every token of a circular chain', async () => {
    const { snapshot } = await snap({
      a: { $type: 'number', $value: '{b}' },
      b: { $value: '{c}' },
      c: { $value: '{a}' },
    })
    const cycles = snapshot.diagnostics.filter((d) => d.code === 'dtcg/alias-cycle')
    expect(cycles.map((d) => d.loc?.pointer).sort()).toEqual(['/a', '/b', '/c'])
  })

  it('reports unknown references and references to groups', async () => {
    const { codes } = await snap({
      g: { $type: 'number', x: { $value: 1 } },
      a: { $type: 'number', $value: '{missing}' },
      b: { $type: 'number', $value: '{g}' },
    })
    expect(codes).toContain('dtcg/unknown-reference')
    expect(codes).toContain('dtcg/reference-to-group')
  })

  it('supports JSON Pointer references to whole values and to properties', async () => {
    const { graph, snapshot } = await snap({
      colors: { blue: { $type: 'color', $value: srgb(0.2, 0.4, 0.9) } },
      semantic: {
        primary: { $type: 'color', $ref: '#/colors/blue/$value' },
        mixed: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [
              { $ref: '#/colors/blue/$value/components/0' },
              { $ref: '#/colors/blue/$value/components/1' },
              0.7,
            ],
          },
        },
      },
    })
    expect(graph.value('semantic.primary')).toEqual(graph.value('colors.blue'))
    expect((graph.value('semantic.mixed') as { components: number[] }).components).toEqual([0.2, 0.4, 0.7])
    const edge = snapshot.edges.find((e) => e[1] === 'semantic.mixed')!
    expect(edge[3]).toMatchObject({ property: '/components/0', targetPath: '/components/0' })
  })

  it('resolves references inside composite values and arrays', async () => {
    const { graph } = await snap({
      space: { small: { $type: 'dimension', $value: { value: 0.5, unit: 'rem' } } },
      color: { shadow: { $type: 'color', $value: srgb(0, 0, 0, 0.5) } },
      shadow: {
        base: {
          $type: 'shadow',
          $value: {
            color: '{color.shadow}',
            offsetX: '{space.small}',
            offsetY: '{space.small}',
            blur: px(4),
            spread: px(0),
          },
        },
        layered: {
          $type: 'shadow',
          $value: [
            '{shadow.base}',
            {
              color: '{color.shadow}',
              offsetX: px(1),
              offsetY: px(1),
              blur: px(2),
              spread: px(0),
              inset: true,
            },
          ],
        },
      },
    })
    const layered = graph.value('shadow.layered') as Array<{ inset: boolean }>
    expect(layered).toHaveLength(2)
    expect(layered[1]!.inset).toBe(true)
    expect(graph.dependencies('shadow.layered', { transitive: true })).toEqual([
      'color.shadow',
      'shadow.base',
      'space.small',
    ])
  })

  it('reports a type mismatch between an explicitly typed alias and its target', async () => {
    const { codes } = await snap({ a: { $type: 'number', $value: 1 }, b: { $type: 'color', $value: '{a}' } })
    expect(codes).toContain('dtcg/alias-type-mismatch')
  })
})

describe('Format 2025.10 — $extends and $deprecated', () => {
  it('deep-merges extended groups, local tokens win, inherited tokens remember their origin', async () => {
    const { graph } = await snap({
      input: {
        $type: 'dimension',
        field: { width: { $value: { value: 100, unit: 'px' } }, height: { $value: px(40) } },
      },
      'input-amount': { $extends: '{input}', field: { width: { $value: px(120) } } },
    })
    expect(graph.value('input-amount.field.width')).toEqual(px(120))
    expect(graph.value('input-amount.field.height')).toEqual(px(40))
    expect(graph.token('input-amount.field.height')?.inheritedFrom).toBe('input.field.height')
    expect(graph.token('input-amount.field.width')?.inheritedFrom).toBeNull()
    expect(graph.edges('extends')).toEqual([['extends', 'input-amount', 'input']])
  })

  it('rejects circular and ancestor $extends', async () => {
    const { codes } = await snap({
      a: { $extends: '{b}', x: { $type: 'number', $value: 1 } },
      b: { $extends: '{a}', y: { $type: 'number', $value: 2 } },
      button: { color: { $type: 'number', $value: 1 }, secondary: { $extends: '{button}' } },
    })
    expect(codes.filter((c) => c === 'dtcg/extends-cycle').length).toBeGreaterThanOrEqual(2)
  })

  it('parses deprecation with a machine-readable replacement and inherits it from groups', async () => {
    const { graph, snapshot } = await snap({
      button: {
        $type: 'number',
        activeBorder: { $value: 2 },
        focus: { $value: 1, $deprecated: 'Please use {button.activeBorder} instead.' },
      },
      legacy: {
        $deprecated: true,
        $type: 'number',
        old: { $value: 1 },
        kept: { $value: 2, $deprecated: false },
      },
    })
    expect(graph.token('button.focus')?.deprecated).toEqual({
      reason: 'Please use {button.activeBorder} instead.',
      replacement: 'button.activeBorder',
    })
    expect(graph.token('legacy.old')?.deprecated).toEqual({})
    expect(graph.token('legacy.kept')?.deprecated).toBeNull()
    expect(snapshot.edges).toContainEqual(['deprecated_by', 'button.focus', 'button.activeBorder'])
  })
})
