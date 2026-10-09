import { describe, expect, it } from 'vitest'
import { diff, validateChangeset } from '../src/index.js'
import { px, snap, snapResolver, srgb } from './helpers.js'

const v1 = {
  color: {
    $type: 'color',
    base: { blue: { $value: srgb(0, 0.4, 0.8) }, white: { $value: srgb(1, 1, 1) } },
  },
  action: { primary: { $type: 'color', $value: '{color.base.blue}' } },
  space: { $type: 'dimension', sm: { $value: px(8) }, md: { $value: px(16) } },
}

async function compare(a: unknown, b: unknown, opts = {}) {
  const base = await snap(a as Record<string, unknown>)
  const head = await snap(b as Record<string, unknown>)
  const cs = await diff(base.graph, head.graph, opts)
  return { cs, kinds: cs.changes.map((c) => `${c.kind} ${c.target}`) }
}

describe('diff', () => {
  it('is empty for identical snapshots', async () => {
    const { cs } = await compare(v1, v1)
    expect(cs.changes).toEqual([])
    expect(cs.summary.level).toBe('none')
    expect(validateChangeset(cs).ok).toBe(true)
  })

  it('separates direct changes from propagated ones and links the cause', async () => {
    const v2 = structuredClone(v1)
    v2.color.base.blue.$value = srgb(0, 0.3, 0.9)
    const { cs } = await compare(v1, v2)
    const direct = cs.changes.find((c) => c.target === 'color.base.blue')!
    const propagated = cs.changes.find((c) => c.target === 'action.primary')!
    expect(direct.origin).toBe('direct')
    expect(propagated.origin).toBe('propagated')
    expect(propagated.cause).toEqual([direct.id])
    expect(cs.summary.counts).toMatchObject({ changed: 1, propagated: 1 })
  })

  it('detects a rename when type, values and path are close', async () => {
    const v2 = structuredClone(v1) as Record<string, any>
    v2.space = { $type: 'dimension', small: { $value: px(8) }, md: { $value: px(16) } }
    const { cs, kinds } = await compare(v1, v2)
    expect(kinds).toContain('token.renamed space.small')
    expect(cs.changes.find((c) => c.kind === 'token.renamed')!.from).toBe('space.sm')
    expect(cs.summary.level).toBe('major')
  })

  it('does not guess between equally plausible renames', async () => {
    const a = { c: { $type: 'color', white: { $value: srgb(1, 1, 1) } } }
    const b = {
      c: { $type: 'color', 'white-1': { $value: srgb(1, 1, 1) }, 'white-2': { $value: srgb(1, 1, 1) } },
    }
    const { cs } = await compare(a, b)
    const removed = cs.changes.find((c) => c.kind === 'token.removed')!
    expect(removed.possibleRenames).toEqual(['c.white-1', 'c.white-2'])
  })

  it('honours explicit rename hints', async () => {
    const a = { x: { $type: 'number', old: { $value: 1 } } }
    const b = { y: { $type: 'number', unrelated: { $value: 1 } } }
    const { kinds } = await compare(a, b, { renames: { 'x.old': 'y.unrelated' } })
    expect(kinds).toEqual(['token.renamed y.unrelated'])
  })

  it('classifies notation-only changes as none and imperceptible changes as patch', async () => {
    const v2 = structuredClone(v1) as Record<string, any>
    v2.space.md.$value = { value: 1, unit: 'rem' }
    v2.space.sm.$value = px(8.2)
    const { cs } = await compare(v1, v2)
    const md = cs.changes.find((c) => c.target === 'space.md')!
    const sm = cs.changes.find((c) => c.target === 'space.sm')!
    expect([md.kind, md.level]).toEqual(['token.notation-changed', 'none'])
    expect([sm.kind, sm.level]).toEqual(['token.value-changed', 'patch'])
  })

  it('caps non-public layers at patch', async () => {
    const v2 = structuredClone(v1) as Record<string, any>
    delete v2.color.base.white
    const base = await snap(v1, { layers: { core: { match: ['color.base.*'], public: false } } })
    const head = await snap(v2, { layers: { core: { match: ['color.base.*'], public: false } } })
    const cs = await diff(base.graph, head.graph, { layers: { core: { public: false } } })
    expect(cs.changes.map((c) => [c.kind, c.level])).toEqual([['token.removed', 'patch']])
  })

  it('reports deprecation with replacement as minor', async () => {
    const v2 = structuredClone(v1) as Record<string, any>
    v2.action.primary.$deprecated = 'Use {color.base.blue}'
    const { cs } = await compare(v1, v2)
    expect(cs.changes.map((c) => [c.kind, c.level])).toEqual([['token.deprecated', 'minor']])
  })

  it('compares per context and reports changes only where they happen', async () => {
    const resolver = (darkInk: number) => ({
      version: '2025.10',
      sets: { base: { sources: [{ text: { $type: 'color', ink: { $value: srgb(0.1, 0.1, 0.1) } } }] } },
      modifiers: {
        theme: {
          contexts: {
            light: [],
            dark: [{ text: { $type: 'color', ink: { $value: srgb(darkInk, darkInk, darkInk) } } }],
          },
          default: 'light',
        },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
    })
    const a = await snapResolver(resolver(0.9))
    const b = await snapResolver(resolver(0.8))
    const cs = await diff(a.graph, b.graph)
    expect(cs.changes.map((c) => [c.kind, c.target, c.when])).toEqual([
      ['token.value-changed', 'text.ink', { theme: 'dark' }],
    ])
  })

  it('reports added and removed modifier contexts', async () => {
    const r = (contexts: Record<string, unknown[]>) => ({
      version: '2025.10',
      modifiers: { theme: { contexts, default: 'light' } },
      resolutionOrder: [{ $ref: '#/modifiers/theme' }],
    })
    const a = await snapResolver(r({ light: [], dark: [] }))
    const b = await snapResolver(r({ light: [], hc: [] }))
    const cs = await diff(a.graph, b.graph)
    expect(cs.changes.map((c) => [c.kind, c.target, c.level])).toEqual([
      ['context.removed', 'theme:dark', 'major'],
      ['context.added', 'theme:hc', 'minor'],
    ])
  })
})
