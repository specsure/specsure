import { describe, expect, it } from 'vitest'
import { buildSnapshot, DiagnosticBag, DsGraph, inferLayers, systemFromDocuments } from '../src/index.js'

const c = (r: number, g: number, b: number) => ({ colorSpace: 'srgb', components: [r, g, b] })

const graphOf = async (docs: Array<{ file: string; tree: Record<string, unknown> }>, layers?: object) =>
  DsGraph.from(
    await buildSnapshot(systemFromDocuments(docs), {
      diagnostics: new DiagnosticBag(),
      ...(layers ? { layers } : {}),
    }),
  )

const layerOf = (g: DsGraph) => {
  const { tokens } = inferLayers(g)
  return Object.fromEntries([...tokens].map(([id, l]) => [id, `${l.layer} by ${l.by}`]))
}

describe('inferLayers', () => {
  it('reads the layers from references and the shape of names when nothing names them', async () => {
    const g = await graphOf([
      {
        file: 'tokens.json',
        tree: {
          gray: { $type: 'color', 0: { $value: c(1, 1, 1) }, 900: { $value: c(0, 0, 0) } },
          bg: { $type: 'color', default: { $value: '{gray.0}' }, raised: { $value: '{gray.0}' } },
          text: { $type: 'color', default: { $value: '{gray.900}' } },
          card: { $type: 'color', bg: { $value: '{bg.raised}' } },
          space: { $type: 'dimension', 4: { $value: { value: 16, unit: 'px' } } },
        },
      },
    ])
    expect(layerOf(g)).toEqual({
      'gray.0': 'palette by references',
      'gray.900': 'palette by references',
      'bg.default': 'semantic by references',
      'bg.raised': 'semantic by references',
      'text.default': 'semantic by references',
      'card.bg': 'component by references',
      'space.4': 'value by references',
    })
    expect(inferLayers(g).crossings).toEqual([])
  })

  it('reports a component that skips the semantic layer, and a reference upwards', async () => {
    const g = await graphOf([
      {
        file: 'tokens.json',
        tree: {
          blue: { $type: 'color', 600: { $value: c(0.15, 0.39, 0.92) } },
          bg: { $type: 'color', accent: { $value: '{blue.600}' }, button: { $value: '{button.bg}' } },
          button: { $type: 'color', bg: { $value: '{blue.600}' } },
        },
      },
    ])
    expect(inferLayers(g).crossings).toEqual([
      { from: 'bg.button', to: 'button.bg', fromLayer: 'semantic', toLayer: 'component', kind: 'upward' },
      {
        from: 'button.bg',
        to: 'blue.600',
        fromLayer: 'component',
        toLayer: 'palette',
        kind: 'skips-semantic',
      },
    ])
  })

  it('takes the layer the system names: a collection, a group, the configured layers', async () => {
    const g = await graphOf([
      { file: 'Primitives.tokens.json', tree: { blue: { $type: 'color', $value: c(0, 0, 1) } } },
      {
        file: 'Semantic.tokens.json',
        // Nothing references it and it holds a raw value, yet the collection says what it is.
        tree: { overlay: { $type: 'color', $value: c(0, 0, 0) }, link: { $type: 'color', $value: '{blue}' } },
      },
      {
        file: 'm3.tokens.json',
        tree: { md: { comp: { fab: { $type: 'color', container: { $value: '{link}' } } } } },
      },
    ])
    expect(layerOf(g)).toEqual({
      blue: 'palette by name',
      overlay: 'semantic by name',
      link: 'semantic by name',
      'md.comp.fab.container': 'component by name',
    })
    const configured = await graphOf(
      [
        {
          file: 't.json',
          tree: { a: { $type: 'color', $value: c(0, 0, 0) }, b: { $type: 'color', $value: '{a}' } },
        },
      ],
      { core: { match: ['a'] }, semantic: { match: ['b'] } },
    )
    expect(layerOf(configured)).toEqual({ a: 'palette by config', b: 'semantic by config' })
  })

  it('keeps the steps of a ramp in the palette, and a purpose in a "primitives" file semantic', async () => {
    const g = await graphOf([
      {
        file: 'base/light.json',
        tree: {
          white: { $type: 'color', $value: c(1, 1, 1) },
          neutral: {
            $type: 'color',
            0: { $value: '{white}' },
            1: { $value: c(0.9, 0.9, 0.9) },
            2: { $value: c(0.8, 0.8, 0.8) },
            3: { $value: c(0.7, 0.7, 0.7) },
          },
          // A ramp nothing uses yet, with its alpha steps.
          amber: {
            $type: 'color',
            1: { $value: c(1, 0.9, 0.5) },
            2: { $value: c(1, 0.8, 0.4) },
            a1: { $value: c(1, 0.8, 0) },
            a2: { $value: c(1, 0.7, 0) },
          },
        },
      },
      {
        file: 'functional/primitives-light.json',
        tree: {
          bgColor: { $type: 'color', default: { $value: '{neutral.0}' }, muted: { $value: '{neutral.1}' } },
        },
      },
    ])
    const l = layerOf(g)
    expect(l['neutral.0']).toBe('palette by references')
    expect(l['neutral.3']).toBe('palette by references')
    expect(l['amber.a2']).toBe('palette by references')
    expect(l['bgColor.default']).toBe('semantic by references')
    expect(inferLayers(g).crossings).toEqual([])
  })

  it('checks a component against the semantic layer only where the system has one', async () => {
    const g = await graphOf([
      {
        file: 'tokens.json',
        tree: {
          blue: { $type: 'color', 600: { $value: c(0, 0, 1) } },
          button: { $type: 'color', bg: { $value: '{blue.600}' } },
        },
      },
    ])
    expect(inferLayers(g).tokens.get('button.bg')?.layer).toBe('component')
    expect(inferLayers(g).crossings).toEqual([])
  })
})
