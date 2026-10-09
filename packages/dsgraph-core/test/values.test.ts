import { describe, expect, it } from 'vitest'
import { compareValues, DiagnosticBag } from '../src/index.js'
import { canonicalValue } from '../src/values/canonical.js'
import type { ValueContext } from '../src/values/context.js'
import { px, srgb } from './helpers.js'

const ctx = (strict = false): ValueContext => ({ strict, diag: new DiagnosticBag(), flags: new Set() })

describe('values — color module', () => {
  it('accepts the 2025.10 object form, `none` components and a 6-digit hex fallback', () => {
    const c = ctx()
    expect(
      canonicalValue('color', { colorSpace: 'hsl', components: ['none', 0, 100], hex: '#FFFFFF' }, c),
    ).toEqual({
      space: 'hsl',
      components: [null, 0, 100],
      alpha: 1,
      hex: '#ffffff',
    })
    expect(c.diag.list()).toEqual([])
  })

  it('reads legacy color strings only in lenient mode', () => {
    const lenient = ctx()
    expect(canonicalValue('color', '#ff000080', lenient)).toMatchObject({
      space: 'srgb',
      components: [1, 0, 0],
      alpha: 0.5019607843137255,
    })
    expect(lenient.flags.has('legacy-syntax')).toBe(true)
    const strict = ctx(true)
    expect(canonicalValue('color', '#ff0000', strict)).toBeUndefined()
    expect(strict.diag.list()[0]?.code).toBe('dtcg/legacy-syntax')
  })

  it('rejects unknown color spaces', () => {
    const c = ctx()
    expect(canonicalValue('color', { colorSpace: 'cmyk', components: [0, 0, 0] }, c)).toBeUndefined()
    expect(c.diag.list()[0]?.code).toBe('dtcg/invalid-color-space')
  })

  it('treats the same color in another space as a notation change, not a value change', () => {
    const a = canonicalValue('color', srgb(1, 0, 1), ctx())
    const b = canonicalValue('color', { colorSpace: 'oklch', components: [0.7016, 0.3225, 328.363] }, ctx())
    expect(compareValues('color', a, b).result).toBe('notation')
    const c = canonicalValue('color', srgb(0.9, 0, 1), ctx())
    const r = compareValues('color', a, c)
    expect(r.result).toBe('changed')
    expect(r.result === 'changed' && (r.delta?.deltaEOK as number)).toBeGreaterThan(1)
  })
})

describe('values — format module types', () => {
  it('dimension: only px and rem are standard; rem vs px of the same size is notation', () => {
    const c = ctx()
    expect(canonicalValue('dimension', { value: 1, unit: 'em' }, c)).toEqual({ value: 1, unit: 'em' })
    expect(c.diag.list()[0]?.code).toBe('dtcg/invalid-unit')
    expect(compareValues('dimension', { value: 1, unit: 'rem' }, px(16)).result).toBe('notation')
    expect(compareValues('dimension', px(16), px(20))).toEqual({
      result: 'changed',
      delta: { px: 4, ratio: 0.25 },
    })
  })

  it('fontWeight: case-sensitive keywords; loose spellings only in lenient mode', () => {
    expect(canonicalValue('fontWeight', 'extra-bold', ctx())).toBe(800)
    const c = ctx()
    expect(canonicalValue('fontWeight', 'SemiBold', c)).toBe(600)
    expect(c.diag.list()[0]?.code).toBe('dtcg/invalid-font-weight')
    expect(canonicalValue('fontWeight', 'SemiBold', ctx(true))).toBeUndefined()
    expect(canonicalValue('fontWeight', 1001, ctx())).toBeUndefined()
  })

  it('typography: lineHeight is a multiplier; legacy px is converted using fontSize', () => {
    const c = ctx()
    const v = canonicalValue(
      'typography',
      { fontFamily: 'Inter', fontSize: px(16), fontWeight: 400, letterSpacing: px(0), lineHeight: '24px' },
      c,
    ) as { lineHeight: number; fontFamily: string[] }
    expect(v.lineHeight).toBe(1.5)
    expect(v.fontFamily).toEqual(['Inter'])
  })

  it('shadow: single object becomes an array; inset defaults to false', () => {
    const v = canonicalValue(
      'shadow',
      { color: srgb(0, 0, 0), offsetX: px(0), offsetY: px(1), blur: px(2), spread: px(0) },
      ctx(),
    )
    expect(v).toEqual([expect.objectContaining({ inset: false })])
  })

  it('gradient: positions are clamped to [0, 1]', () => {
    const v = canonicalValue(
      'gradient',
      [
        { color: srgb(0, 0, 1), position: -99 },
        { color: srgb(1, 0, 0), position: 42 },
      ],
      ctx(),
    ) as Array<{ position: number }>
    expect(v.map((s) => s.position)).toEqual([0, 1])
  })

  it('duration, cubicBezier, strokeStyle and border', () => {
    expect(compareValues('duration', { value: 0.2, unit: 's' }, { value: 200, unit: 'ms' }).result).toBe(
      'notation',
    )
    expect(canonicalValue('cubicBezier', [0.5, 0, 1.5, 1], ctx())).toBeUndefined()
    expect(canonicalValue('strokeStyle', { dashArray: [px(4), px(2)], lineCap: 'round' }, ctx())).toEqual({
      dashArray: [px(4), px(2)],
      lineCap: 'round',
    })
    const border = canonicalValue('border', { color: srgb(0, 0, 0), width: px(1), style: 'solid' }, ctx())
    const thicker = canonicalValue('border', { color: srgb(0, 0, 0), width: px(2), style: 'solid' }, ctx())
    expect(compareValues('border', border, thicker)).toEqual({
      result: 'changed',
      delta: { fields: ['width'] },
    })
  })
})
