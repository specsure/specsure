import { DsGraph, scan } from '@dsgraph/core'
import { MemorySource } from '@dsgraph/sources'
import { describe, expect, it } from 'vitest'
import type { FigmaExport } from '../src/figma.js'
import { figmaTokens, fromFigmaRest } from '../src/figma.js'
import { figmaVariables, jsonTokens } from '../src/index.js'

const white = { r: 1, g: 1, b: 1, a: 1 }
const ink = { r: 0.06, g: 0.09, b: 0.16, a: 1 }

const file: FigmaExport = {
  file: { name: 'Acme' },
  collections: [
    { id: 'c1', name: 'Primitives', modes: [{ id: 'm0', name: 'Value' }], defaultModeId: 'm0' },
    {
      id: 'c2',
      name: 'Theme',
      modes: [
        { id: 'l', name: 'Light' },
        { id: 'd', name: 'Dark' },
      ],
      defaultModeId: 'l',
    },
  ],
  variables: [
    {
      id: 'v1',
      name: 'color/white',
      collectionId: 'c1',
      type: 'COLOR',
      scopes: ['ALL_SCOPES'],
      valuesByMode: { m0: white },
    },
    {
      id: 'v2',
      name: 'color/ink',
      collectionId: 'c1',
      type: 'COLOR',
      scopes: ['ALL_SCOPES'],
      valuesByMode: { m0: ink },
    },
    {
      id: 'v3',
      name: 'space/0.5',
      collectionId: 'c1',
      type: 'FLOAT',
      scopes: ['GAP'],
      valuesByMode: { m0: 2 },
    },
    {
      id: 'v4',
      name: 'radius/md',
      collectionId: 'c1',
      type: 'FLOAT',
      scopes: ['ALL_SCOPES'],
      valuesByMode: { m0: 8 },
    },
    {
      id: 'v5',
      name: 'opacity/muted',
      collectionId: 'c1',
      type: 'FLOAT',
      scopes: ['OPACITY'],
      // Percent, as Figma keeps an opacity.
      valuesByMode: { m0: 60 },
    },
    {
      id: 'v6',
      name: 'font/body',
      collectionId: 'c1',
      type: 'STRING',
      scopes: ['FONT_FAMILY'],
      valuesByMode: { m0: 'Inter' },
    },
    {
      id: 'v7',
      name: 'flags/beta',
      collectionId: 'c1',
      type: 'BOOLEAN',
      scopes: [],
      valuesByMode: { m0: true },
    },
    {
      id: 'v8',
      name: 'size/body',
      collectionId: 'c1',
      type: 'FLOAT',
      scopes: ['FONT_SIZE'],
      valuesByMode: { m0: 16 },
    },
    {
      id: 'v10',
      name: 'bg/default',
      collectionId: 'c2',
      type: 'COLOR',
      scopes: ['FRAME_FILL'],
      description: 'The page',
      codeSyntax: { WEB: 'var(--bg-default)' },
      valuesByMode: { l: { alias: 'v1' }, d: { alias: 'v2' } },
    },
    {
      id: 'v11',
      name: 'text/default',
      collectionId: 'c2',
      type: 'COLOR',
      scopes: ['TEXT_FILL'],
      valuesByMode: { l: { alias: 'v2' }, d: { alias: 'v1' } },
    },
    {
      id: 'e1',
      name: 'motion/ease/out',
      collectionId: 'c1',
      type: 'EASING',
      scopes: [],
      valuesByMode: { m0: { easing: { type: 'EASE_OUT' } } },
    },
    {
      id: 'e2',
      name: 'motion/ease/snap',
      collectionId: 'c1',
      type: 'EASING',
      scopes: [],
      valuesByMode: {
        m0: { easing: { type: 'CUSTOM_CUBIC_BEZIER', bezier: { x1: 0.2, y1: 0, x2: 0, y2: 1 } } },
      },
    },
    {
      id: 'e4',
      name: 'motion/ease/back',
      collectionId: 'c1',
      type: 'EASING',
      scopes: [],
      valuesByMode: { m0: { easing: { type: 'EASE_OUT_BACK' } } },
    },
    {
      id: 'e3',
      name: 'motion/ease/bouncy',
      collectionId: 'c1',
      type: 'EASING',
      scopes: [],
      valuesByMode: { m0: { easing: { type: 'BOUNCY' } } },
    },
    {
      id: 't1',
      name: 'motion/duration/fast',
      collectionId: 'c1',
      type: 'TIMING',
      scopes: [],
      // Seconds, as a 32-bit float.
      valuesByMode: { m0: 0.14000000059604645 },
    },
    // A color and an opacity: written as the color with that alpha.
    {
      id: 'v13',
      name: 'overlay/scrim',
      collectionId: 'c2',
      type: 'COLOR',
      scopes: [],
      valuesByMode: {
        l: { composed: { color: { alias: 'v2' }, opacity: 50 } },
        d: { composed: { color: { alias: 'v2' }, opacity: { alias: 'v5' } } },
      },
    },
    // A library variable: its value is written, its name kept.
    {
      id: 'v12',
      name: 'brand/accent',
      collectionId: 'c2',
      type: 'COLOR',
      scopes: [],
      valuesByMode: { l: { alias: 'lib1' }, d: { alias: 'lib1' } },
    },
  ],
  external: {
    lib1: { name: 'Brand/Blue 500', type: 'COLOR', scopes: [], value: { r: 0.15, g: 0.39, b: 0.92, a: 1 } },
  },
  styles: {
    paint: [
      {
        id: 's1',
        name: 'Surface/Card',
        paints: [{ type: 'SOLID', color: white, opacity: 1, variable: 'v1' }],
      },
    ],
    text: [
      {
        id: 's2',
        name: 'Body/M',
        fontFamily: 'Inter',
        fontStyle: 'Semi Bold',
        fontSize: 16,
        lineHeight: { unit: 'PIXELS', value: 24 },
        letterSpacing: { unit: 'PERCENT', value: -1 },
        bound: { fontSize: 'v8', fontFamily: 'v6' },
      },
    ],
    effect: [
      {
        id: 's3',
        name: 'Shadow/Raised',
        effects: [
          {
            type: 'DROP_SHADOW',
            color: { r: 0, g: 0, b: 0, a: 0.1 },
            offset: { x: 0, y: 1 },
            radius: 3,
            spread: 0,
          },
        ],
      },
    ],
  },
}

describe('Figma variables and styles as DTCG', () => {
  const out = figmaTokens(file)

  it('writes a file per collection and mode, and a resolver with the modes as a modifier', () => {
    expect(Object.keys(out.files).sort()).toEqual([
      'Primitives.tokens.json',
      'Theme/Dark.tokens.json',
      'Theme/Light.tokens.json',
      'styles.tokens.json',
      'tokens.resolver.json',
    ])
    expect(out.files['tokens.resolver.json']).toEqual({
      version: '2025.10',
      sets: {
        Primitives: { sources: [{ $ref: 'Primitives.tokens.json' }] },
        styles: { sources: [{ $ref: 'styles.tokens.json' }] },
      },
      modifiers: {
        Theme: {
          contexts: {
            Light: [{ $ref: 'Theme/Light.tokens.json' }],
            Dark: [{ $ref: 'Theme/Dark.tokens.json' }],
          },
          default: 'Light',
        },
      },
      resolutionOrder: [
        { $ref: '#/sets/Primitives' },
        { $ref: '#/modifiers/Theme' },
        { $ref: '#/sets/styles' },
      ],
    })
    expect(out.notes).toEqual([
      { name: 'flags/beta', message: 'boolean variables have no DTCG type; left out' },
      { name: 'motion/ease/bouncy', message: 'the bouncy curve has no cubic Bézier; left out' },
    ])
    expect(out.stats).toMatchObject({ collections: 2, variables: 15, styles: 3, skipped: 1 })
    expect(out.summary).toEqual({
      collections: [
        { name: 'Primitives', modes: ['Value'], variables: 11 },
        { name: 'Theme', modes: ['Light', 'Dark'], variables: 4 },
      ],
      styles: { color: 1, typography: 1, shadow: 1 },
    })
  })

  it('types numbers by their scopes and names, keeps descriptions, scopes and code syntax', () => {
    const p = out.files['Primitives.tokens.json'] as Record<string, Record<string, Record<string, unknown>>>
    expect(p.space!['0-5']).toMatchObject({ $type: 'dimension', $value: { value: 2, unit: 'px' } })
    expect(p.radius!.md).toMatchObject({ $type: 'dimension' })
    expect(p.opacity!.muted).toMatchObject({ $type: 'number', $value: 0.6 })
    expect(p.font!.body).toMatchObject({ $type: 'fontFamily', $value: 'Inter' })
    const light = out.files['Theme/Light.tokens.json'] as Record<
      string,
      Record<string, Record<string, unknown>>
    >
    expect(light.bg!.default).toEqual({
      $type: 'color',
      $value: '{color.white}',
      $description: 'The page',
      $extensions: {
        'com.figma.variableId': 'v10',
        'com.figma.scopes': ['FRAME_FILL'],
        'com.figma.codeSyntax': { WEB: 'var(--bg-default)' },
      },
    })
    expect(p.motion!.ease).toMatchObject({
      out: { $type: 'cubicBezier', $value: [0, 0, 0.58, 1] },
      snap: { $type: 'cubicBezier', $value: [0.2, 0, 0, 1] },
      back: { $type: 'cubicBezier', $value: [0.45, 1.45, 0.8, 1] },
    })
    expect(p.motion!.duration).toMatchObject({
      fast: { $type: 'duration', $value: { value: 140, unit: 'ms' } },
    })
    const dark = out.files['Theme/Dark.tokens.json'] as Record<
      string,
      Record<string, Record<string, unknown>>
    >
    expect(light.overlay!.scrim).toMatchObject({ $value: { alpha: 0.5 } })
    expect(dark.overlay!.scrim).toMatchObject({
      $type: 'color',
      $value: { components: [0.06, 0.09, 0.16], alpha: 0.6 },
      $extensions: { 'com.figma.composedColor': { color: 'color/ink', opacity: 'opacity/muted' } },
    })
    expect(light.brand!.accent).toMatchObject({
      $value: { colorSpace: 'srgb', components: [0.15, 0.39, 0.92], hex: '#2663eb' },
      $extensions: { 'com.figma.alias': 'Brand/Blue 500' },
    })
  })

  it('is read by dsgraph both ways: the resolver and the single file', async () => {
    const files = Object.fromEntries(
      Object.entries(out.files).map(([k, v]) => [`tokens/${k}`, JSON.stringify(v)]),
    )
    const g = DsGraph.from(await scan(new MemorySource(files)))
    expect(g.modifiers.map((m) => m.name)).toEqual(['Theme'])
    expect(g.value('bg.default', { Theme: 'Dark' })).toMatchObject({ components: [0.06, 0.09, 0.16] })
    expect(g.chain('text.default', { Theme: 'Light' })).toEqual(['text.default', 'color.ink'])
    expect(g.value('styles.Body.M')).toEqual({
      fontFamily: ['Inter'],
      fontSize: { value: 16, unit: 'px' },
      fontWeight: 600,
      letterSpacing: { value: -0.16, unit: 'px' },
      lineHeight: 1.5,
    })
    expect(g.value('styles.Shadow.Raised')).toMatchObject([
      { blur: { value: 3, unit: 'px' }, color: { alpha: 0.1 } },
    ])

    const one = DsGraph.from(await scan(new MemorySource({ 'acme.tokens.json': JSON.stringify(out.single) })))
    const theme = one.modifiers[0]!
    expect(theme.contexts).toEqual(['Light', 'Dark'])
    expect(one.value('bg.default', { [theme.name]: 'Dark' })).toMatchObject({
      components: [0.06, 0.09, 0.16],
    })
  })
})

const colorVar = (
  id: string,
  name: string,
  collectionId: string,
  valuesByMode: FigmaExport['variables'][0]['valuesByMode'],
) => ({
  id,
  name,
  collectionId,
  type: 'COLOR' as const,
  scopes: [],
  valuesByMode,
})
const bare = (raw: Partial<FigmaExport>): FigmaExport => ({
  file: { name: 'x' },
  collections: [],
  variables: [],
  external: {},
  styles: { paint: [], text: [], effect: [] },
  ...raw,
})
const red = { r: 1, g: 0, b: 0, a: 1 }
const blue = { r: 0, g: 0, b: 1, a: 1 }

describe('Figma names across collections', () => {
  it('puts the tokens of collections whose names overlap under their names, references too', async () => {
    const out = figmaTokens(
      bare({
        collections: [
          { id: 'a', name: 'Brand', modes: [{ id: 'a0', name: 'Value' }], defaultModeId: 'a0' },
          { id: 'b', name: 'Product', modes: [{ id: 'b0', name: 'Value' }], defaultModeId: 'b0' },
          { id: 'c', name: 'Space', modes: [{ id: 'c0', name: 'Value' }], defaultModeId: 'c0' },
        ],
        variables: [
          colorVar('1', 'color/accent', 'a', { a0: red }),
          colorVar('2', 'color/accent', 'b', { b0: { alias: '1' } }),
          colorVar('3', 'color/ink', 'b', { b0: blue }),
          {
            id: '4',
            name: 'space/2',
            collectionId: 'c',
            type: 'FLOAT',
            scopes: ['GAP'],
            valuesByMode: { c0: 8 },
          },
        ],
        styles: {
          paint: [{ id: 's', name: 'Accent', paints: [{ type: 'SOLID', color: red, variable: '2' }] }],
          text: [],
          effect: [],
        },
      }),
    )
    expect(out.notes).toEqual([
      { name: 'Brand', message: 'its names overlap Product; its tokens are under Brand' },
      { name: 'Product', message: 'its names overlap Brand; its tokens are under Product' },
    ])
    expect(out.files['Product.tokens.json']).toMatchObject({
      Product: { color: { accent: { $value: '{Brand.color.accent}' }, ink: {} } },
    })
    // A collection whose names are its own keeps them.
    expect(out.files['Space.tokens.json']).toMatchObject({ space: { 2: { $type: 'dimension' } } })
    expect(out.files['styles.tokens.json']).toMatchObject({
      styles: { Accent: { $value: '{Product.color.accent}' } },
    })
    const files = Object.fromEntries(Object.entries(out.files).map(([k, v]) => [`t/${k}`, JSON.stringify(v)]))
    const g = DsGraph.from(await scan(new MemorySource(files)))
    expect(g.value('Product.color.accent')).toMatchObject({ components: [1, 0, 0] })
    expect(g.value('Brand.color.accent')).toMatchObject({ components: [1, 0, 0] })
  })

  it('also when a token of one is a group of another', () => {
    const out = figmaTokens(
      bare({
        collections: [
          { id: 'a', name: 'A', modes: [{ id: 'a0', name: 'Value' }], defaultModeId: 'a0' },
          { id: 'b', name: 'B', modes: [{ id: 'b0', name: 'Value' }], defaultModeId: 'b0' },
        ],
        variables: [
          colorVar('1', 'accent', 'a', { a0: red }),
          colorVar('2', 'accent/hover', 'b', { b0: blue }),
        ],
      }),
    )
    expect(out.single).toMatchObject({ A: { accent: {} }, B: { accent: { hover: {} } } })
  })
})

describe('Figma extended collections', () => {
  // Theme (Light, Dark) and Sub-brand extending it: its modes inherit Theme's, one value overridden.
  const theme = {
    id: 't',
    name: 'Theme',
    modes: [
      { id: 'l', name: 'Light' },
      { id: 'd', name: 'Dark' },
    ],
    defaultModeId: 'l',
  }
  const sub = {
    id: 's',
    name: 'Sub-brand',
    modes: [
      { id: 'sl', name: 'Light', parent: 'l' },
      { id: 'sd', name: 'Dark', parent: 'd' },
    ],
    defaultModeId: 'sl',
    extends: { parent: 't', variables: ['acc', 'btn'], overrides: { acc: { sl: blue } } },
  }
  const out = figmaTokens(
    bare({
      collections: [theme, sub],
      variables: [
        colorVar('acc', 'accent', 't', { l: red, d: red }),
        colorVar('btn', 'button/bg', 't', { l: { alias: 'acc' }, d: { alias: 'acc' } }),
      ],
    }),
  )

  it('writes an extension as a collection of all it has, under its name, overrides applied', () => {
    expect(out.notes).toEqual([])
    expect(out.files['Sub-brand/Light.tokens.json']).toMatchObject({
      'Sub-brand': {
        accent: { $value: { components: [0, 0, 1] } },
        // A reference inside the extension is to its own copy.
        button: { bg: { $value: '{Sub-brand.accent}' } },
      },
    })
    expect(out.files['Sub-brand/Dark.tokens.json']).toMatchObject({
      'Sub-brand': { accent: { $value: { components: [1, 0, 0] } } },
    })
    // The parent keeps its own names.
    expect(out.files['Theme/Light.tokens.json']).toMatchObject({
      accent: {},
      button: { bg: { $value: '{accent}' } },
    })
    expect(out.summary.collections).toEqual([
      { name: 'Theme', modes: ['Light', 'Dark'], variables: 2 },
      { name: 'Sub-brand', modes: ['Light', 'Dark'], variables: 2 },
    ])
  })

  it('is read by dsgraph with its own modes', async () => {
    const files = Object.fromEntries(Object.entries(out.files).map(([k, v]) => [`t/${k}`, JSON.stringify(v)]))
    const g = DsGraph.from(await scan(new MemorySource(files)))
    expect(g.value('Sub-brand.button.bg', { 'Sub-brand': 'Light' })).toMatchObject({ components: [0, 0, 1] })
    expect(g.value('button.bg', { Theme: 'Light' })).toMatchObject({ components: [1, 0, 0] })
  })

  it("extends a library's collection with the values its variables come with", () => {
    const lib = figmaTokens(
      bare({
        collections: [
          {
            id: 's',
            name: 'Ours',
            modes: [{ id: 'o', name: 'Value', parent: 'libmode' }],
            defaultModeId: 'o',
            extends: { parent: 'libcol', variables: ['x', 'y', 'gone'], overrides: { y: { o: blue } } },
          },
        ],
        variables: [
          colorVar('x', 'ink', 'libcol', { libmode: red }),
          colorVar('y', 'accent', 'libcol', { libmode: red }),
        ],
      }),
    )
    expect(lib.files['Ours.tokens.json']).toMatchObject({
      Ours: { ink: { $value: { components: [1, 0, 0] } }, accent: { $value: { components: [0, 0, 1] } } },
    })
    expect(lib.notes).toEqual([
      { name: 'Ours', message: '1 of the variables it inherits are not in the export; left out' },
    ])
  })
})

describe('Figma grid styles', () => {
  it('writes a grid style as a group of its numbers', () => {
    const out = figmaTokens(
      bare({
        styles: {
          paint: [],
          text: [],
          effect: [],
          grid: [
            {
              id: 'g',
              name: 'Grid/Desktop',
              grids: [
                {
                  pattern: 'COLUMNS',
                  alignment: 'STRETCH',
                  count: 12,
                  gutterSize: 24,
                  offset: 80,
                  sectionSize: 60,
                },
                {
                  pattern: 'ROWS',
                  alignment: 'MIN',
                  count: Number.POSITIVE_INFINITY,
                  gutterSize: 8,
                  offset: 0,
                  sectionSize: 4,
                },
                { pattern: 'GRID', sectionSize: 8, visible: false },
              ],
            },
          ],
        },
      }),
    )
    expect(out.files['styles.tokens.json']).toEqual({
      styles: {
        Grid: {
          Desktop: {
            columns: {
              count: { $type: 'number', $value: 12 },
              gutter: { $type: 'dimension', $value: { value: 24, unit: 'px' } },
              offset: { $type: 'dimension', $value: { value: 80, unit: 'px' } },
            },
            rows: {
              gutter: { $type: 'dimension', $value: { value: 8, unit: 'px' } },
              offset: { $type: 'dimension', $value: { value: 0, unit: 'px' } },
              size: { $type: 'dimension', $value: { value: 4, unit: 'px' } },
            },
            $extensions: { 'com.figma.styleId': 'g' },
          },
        },
      },
    })
    expect(out.summary.styles).toEqual({ grid: 1 })
  })
})

describe("Figma's REST API response", () => {
  const response = {
    status: 200,
    error: false,
    meta: {
      variableCollections: {
        'VariableCollectionId:1': {
          id: 'VariableCollectionId:1',
          name: 'Theme',
          modes: [
            { modeId: '1:0', name: 'Light' },
            { modeId: '1:1', name: 'Dark' },
          ],
          defaultModeId: '1:0',
          remote: false,
        },
        'VariableCollectionId:9': {
          id: 'VariableCollectionId:9',
          name: 'Brand',
          modes: [{ modeId: '9:0', name: 'Value' }],
          defaultModeId: '9:0',
          remote: true,
        },
      },
      variables: {
        'VariableID:1:1': {
          id: 'VariableID:1:1',
          name: 'bg/default',
          variableCollectionId: 'VariableCollectionId:1',
          resolvedType: 'COLOR',
          valuesByMode: {
            '1:0': { r: 1, g: 1, b: 1, a: 1 },
            '1:1': { type: 'VARIABLE_ALIAS', id: 'VariableID:9:1' },
          },
          scopes: ['FRAME_FILL'],
          codeSyntax: {},
          description: '',
        },
        'VariableID:9:1': {
          id: 'VariableID:9:1',
          name: 'Ink',
          variableCollectionId: 'VariableCollectionId:9',
          resolvedType: 'COLOR',
          valuesByMode: { '9:0': { r: 0, g: 0, b: 0, a: 1 } },
          scopes: [],
          remote: true,
        },
      },
    },
  }

  it("is read as the file's collections, a library value written in place", async () => {
    const raw = fromFigmaRest(response)!
    expect(raw.collections.map((c) => c.name)).toEqual(['Theme'])
    expect(raw.external['VariableID:9:1']).toMatchObject({ name: 'Ink', value: { r: 0, g: 0, b: 0 } })
    const g = DsGraph.from(
      await scan(
        new MemorySource({ 'figma/variables.json': JSON.stringify(response) }),
        {},
        {
          adapters: [figmaVariables, jsonTokens],
        },
      ),
    )
    expect(g.modifiers).toEqual([{ name: 'Theme', contexts: ['Light', 'Dark'], default: 'Light' }])
    expect(g.value('bg.default', { Theme: 'Dark' })).toMatchObject({ components: [0, 0, 0] })
    expect(g.token('bg.default')?.values.find((v) => v.when?.Theme === 'Dark')?.raw).toMatchObject({
      hex: '#000000',
    })
  })

  it('reads extended collections', () => {
    const raw = fromFigmaRest({
      meta: {
        variableCollections: {
          C1: {
            id: 'C1',
            name: 'Theme',
            modes: [{ modeId: '1:0', name: 'Value' }],
            defaultModeId: '1:0',
            remote: false,
          },
          C2: {
            id: 'C2',
            name: 'Sub',
            modes: [{ modeId: '2:0', name: 'Value', parentModeId: '1:0' }],
            defaultModeId: '2:0',
            remote: false,
            isExtension: true,
            parentVariableCollectionId: 'C1',
            rootVariableCollectionId: 'C1',
            variableIds: ['V1'],
            variableOverrides: { V1: { '2:0': { type: 'VARIABLE_ALIAS', id: 'V9' } } },
          },
        },
        variables: {
          V1: {
            id: 'V1',
            name: 'accent',
            variableCollectionId: 'C1',
            resolvedType: 'COLOR',
            valuesByMode: { '1:0': red },
            scopes: [],
          },
        },
      },
    })!
    expect(raw.collections[1]).toEqual({
      id: 'C2',
      name: 'Sub',
      modes: [{ id: '2:0', name: 'Value', parent: '1:0' }],
      defaultModeId: '2:0',
      extends: { parent: 'C1', variables: ['V1'], overrides: { V1: { '2:0': { alias: 'V9' } } } },
    })
  })

  it('reads a composed color in both of the shapes Figma has given it', () => {
    const color = (value: unknown) => ({
      id: 'V1',
      name: 'scrim',
      variableCollectionId: 'C1',
      resolvedType: 'COLOR',
      valuesByMode: { '1:0': value },
      scopes: [],
    })
    const read = (value: unknown) =>
      figmaTokens(
        fromFigmaRest({
          meta: {
            variableCollections: {
              C1: { id: 'C1', name: 'T', modes: [{ modeId: '1:0', name: 'V' }], defaultModeId: '1:0' },
            },
            variables: { V1: color(value), V2: { ...color(red), id: 'V2', name: 'red' } },
          },
        })!,
      ).files['T.tokens.json'] as Record<string, Record<string, unknown>>
    const alias = { type: 'VARIABLE_ALIAS', id: 'V2' }
    expect(read({ color: alias, opacity: 25 }).scrim).toMatchObject({ $value: { alpha: 0.25 } })
    expect(
      read({
        type: 'VARIABLE_EXPRESSION',
        expressionFunction: 'COMPOSE_COLOR',
        expressionArguments: [alias, { type: 'FLOAT', resolvedType: 'FLOAT', value: 25 }],
      }).scrim,
    ).toMatchObject({ $value: { alpha: 0.25 } })
  })

  it('leaves other token files alone', async () => {
    const tokens = new MemorySource({ 'tokens.json': JSON.stringify({ a: { $type: 'number', $value: 1 } }) })
    expect(await figmaVariables.detect(tokens, {})).toEqual([])
    expect(fromFigmaRest({ a: 1 })).toBeUndefined()
  })
})
