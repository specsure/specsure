import { describe, expect, it } from 'vitest'
import { diff } from '../src/index.js'
import { snapResolver, srgb } from './helpers.js'

/** Budget from the spec (section 8): 10 000 tokens × 4 permutations resolve in < 1 s in Node. CI gets 3× slack. */
function system(n: number, shift = 0) {
  const core: Record<string, unknown> = { $type: 'color' }
  const semantic: Record<string, unknown> = {}
  for (let i = 0; i < n / 2; i++) {
    core[`c${i}`] = { $value: srgb(((i + shift) % 255) / 255, 0.5, 0.5) }
    semantic[`s${i}`] = { $type: 'color', $value: `{core.c${i}}` }
  }
  return {
    version: '2025.10',
    sets: { base: { sources: [{ core, semantic }] } },
    modifiers: {
      theme: {
        contexts: { light: [], dark: [{ core: { $type: 'color', c0: { $value: srgb(0, 0, 0) } } }] },
        default: 'light',
      },
      density: { contexts: { regular: [], compact: [] }, default: 'regular' },
    },
    resolutionOrder: [
      { $ref: '#/sets/base' },
      { $ref: '#/modifiers/theme' },
      { $ref: '#/modifiers/density' },
    ],
  }
}

describe('performance', () => {
  it('resolves 10 000 tokens × 4 permutations and diffs them within budget', async () => {
    const t0 = performance.now()
    const a = await snapResolver(system(10_000))
    const t1 = performance.now()
    const b = await snapResolver(system(10_000, 1))
    const t2 = performance.now()
    const cs = await diff(a.graph, b.graph)
    const t3 = performance.now()
    console.log(
      `resolve ${Math.round(t1 - t0)} ms, diff ${Math.round(t3 - t2)} ms, ${cs.changes.length} changes`,
    )
    expect(a.snapshot.nodes.tokens).toHaveLength(10_000)
    expect(t1 - t0).toBeLessThan(3000)
    expect(t3 - t2).toBeLessThan(3000)
  }, 60_000)
})
