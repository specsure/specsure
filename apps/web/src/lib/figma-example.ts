import type { FigmaColor, FigmaExport, FigmaValue, FigmaVariable } from '@dsgraph/adapters/figma'

/**
 * A small Figma file as the plugin reads it, for the guide's plugin figure: primitives with and
 * without scopes, a theme with two modes, a density collection, motion, and one style of each kind.
 * A spring and a flag have no DTCG type, so the plugin lists them after reading.
 */
const hex = (h: string): FigmaColor => ({
  r: Number.parseInt(h.slice(1, 3), 16) / 255,
  g: Number.parseInt(h.slice(3, 5), 16) / 255,
  b: Number.parseInt(h.slice(5, 7), 16) / 255,
  a: 1,
})
const alias = (id: string) => ({ alias: id })

let n = 0
const variable = (
  collectionId: string,
  name: string,
  type: FigmaVariable['type'],
  scopes: string[],
  valuesByMode: Record<string, FigmaValue>,
): FigmaVariable => ({ id: `v${++n}`, name, collectionId, type, scopes, valuesByMode })

const P = (name: string, type: FigmaVariable['type'], scopes: string[], v: FigmaValue) =>
  variable('primitives', name, type, scopes, { value: v })

const primitives = [
  P('color/gray/0', 'COLOR', [], hex('#ffffff')),
  P('color/gray/400', 'COLOR', [], hex('#94a3b8')),
  P('color/gray/500', 'COLOR', [], hex('#64748b')),
  P('color/gray/800', 'COLOR', [], hex('#1e293b')),
  P('color/gray/900', 'COLOR', [], hex('#0f172a')),
  P('color/blue/400', 'COLOR', [], hex('#60a5fa')),
  P('color/blue/600', 'COLOR', [], hex('#2563eb')),
  P('space/2', 'FLOAT', [], 8),
  P('space/3', 'FLOAT', [], 12),
  P('space/4', 'FLOAT', [], 16),
  P('radius/md', 'FLOAT', ['CORNER_RADIUS'], 8),
  P('font/size/14', 'FLOAT', [], 14),
  P('font/size/16', 'FLOAT', [], 16),
  P('font/family/sans', 'STRING', ['FONT_FAMILY'], 'Inter'),
  P('font/weight/semibold', 'STRING', ['FONT_STYLE'], 'Semi Bold'),
  P('opacity/scrim', 'FLOAT', ['OPACITY'], 40),
]
const id = (name: string) => primitives.find((v) => v.name === name)!.id

const theme = [
  ['color/text/default', 'color/gray/900', 'color/gray/0', ['TEXT_FILL']],
  ['color/text/muted', 'color/gray/500', 'color/gray/400', ['TEXT_FILL']],
  ['color/bg/default', 'color/gray/0', 'color/gray/900', ['FRAME_FILL', 'SHAPE_FILL']],
  ['color/bg/raised', 'color/gray/0', 'color/gray/800', ['FRAME_FILL', 'SHAPE_FILL']],
  ['color/accent', 'color/blue/600', 'color/blue/400', ['ALL_FILLS', 'STROKE_COLOR']],
].map(([name, light, dark, scopes]) =>
  variable('theme', name as string, 'COLOR', scopes as string[], {
    light: alias(id(light as string)),
    dark: alias(id(dark as string)),
  }),
)
const scrim = variable('theme', 'color/overlay/scrim', 'COLOR', ['FRAME_FILL'], {
  light: { composed: { color: alias(id('color/gray/900')), opacity: alias(id('opacity/scrim')) } },
  dark: { composed: { color: alias(id('color/gray/900')), opacity: alias(id('opacity/scrim')) } },
})

const density = [
  ['space/inset', 'space/4', 'space/3', ['GAP']],
  ['space/gap', 'space/3', 'space/2', ['GAP']],
  ['font/size/body', 'font/size/16', 'font/size/14', ['FONT_SIZE']],
].map(([name, desktop, mobile, scopes]) =>
  variable('density', name as string, 'FLOAT', scopes as string[], {
    desktop: alias(id(desktop as string)),
    mobile: alias(id(mobile as string)),
  }),
)
const bodySize = density.find((v) => v.name === 'font/size/body')!.id

const motion = [
  variable('motion', 'duration/fast', 'TIMING', [], { value: 0.12 }),
  variable('motion', 'easing/standard', 'EASING', [], { value: { easing: { type: 'EASE_OUT' } } }),
  variable('motion', 'easing/emphasized', 'EASING', [], { value: { easing: { type: 'EASE_OUT_BACK' } } }),
  variable('motion', 'easing/bouncy', 'EASING', [], { value: { easing: { type: 'SPRING' } } }),
  variable('motion', 'flags/beta', 'BOOLEAN', [], { value: true }),
]

const one = (cid: string, name: string, modes: Array<[string, string]>) => ({
  id: cid,
  name,
  modes: modes.map(([mid, mname]) => ({ id: mid, name: mname })),
  defaultModeId: modes[0]![0],
})

export const FIGMA_EXAMPLE: FigmaExport = {
  file: { name: 'Example design system' },
  collections: [
    one('primitives', 'Primitives', [['value', 'Value']]),
    one('theme', 'Theme', [
      ['light', 'Light'],
      ['dark', 'Dark'],
    ]),
    one('density', 'Density', [
      ['desktop', 'Desktop'],
      ['mobile', 'Mobile'],
    ]),
    one('motion', 'Motion', [['value', 'Value']]),
  ],
  variables: [...primitives, ...theme, scrim, ...density, ...motion],
  external: {},
  styles: {
    paint: [
      {
        id: 's1',
        name: 'Brand gradient',
        paints: [
          {
            type: 'GRADIENT_LINEAR',
            stops: [
              { position: 0, color: hex('#2563eb') },
              { position: 1, color: hex('#60a5fa') },
            ],
          },
        ],
      },
    ],
    text: [
      {
        id: 's2',
        name: 'Body',
        fontFamily: 'Inter',
        fontStyle: 'Regular',
        fontSize: 16,
        lineHeight: { unit: 'PIXELS', value: 24 },
        letterSpacing: { unit: 'PIXELS', value: 0 },
        bound: { fontFamily: id('font/family/sans'), fontSize: bodySize },
      },
      {
        id: 's3',
        name: 'Title',
        fontFamily: 'Inter',
        fontStyle: 'Semi Bold',
        fontSize: 20,
        lineHeight: { unit: 'PERCENT', value: 130 },
        letterSpacing: { unit: 'PERCENT', value: -1 },
        bound: { fontFamily: id('font/family/sans'), fontStyle: id('font/weight/semibold') },
      },
    ],
    effect: [
      {
        id: 's4',
        name: 'Shadow/Raised',
        effects: [
          {
            type: 'DROP_SHADOW',
            color: { ...hex('#0f172a'), a: 0.12 },
            offset: { x: 0, y: 1 },
            radius: 3,
            spread: 0,
          },
        ],
      },
      { id: 's5', name: 'Blur/Glass', effects: [{ type: 'BACKGROUND_BLUR', radius: 16 }] },
    ],
    grid: [
      {
        id: 's6',
        name: 'Layout/Desktop',
        grids: [{ pattern: 'COLUMNS', alignment: 'STRETCH', count: 12, gutterSize: 24, offset: 32 }],
      },
    ],
  },
}
