import { describe, expect, it } from 'vitest'
import { DsGraph, NOT_TOKENS, scan } from '../src/index.js'
import { InlineSource, px } from './helpers.js'

describe('scan', () => {
  it('finds token files by default globs and orders them by config', async () => {
    const source = new InlineSource({
      'tokens/semantic.tokens.json': { space: { gap: { $type: 'dimension', $value: '{space.base}' } } },
      'tokens/core.tokens.json': { space: { base: { $type: 'dimension', $value: px(4) } } },
      'node_modules/x/ignored.tokens.json': { ignored: { $type: 'number', $value: 1 } },
      'README.md': '# hi',
    })
    const snapshot = await scan(source, { tokens: { order: ['tokens/core*', 'tokens/semantic*'] } })
    const g = DsGraph.from(snapshot)
    expect(g.tokens().map((t) => t.id)).toEqual(['space.base', 'space.gap'])
    expect(g.value('space.gap')).toEqual(px(4))
  })

  it('prefers a resolver document and loads its file references relative to it', async () => {
    const source = new InlineSource({
      'tokens/system.resolver.json': {
        version: '2025.10',
        sets: { core: { sources: [{ $ref: 'core.tokens.json' }] } },
        resolutionOrder: [{ $ref: '#/sets/core' }],
      },
      'tokens/core.tokens.json': { n: { $type: 'number', $value: 1 } },
    })
    const g = DsGraph.from(await scan(source))
    expect(g.value('n')).toBe(1)
  })

  it('accepts JSONC with a diagnostic', async () => {
    const source = new InlineSource({
      'a.tokens.json': '{ // comment\n "n": { "$type": "number", "$value": 1, }, }',
    })
    const snapshot = await scan(source)
    expect(snapshot.diagnostics.map((d) => d.code)).toContain('tokens/non-json')
    expect(DsGraph.from(snapshot).value('n')).toBe(1)
  })
})

describe('NOT_TOKENS', () => {
  it('matches config files and resolver documents, not token files', () => {
    for (const p of [
      'package.json',
      'a/tsconfig.base.json',
      '.eslintrc.json',
      'resolver.json',
      'x/system.resolver.json',
    ])
      expect(NOT_TOKENS.test(p), p).toBe(true)
    for (const p of ['tokens.json', 'color.tokens.json', 'a/resolvers.json', 'myresolver.json'])
      expect(NOT_TOKENS.test(p), p).toBe(false)
  })
})
