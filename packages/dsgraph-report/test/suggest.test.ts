import { cssTokens } from '@dsgraph/adapters'
import { DsGraph, scan } from '@dsgraph/core'
import { MemorySource } from '@dsgraph/sources'
import { describe, expect, it } from 'vitest'
import { suggestName } from '../src/index.js'

const graph = async (css: string) =>
  DsGraph.from(
    await scan(
      new MemorySource({ 't.css': css }, { kind: 'files', path: 't.css' }),
      { css: { include: ['t.css'] } },
      {
        adapters: [cssTokens],
      },
    ),
  )
const srgb = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16)
  return { space: 'srgb', components: [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255], alpha: 1 }
}

describe('suggestName', () => {
  it('names a new step of a color ramp between the steps it falls between', async () => {
    const g = await graph(`:root {
  --gray-50: #f8fafc; --gray-100: #f1f5f9; --gray-200: #e2e8f0; --gray-500: #64748b; --gray-900: #0f172a;
  --blue-50: #eff6ff; --blue-500: #3b82f6; --blue-700: #1d4ed8;
  --bg: var(--gray-50);
}`)
    expect(suggestName(g, { type: 'color', value: srgb('#e9eef5') })).toEqual({
      name: 'gray-150',
      between: ['gray-100', 'gray-200'],
      scale: 'gray',
    })
    // A light violet is as light as the greys but no step of them; nothing is suggested.
    expect(suggestName(g, { type: 'color', value: srgb('#ede9fe') })).toBeUndefined()
    // A value the ramp already has needs no new token.
    expect(suggestName(g, { type: 'color', value: srgb('#f1f5f9') })).toBeUndefined()
  })

  it('names a size step the way the scale numbers its steps', async () => {
    const ordinal = await graph(
      ':root { --space-1: 4px; --space-2: 8px; --space-4: 16px; --space-6: 24px; --pad: var(--space-4); }',
    )
    expect(
      suggestName(ordinal, { type: 'dimension', value: { value: 20, unit: 'px' } }, { near: 'pad' }),
    ).toMatchObject({
      name: 'space-5',
      between: ['space-4', 'space-6'],
    })
    // 14px is no whole step of ×4: nothing to name.
    expect(
      suggestName(ordinal, { type: 'dimension', value: { value: 14, unit: 'px' } }, { near: 'pad' }),
    ).toBeUndefined()
    const bySize = await graph(':root { --size-12: 12px; --size-16: 16px; --size-24: 24px; }')
    expect(
      suggestName(bySize, { type: 'dimension', value: { value: 20, unit: 'px' } }, { near: 'size-16' })?.name,
    ).toBe('size-20')
  })
})
