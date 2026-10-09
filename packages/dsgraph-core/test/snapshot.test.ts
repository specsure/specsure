import { describe, expect, it } from 'vitest'
import { DsGraph, validateSnapshot } from '../src/index.js'
import { px, snap, srgb } from './helpers.js'

const tokens = {
  color: { $type: 'color', base: { white: { $value: srgb(1, 1, 1) }, ink: { $value: srgb(0.1, 0.1, 0.1) } } },
  text: { primary: { $type: 'color', $value: '{color.base.ink}' } },
  space: { $type: 'dimension', md: { $value: px(16) } },
}

describe('snapshot', () => {
  it('is valid against the published schema', async () => {
    const { snapshot } = await snap(tokens)
    expect(validateSnapshot(snapshot)).toEqual({ ok: true, errors: [] })
  })

  it('hash does not depend on key order in the source', async () => {
    const a = await snap(tokens)
    const b = await snap({ space: tokens.space, text: tokens.text, color: tokens.color })
    expect(a.snapshot.hash).toBe(b.snapshot.hash)
  })

  it('hash changes when a value changes', async () => {
    const a = await snap(tokens)
    const b = await snap({ ...tokens, space: { $type: 'dimension', md: { $value: px(20) } } })
    expect(a.snapshot.hash).not.toBe(b.snapshot.hash)
  })

  it('round-trips through JSON', async () => {
    const { snapshot } = await snap(tokens)
    const g = DsGraph.from(JSON.parse(JSON.stringify(snapshot)))
    expect(g.value('text.primary')).toEqual(DsGraph.from(snapshot).value('text.primary'))
  })

  it('assigns layers from dot-path globs, first match wins', async () => {
    const { graph } = await snap(tokens, {
      layers: { core: { match: ['color.base.**', 'space.*'], public: false }, semantic: { match: ['**'] } },
    })
    expect(graph.token('color.base.white')?.layer).toBe('core')
    expect(graph.token('text.primary')?.layer).toBe('semantic')
  })

  it('later documents override earlier ones (synthetic set order)', async () => {
    const { graph, codes } = await snap([tokens, { space: { $type: 'dimension', md: { $value: px(24) } } }])
    expect(graph.value('space.md')).toEqual(px(24))
    expect(codes).not.toContain('tokens/token-group-conflict')
  })
})

describe('graph queries', () => {
  it('finds tokens by value (reverse index) and by CSS variable name', async () => {
    const { graph } = await snap({
      ...tokens,
      surface: { page: { $type: 'color', $value: '{color.base.white}' } },
      fontSize: { $type: 'dimension', bodyLarge: { $value: px(18) } },
    })
    expect(graph.byValue(graph.value('color.base.white'), { type: 'color' }).map((t) => t.id)).toEqual([
      'color.base.white',
      'surface.page',
    ])
    expect(graph.byCssVar('--ds-font-size-body-large', '--ds-').map((t) => t.id)).toEqual([
      'fontSize.bodyLarge',
    ])
    expect(graph.dependents('color.base.ink')).toEqual(['text.primary'])
  })
})
