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
    // The example's layers, read from its references: nothing in the file names them.
    expect(o.layers.by).toBe('references')
    expect(o.layers.layers.map((x) => `${x.layer} ${x.total}`)).toEqual([
      'palette 16',
      'semantic 19',
      'component 4',
      'value 10',
    ])
    expect(o.layers.crossings).toEqual([])
    const card = await ask({ id: 6, kind: 'token', token: 'card-bg' })
    expect(card.ok && card.kind === 'token' && card.card?.layer).toEqual({
      layer: 'component',
      by: 'references',
    })
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

  it("keeps the app's repository in the address, never a folder", () => {
    const url = writeLookupUrl('/tools/fix', {
      source: { kind: 'npm', pkg: '@scope/tokens', version: '1.2.0' },
      include: '',
      context: {},
      query: '',
      code: { kind: 'github', repo: 'acme/app', root: 'src', ref: 'main' },
    })
    expect(url).toBe('/tools/fix?pkg=@scope/tokens&v=1.2.0&code=github:acme/app/src@main')
    expect(readLookupUrl(new URL(url, 'https://x.test')).code).toEqual({
      kind: 'github',
      repo: 'acme/app',
      root: 'src',
      ref: 'main',
    })
  })

  it("takes Tailwind's own palette for colors written by hand, when the system has no such token", async () => {
    const ask = session()
    await ask({ id: 1, kind: 'open', source: { kind: 'files', files: LOOKUP_EXAMPLE }, include: '' })
    const files = [
      { path: 'package.json', text: JSON.stringify({ devDependencies: { tailwindcss: '^3.4.0' } }) },
      // `bg-blue-600` is the system's own `--blue-600`; `bg-white` and `text-sky-500` are Tailwind's.
      { path: 'src/Tip.tsx', text: '<p className="bg-white text-sky-500 border-blue-600" />\n' },
    ]
    // Pasted code has no package.json: Tailwind 4's colors, the same white.
    const pasted = await ask({ id: 3, kind: 'snippet', text: '<p className="bg-white" />' })
    expect(pasted.ok && pasted.kind === 'snippet' && pasted.snippet.output).toBe(
      '<p className="bg-(--bg-default)" />',
    )
    const r = await ask({ id: 2, kind: 'project', input: { kind: 'files', files } })
    if (!r.ok || r.kind !== 'project') throw new Error(r.ok ? 'wrong kind' : r.error)
    expect(r.project.replace.map((x) => `${x.value} → ${x.replacement}`)).toEqual([
      '#fff → bg-(--bg-default)',
    ])
    expect(r.project.missing.map((x) => x.value)).toEqual(['#0ea5e9'])
    expect(r.project.coverage).toMatchObject({ fromTokens: 1, byHand: 2 })
    expect(r.project.variables).toEqual([])
  })

  it("puts the code's own variables on the system's tokens, with a layer to translate them", async () => {
    const ask = session()
    await ask({ id: 1, kind: 'open', source: { kind: 'files', files: LOOKUP_EXAMPLE }, include: '' })
    const files = [
      // A prototype on a library of its own: its variables, and a page that uses them.
      {
        path: 'lib/sp.css',
        text: ':root{--sp-ink:#0f172a;--sp-paper:var(--sp-white);--sp-white:#ffffff;--sp-pad:16px;--sp-odd:#ede9fe}',
      },
      {
        path: 'src/Card.css',
        text: '.card{color:var(--sp-ink);background:var(--sp-paper);padding:var(--sp-pad)}\n.tag{background:var(--sp-odd)}\n',
      },
    ]
    const r = await ask({ id: 2, kind: 'project', input: { kind: 'files', files } })
    if (!r.ok || r.kind !== 'project') throw new Error(r.ok ? 'wrong kind' : r.error)
    expect(
      r.project.own.map((o) => `${o.variable} ${o.value} → ${o.replacement}${o.exact ? '' : ' ?'}`),
    ).toEqual([
      '--sp-ink #0f172a → var(--text-default)',
      expect.stringMatching(/^--sp-odd #ede9fe → var\(--[\w-]+\) \?$/),
      '--sp-pad 16px → var(--space-4)',
      // In `.card`: the card's own token, not the page's background.
      '--sp-paper #ffffff → var(--card-bg)',
    ])
    expect(r.project.replace).toEqual([])
    expect(r.project.coverage).toMatchObject({ fromTokens: 0, byHand: 4 })
    // Pasted with its own variables, the code comes back on the system's.
    const pasted = await ask({
      id: 3,
      kind: 'snippet',
      text: ':root { --sp-ink: #0f172a; }\n.card { color: var(--sp-ink); }',
    })
    expect(pasted.ok && pasted.kind === 'snippet' && pasted.snippet.output).toContain(
      'color: var(--text-default)',
    )
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
