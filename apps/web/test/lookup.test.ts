import { describe, expect, it } from 'vitest'
import { looksLikeCode } from '../src/lib/code-text'
import { EXAMPLE } from '../src/lib/example'
import { session } from '../src/lib/lookup'
import { readLookupUrl, writeLookupUrl } from '../src/lib/lookup-url'

const open = async () => {
  const ask = session()
  const r = await ask({ id: 1, kind: 'open', source: { kind: 'files', files: EXAMPLE.head }, include: '' })
  if (!r.ok || r.kind !== 'open') throw new Error('open failed')
  return { ask, r }
}

describe('Token Lookup', () => {
  it('opens a system once and lists its tokens with values per theme', async () => {
    const { r } = await open()
    expect(r.summary.description.tokens).toBe(r.index.length)
    const accent = r.index.find((x) => x.id === 'color-accent')!
    expect(accent).toMatchObject({ css: '--color-accent', alias: true, group: 'color' })
    expect(accent.values.map((v) => v.text)).toContain('#7aa2ff')
  })

  it('answers a value with the token for its property, and says when the text is not a value', async () => {
    const { ask } = await open()
    const bg = await ask({ id: 2, kind: 'find', text: 'background: #f9fafb', context: {} })
    if (!bg.ok || bg.kind !== 'find' || !bg.answer) throw new Error('no answer')
    expect(bg.answer).toMatchObject({ property: 'background', fromQuery: true })
    expect(bg.answer.result.groups[0]!.tokens[0]!.id).toBe('color-bg')
    const name = await ask({ id: 3, kind: 'find', text: 'accent', context: {} })
    expect(name.ok && name.kind === 'find' && name.answer).toBe(null)
  })

  it('rewrites pasted code on tokens: exact matches replaced, the rest suggested, numbers in scripts left', async () => {
    const { ask } = await open()
    const css = await ask({
      id: 4,
      kind: 'snippet',
      text: '.card {\n  background: #f9fafb;\n  padding: 16px 13px;\n}\n.card:hover { background: #1d4ed8; }',
    })
    if (!css.ok || css.kind !== 'snippet') throw new Error('no snippet')
    expect(css.snippet.output).toBe(
      '.card {\n  background: var(--color-bg);\n  padding: var(--space-md) 13px;\n}\n.card:hover { background: var(--color-accent-hover); }',
    )
    expect(css.snippet.edits.find((e) => e.from === '13px')).toMatchObject({ exact: false, applied: false })
    const tsx = await ask({
      id: 5,
      kind: 'snippet',
      text: '<button className="bg-[#3366ff]" style={{ color: "#f9fafb", gap: 8 }} />',
    })
    if (!tsx.ok || tsx.kind !== 'snippet') throw new Error('no snippet')
    expect(tsx.snippet.output).toContain('className="bg-accent"')
    expect(tsx.snippet.output).toContain('gap: 8')
  })

  it('tells code from a name or a value', () => {
    expect(looksLikeCode('#3366ff')).toBe(false)
    expect(looksLikeCode('background: #fff')).toBe(false)
    expect(looksLikeCode('accent.emphasis')).toBe(false)
    expect(looksLikeCode('color: #fff; background: #000;')).toBe(true)
    expect(looksLikeCode('<div className="p-4" />')).toBe(true)
  })

  it('keeps the source, theme, search and open token in the address', () => {
    const url = writeLookupUrl(
      '/tools/tokens',
      {
        source: { kind: 'npm', pkg: '@scope/tokens', version: '1.2.0' },
        include: '',
        context: { theme: 'dark' },
        query: '#fff',
        token: 'color.text',
      },
      'd=abc',
    )
    expect(url).toBe('/tools/tokens?pkg=@scope/tokens&v=1.2.0&ctx=theme:dark&q=%23fff#t=color.text&d=abc')
    expect(readLookupUrl(new URL(url, 'https://x.test'))).toEqual({
      source: { kind: 'npm', pkg: '@scope/tokens', version: '1.2.0' },
      include: '',
      context: { theme: 'dark' },
      query: '#fff',
      token: 'color.text',
    })
  })
})
