import { describe, expect, it } from 'vitest'
import { canonicalize, contentHash, roundNumber } from '../src/index.js'

describe('canonical JSON', () => {
  it('sorts keys deeply and drops undefined', () => {
    expect(canonicalize({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: undefined } })).toBe(
      '{"a":{"d":[3,{"y":2,"z":1}]},"b":1}',
    )
  })

  it('rounds numbers to 6 decimals and normalizes -0', () => {
    expect(roundNumber(0.1 + 0.2)).toBe(0.3)
    expect(roundNumber(-0.0000001)).toBe(0)
    expect(canonicalize([1 / 3])).toBe('[0.333333]')
  })

  it('hash ignores key order, hash and meta', async () => {
    const a = await contentHash({ x: 1, y: { b: 2, a: 1 }, meta: { t: 1 }, hash: 'old' })
    const b = await contentHash({ y: { a: 1, b: 2 }, x: 1, meta: { t: 2 } })
    expect(a).toBe(b)
    expect(a).toMatch(/^sha256:[0-9a-f]{64}$/)
  })
})
