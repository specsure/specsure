import { describe, expect, it } from 'vitest'
import { looksLikeCode } from '../src/lib/code-text'
import { EXAMPLE } from '../src/lib/example'
import { session } from '../src/lib/lookup'
import { LOOKUP_EXAMPLE } from '../src/lib/lookup-example'
import { readLookupUrl, writeLookupUrl } from '../src/lib/lookup-url'

const open = async () => {
  const ask = session()
  const r = await ask({ id: 1, kind: 'open', source: { kind: 'files', files: EXAMPLE.head }, include: '' })
  if (!r.ok || r.kind !== 'open') throw new Error('open failed')
  return { ask, r }
}

describe('Token Fix', () => {
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

  it('reads how the system is meant to be used: what is for what, and where one value means different tokens', async () => {
    const ask = session()
    await ask({ id: 1, kind: 'open', source: { kind: 'files', files: LOOKUP_EXAMPLE }, include: '' })
    const r = await ask({ id: 2, kind: 'overview' })
    if (!r.ok || r.kind !== 'overview') throw new Error('no overview')
    const o = r.overview
    expect(o.uses.find((u) => u.use === 'border')?.tokens.map((x) => x.id)).toEqual([
      'border-accent',
      'border-danger',
      'border-default',
    ])
    expect(o.states.map((s) => s.state)).toEqual(['hover', 'focus', 'disabled', 'selected'])
    expect(o.space.map((x) => x.px)).toEqual([4, 8, 12, 16, 24])
    const blue = o.traps.find((x) => x.value === '#2563eb')!
    expect(blue.picks.map((p) => `${p.use} ${p.token}`)).toEqual([
      'text text-accent',
      'background bg-accent',
      'border border-accent',
    ])
    // No exact token: a name for a new one, from the system's own gray ramp.
    const off = await ask({ id: 5, kind: 'find', text: 'background: #e9eef5', context: {} })
    expect(off.ok && off.kind === 'find' && off.answer?.suggestion?.name).toBe('gray-150')
    const gray = o.traps.find((x) => x.value === '#f1f5f9')!
    expect(gray.picks.map((p) => `${p.state} ${p.token}`)).toEqual(['hover bg-hover', 'disabled bg-disabled'])
  })

  it('checks a project against the system: what to replace, what tokens are missing, misspelled variables', async () => {
    const ask = session()
    await ask({ id: 1, kind: 'open', source: { kind: 'files', files: LOOKUP_EXAMPLE }, include: '' })
    const files = [
      {
        path: 'src/Card.css',
        text: '.card {\n  background: #ffffff;\n  color: #0f172a;\n  padding: 16px;\n  border: 1px solid #e2e8f0;\n}\n.card:hover { background: #f1f5f9; }\n.note { color: #2563eb; background: #ede9fe; }\n.tip { background: #ede9fe; color: var(--text-defualt); }\n',
      },
      { path: 'src/Badge.tsx', text: '<span className="bg-[#ede9fe] text-[#0f172a] p-[16px]" />' },
    ]
    const r = await ask({ id: 2, kind: 'project', input: { kind: 'files', files } })
    if (!r.ok || r.kind !== 'project') throw new Error(r.ok ? 'wrong kind' : r.error)
    const p = r.project
    expect(p.files).toBe(2)
    expect(p.coverage.fromTokens).toBe(0)
    const rows = p.replace.map((x) => `${x.value} → ${x.replacement} ×${x.count}`)
    // The declaration and the class are different edits: one row each.
    expect(rows).toContain('#0f172a → var(--text-default) ×1')
    expect(rows).toContain('#0f172a → text-(--text-default) ×1')
    expect(rows).toContain('#f1f5f9 → var(--bg-hover) ×1')
    expect(rows).toContain('#2563eb → var(--text-accent) ×1')
    const violet = p.missing.find((x) => x.value === '#ede9fe')!
    expect(violet).toMatchObject({ count: 3, files: 2, exact: false })
    expect(violet.group).toBeTruthy()
    expect(p.variables).toEqual([
      expect.objectContaining({
        name: '--text-defualt',
        kind: 'unknown',
        suggestion: '--text-default',
        count: 1,
      }),
    ])
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
      '/tools/fix',
      {
        source: { kind: 'npm', pkg: '@scope/tokens', version: '1.2.0' },
        include: '',
        context: { theme: 'dark' },
        query: '#fff',
        token: 'color.text',
      },
      'd=abc',
    )
    expect(url).toBe('/tools/fix?pkg=@scope/tokens&v=1.2.0&ctx=theme:dark&q=%23fff#t=color.text&d=abc')
    expect(readLookupUrl(new URL(url, 'https://x.test'))).toEqual({
      source: { kind: 'npm', pkg: '@scope/tokens', version: '1.2.0' },
      include: '',
      context: { theme: 'dark' },
      query: '#fff',
      token: 'color.text',
    })
  })
})
