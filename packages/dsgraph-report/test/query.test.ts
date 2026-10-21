import { cssTokens } from '@dsgraph/adapters'
import { DsGraph, scan } from '@dsgraph/core'
import { MemorySource } from '@dsgraph/sources'
import { describe, expect, it } from 'vitest'
import { describeTokens, findToken, readToken, searchTokens, similarIds, stateOf } from '../src/index.js'

const css = `:root {
  --color-blue-500: #2563eb;
  --color-accent: var(--color-blue-500);
  --color-link: var(--color-blue-500);
  --color-text: #111827;
  --space-md: 16px;
}
[data-theme="dark"] { --color-text: #f9fafb; }
`
const graph = async () =>
  DsGraph.from(
    await scan(
      new MemorySource({ 't.css': css }, { kind: 'files', path: 't.css' }),
      { css: { include: ['t.css'] } },
      {
        adapters: [cssTokens],
      },
    ),
  )
const blue = { type: 'color', value: { space: 'srgb', components: [0.145, 0.388, 0.922], alpha: 1 } }

describe('query layer', () => {
  it('finds tokens for a value, one group per value, aliases with their target', async () => {
    const g = await graph()
    const r = findToken(g, blue)
    expect(r.value).toBe('#2563eb')
    expect(r.groups[0]).toMatchObject({ value: '#2563eb', exact: true })
    expect(r.groups[0]!.tokens.map((t) => `${t.id}${t.target ? `→${t.target}` : ''}`)).toEqual([
      'color-accent→color-blue-500',
      'color-link→color-blue-500',
      'color-blue-500',
    ])
  })

  it('reads a token: values per theme, chain, users and tokens with the same value', async () => {
    const g = await graph()
    const d = readToken(g, 'color-blue-500')!
    expect(d.users.sort()).toEqual(['color-accent', 'color-link'])
    expect(d.sameValue.sort()).toEqual(['color-accent', 'color-link'])
    const text = readToken(g, 'color-text')!
    expect(text.values.map((v) => `${JSON.stringify(v.when)} ${v.text}`)).toContain(
      '{"theme":"dark"} #f9fafb',
    )
    expect(readToken(g, 'color-accent')!.values[0]!.via).toEqual(['color-blue-500'])
    expect(readToken(g, 'nope')).toBeUndefined()
    expect(similarIds(g, 'accent')).toEqual(['color-accent'])
  })

  it('searches by part of the name, a glob or a custom property', async () => {
    const g = await graph()
    expect(searchTokens(g, { query: 'blue' }).map((r) => r.token.id)).toEqual(['color-blue-500'])
    expect(searchTokens(g, { query: '--color-link' }).map((r) => r.token.id)).toEqual(['color-link'])
    expect(searchTokens(g, { type: 'dimension' }).map((r) => r.text)).toEqual(['16px'])
  })

  it('of equal tokens, puts the general one and the one more tokens build on first, in CSS names too', async () => {
    const g = DsGraph.from(
      await scan(
        new MemorySource(
          {
            't.css': `:root {
  --fgColor-black: #1f2328;
  --fgColor-default: #1f2328;
  --button-fgColor-default: #1f2328;
  --link-fgColor: var(--fgColor-default);
  --menu-fgColor: var(--fgColor-default);
}`,
          },
          { kind: 'files', path: 't.css' },
        ),
        { css: { include: ['t.css'] } },
        { adapters: [cssTokens] },
      ),
    )
    const r = findToken(
      g,
      { type: 'color', value: { space: 'srgb', components: [0.122, 0.137, 0.157], alpha: 1 } },
      {
        context: 'color',
      },
    )
    const ids = r.groups[0]!.tokens.map((t) => t.id)
    // Aliases first; then fgColor-default (two references) before fgColor-black; the button's last of the general.
    expect(ids.indexOf('fgColor-default')).toBeLessThan(ids.indexOf('fgColor-black'))
    expect(ids.indexOf('fgColor-black')).toBeLessThan(ids.indexOf('button-fgColor-default'))
  })

  it('describes the system and words states', async () => {
    const d = describeTokens(await graph())
    expect(d).toMatchObject({ tokens: 5, values: 3, aliases: 2, errors: 0 })
    expect(d.types).toEqual([
      ['color', 4],
      ['dimension', 1],
    ])
    expect(d.modes[0]).toMatchObject({ name: 'theme', default: 'default' })
    expect(stateOf(':focus-visible')).toBe('focus')
    expect(stateOf('pressed')).toBe('pressed')
    expect(
      stateOf('pressed', {
        schema: 'dsgraph/knowledge@1',
        version: '1',
        vocabulary: { states: { pressed: 'active' } },
      }),
    ).toBe('active')
  })
})
