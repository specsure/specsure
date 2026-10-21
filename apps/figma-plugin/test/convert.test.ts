import { DsGraph, scan } from '@dsgraph/core'
import { MemorySource } from '@dsgraph/sources'
import { describe, expect, it } from 'vitest'
import { convert } from '../src/convert'
import type { RawExport } from '../src/raw'

const white = { r: 1, g: 1, b: 1, a: 1 }
const ink = { r: 0.06, g: 0.09, b: 0.16, a: 1 }

const file: RawExport = {
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
      valuesByMode: { m0: 0.6 },
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
      valuesByMode: { m0: 140 },
    },
    // A color and an opacity: written as the color with that alpha.
    {
      id: 'v13',
      name: 'overlay/scrim',
      collectionId: 'c2',
      type: 'COLOR',
      scopes: [],
      valuesByMode: {
        l: { composed: { color: { alias: 'v2' }, opacity: 0.5 } },
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
  const out = convert(file)

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
      { name: 'motion/ease/bouncy', message: 'the bouncy curve has no exact cubic Bézier; left out' },
    ])
    expect(out.stats).toMatchObject({ collections: 2, variables: 14, styles: 3, skipped: 1 })
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
    })
    expect(p.motion!.duration).toMatchObject({
      fast: { $type: 'duration', $value: { value: 140, unit: 'ms' } },
    })
    const dark = out.files['Theme/Dark.tokens.json'] as Record<
      string,
      Record<string, Record<string, unknown>>
    >
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
