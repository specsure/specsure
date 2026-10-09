import { describe, expect, it } from 'vitest'
import { DiagnosticBag, validateInput } from '../src/index.js'
import { px, snapResolver, srgb } from './helpers.js'

const base = {
  color: {
    $type: 'color',
    neutral: { '0': { $value: srgb(1, 1, 1) }, '900': { $value: srgb(0.1, 0.1, 0.1) } },
  },
  text: { primary: { $type: 'color', $value: '{color.neutral.900}' } },
  space: { md: { $type: 'dimension', $value: px(16) } },
}
const dark = { color: { $type: 'color', neutral: { '900': { $value: srgb(0.95, 0.95, 0.95) } } } }

describe('Resolver 2025.10', () => {
  it('merges sets and the selected modifier context in resolution order; last wins', async () => {
    const { graph } = await snapResolver(
      {
        version: '2025.10',
        sets: { base: { sources: [{ $ref: 'base.tokens.json' }] } },
        modifiers: {
          theme: { contexts: { light: [], dark: [{ $ref: 'dark.tokens.json' }] }, default: 'light' },
        },
        resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
      },
      { 'base.tokens.json': base, 'dark.tokens.json': dark },
    )
    expect(graph.modifiers).toEqual([{ name: 'theme', contexts: ['light', 'dark'], default: 'light' }])
    expect(graph.value('color.neutral.900', { theme: 'dark' })).toMatchObject({
      components: [0.95, 0.95, 0.95],
    })
    expect(graph.value('color.neutral.900')).toMatchObject({ components: [0.1, 0.1, 0.1] })
  })

  it('resolves aliases only after merging: a theme override of a core token reaches semantic tokens', async () => {
    const { graph } = await snapResolver(
      {
        version: '2025.10',
        sets: { base: { sources: [{ $ref: 'base.tokens.json' }] } },
        modifiers: {
          theme: { contexts: { light: [], dark: [{ $ref: 'dark.tokens.json' }] }, default: 'light' },
        },
        resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
      },
      { 'base.tokens.json': base, 'dark.tokens.json': dark },
    )
    const text = graph.token('text.primary')!
    expect(text.values.map((v) => v.when)).toEqual([{ theme: 'dark' }, { theme: 'light' }])
    expect(graph.value('text.primary', { theme: 'dark' })).toMatchObject({ components: [0.95, 0.95, 0.95] })
    // Tokens no modifier influences are stored once with an empty `when`.
    expect(graph.token('space.md')!.values).toHaveLength(1)
    expect(graph.token('space.md')!.values[0]!.when).toEqual({})
  })

  it('stores values only for the modifiers that influence a token', async () => {
    const { graph, snapshot } = await snapResolver(
      {
        version: '2025.10',
        resolutionOrder: [
          { type: 'set', name: 'base', sources: [{ $ref: 'base.tokens.json' }] },
          {
            type: 'modifier',
            name: 'theme',
            contexts: { light: [], dark: [{ $ref: 'dark.tokens.json' }] },
            default: 'light',
          },
          {
            type: 'modifier',
            name: 'density',
            contexts: { regular: [], compact: [{ space: { md: { $type: 'dimension', $value: px(12) } } }] },
            default: 'regular',
          },
        ],
      },
      { 'base.tokens.json': base, 'dark.tokens.json': dark },
    )
    expect(snapshot.contexts.permutations).toBe(4)
    expect(graph.token('space.md')!.values.map((v) => v.when)).toEqual([
      { density: 'compact' },
      { density: 'regular' },
    ])
    expect(graph.token('text.primary')!.values.map((v) => Object.keys(v.when))).toEqual([
      ['theme'],
      ['theme'],
    ])
  })

  it('is tolerant of the specification inconsistencies with diagnostics', async () => {
    const { codes, graph } = await snapResolver(
      {
        version: '2025-11-01',
        modifiers: {
          theme: {
            context: {
              light: [{ $ref: 'base.tokens.json' }],
              dark: [{ $ref: 'base.tokens.json' }, { $ref: 'dark.tokens.json' }],
            },
          },
        },
        resolutionOrder: [{ $ref: '#/modifiers/theme' }],
      },
      { 'base.tokens.json': base, 'dark.tokens.json': dark },
    )
    expect(codes).toContain('resolver/version-date')
    expect(codes).toContain('resolver/context-typo')
    expect(codes).toContain('resolver/no-default')
    expect(graph.tokens().length).toBeGreaterThan(0)
  })

  it('rejects references to modifiers from sets, invalid defaults and duplicate names', async () => {
    const { codes } = await snapResolver(
      {
        version: '2025.10',
        sets: { a: { sources: [{ $ref: '#/modifiers/theme' }] } },
        modifiers: { theme: { contexts: { light: [], dark: [] }, default: 'blue' } },
        resolutionOrder: [{ $ref: '#/sets/a' }, { $ref: '#/modifiers/theme' }, { $ref: '#/sets/a' }],
      },
      {},
    )
    expect(codes).toContain('resolver/invalid-pointer')
    expect(codes).toContain('resolver/invalid-default')
    expect(codes).toContain('resolver/duplicate-name')
  })

  it('validates inputs: unknown modifier, invalid context, missing modifier; case-insensitive', () => {
    const mods = [
      { name: 'theme', contexts: ['light', 'dark'] },
      { name: 'beta', contexts: ['false', 'true'], default: 'false' },
    ]
    const d1 = new DiagnosticBag()
    expect(validateInput(mods, { Theme: 'DARK' }, d1)).toEqual({ theme: 'dark', beta: 'false' })
    const d2 = new DiagnosticBag()
    expect(validateInput(mods, { theme: 'blue', foo: 'bar' }, d2)).toBeNull()
    expect(d2.list().map((d) => d.message)).toEqual([
      'Invalid context "blue" for modifier "theme"',
      'Missing modifier "theme"',
      'Unknown modifier "foo"',
    ])
  })

  it('reports tokens that are missing in some contexts', async () => {
    const { codes } = await snapResolver(
      {
        version: '2025.10',
        modifiers: {
          theme: {
            contexts: {
              light: [{ a: { $type: 'number', $value: 1 }, b: { $type: 'number', $value: 2 } }],
              dark: [{ a: { $type: 'number', $value: 3 } }],
            },
            default: 'light',
          },
        },
        resolutionOrder: [{ $ref: '#/modifiers/theme' }],
      },
      {},
    )
    expect(codes).toContain('resolver/token-missing-in-context')
  })
})
