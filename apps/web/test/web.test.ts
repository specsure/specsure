import { groupFindings } from '@dsgraph/report'
import { describe, expect, it } from 'vitest'
import { defaultVersions } from '../src/components/SidePicker'
import { compare, configFor } from '../src/lib/compare'
import { EXAMPLE, EXAMPLE_APP, LEGACY_EXAMPLE } from '../src/lib/example'
import { codeFromInput, filesFromInput } from '../src/lib/files'
import { packFiles, readUrl, unpackFiles, writeUrl } from '../src/lib/url'
import { colorPairs, contextAxes, inContext, view } from '../src/lib/view'

describe('compare', () => {
  it('diffs the example: removal, rename, theme-only change, checks on the head', async () => {
    const r = await compare({
      id: 1,
      base: { kind: 'files', files: EXAMPLE.base },
      head: { kind: 'files', files: EXAMPLE.head },
      include: '',
    })
    if (!r.ok) throw new Error(r.error)
    expect(r.changeset.summary.level).toBe('major')
    const kinds = r.changeset.changes.map((c) => `${c.kind} ${c.target}`)
    expect(kinds).toContain('token.removed color-danger')
    expect(kinds).toContain('token.renamed space-small')
    expect(r.base.files).toEqual(['tokens.css'])
    expect(r.head.modifiers).toEqual([{ name: 'theme', contexts: ['default', 'dark'] }])
    expect(contextAxes(r.changeset)).toEqual([{ name: 'theme', values: ['default', 'dark'] }])
    expect(colorPairs(r.changeset).map((p) => p.target)).toContain('color-blue-500')

    const types = new Map(r.types)
    const filter = { levels: ['major', 'minor', 'patch', 'none'] as const, types: [], query: '' }
    const dark = view(r.changeset, types, {
      ...filter,
      levels: [...filter.levels],
      context: { theme: 'dark' },
    })
    const light = view(r.changeset, types, {
      ...filter,
      levels: [...filter.levels],
      context: { theme: 'default' },
    })
    expect(dark.shown.map((c) => c.target)).toContain('color-accent')
    expect(light.shown.map((c) => c.target)).not.toContain('color-accent')
  })

  it('reads dropped token-set files with their themes', async () => {
    const files = (accent: string) => [
      {
        path: '$themes.json',
        text: JSON.stringify([
          { name: 'Light', group: 'Mode', selectedTokenSets: { core: 'source', light: 'enabled' } },
          { name: 'Dark', group: 'Mode', selectedTokenSets: { core: 'source', dark: 'enabled' } },
        ]),
      },
      {
        path: 'core.json',
        text: JSON.stringify({
          blue: { value: accent, type: 'color' },
          ink: { value: '#111111', type: 'color' },
        }),
      },
      { path: 'light.json', text: JSON.stringify({ accent: { value: '{blue}', type: 'color' } }) },
      { path: 'dark.json', text: JSON.stringify({ accent: { value: '{ink}', type: 'color' } }) },
    ]
    const r = await compare({
      id: 3,
      base: { kind: 'files', files: files('#3366ff') },
      head: { kind: 'files', files: files('#2255ee') },
      include: '',
    })
    if (!r.ok) throw new Error(r.error)
    expect(r.head.modifiers).toEqual([{ name: 'Mode', contexts: ['Light', 'Dark'] }])
    const accent = r.changeset.changes.filter((c) => c.target === 'accent')
    expect(accent.map((c) => c.when)).toEqual([{ Mode: 'Light' }])
  })

  it('names the side that failed', async () => {
    const r = await compare({
      id: 2,
      base: { kind: 'files', files: EXAMPLE.base },
      head: { kind: 'files', files: [] },
      include: '',
    })
    expect(r).toMatchObject({ ok: false, side: 'head' })
  })

  it('skips package.json and other config files from a dropped project', async () => {
    const files = [
      { path: 'package.json', text: JSON.stringify({ name: 'x', scripts: { build: 'tsc' } }) },
      { path: 'tsconfig.json', text: JSON.stringify({ compilerOptions: { strict: true } }) },
      {
        path: 'resolver.json',
        text: JSON.stringify({ version: '2025.10', resolutionOrder: [{ $ref: '#/sets/base' }] }),
      },
      {
        path: 'tokens.json',
        text: JSON.stringify({ color: { $type: 'color', red: { $value: '#ff0000' } } }),
      },
    ]
    const r = await compare({
      id: 3,
      base: { kind: 'files', files },
      head: { kind: 'files', files },
      include: '',
    })
    if (!r.ok) throw new Error(r.error)
    expect(r.head.files).toEqual(['tokens.json'])
    expect(r.findings.filter((f) => f.severity === 'error' || f.rule === 'dtcg/invalid-node')).toEqual([])
  })

  it('checks the code of a project against the comparison', async () => {
    const r = await compare({
      id: 4,
      base: { kind: 'files', files: EXAMPLE.base },
      head: { kind: 'files', files: EXAMPLE.head },
      include: '',
      code: EXAMPLE_APP,
    })
    if (!r.ok) throw new Error(r.error)
    const code = r.code!
    expect(code.files).toBe(4)
    expect(code.coverage).toMatchObject({ fromTokens: 12, byHand: 6 })
    expect(code.impact.breaks).toBe(2)
    const breaks = code.impact.changes
      .filter((c) => c.effect === 'breaks')
      .map((c) => `${c.kind} ${c.sites.map((s) => s.text).join(' ')}`)
    expect(breaks).toEqual(['token.removed bg-danger', 'token.renamed p-(--space-sm)'])
    const hand = code.findings.map((f) => (f.evidence as { replacement: string }).replacement)
    expect(hand).toContain('bg-accent')
    expect(hand).toContain('rounded-md')
  })

  it('leaves the code out unless it is given', async () => {
    const r = await compare({
      id: 5,
      base: { kind: 'files', files: EXAMPLE.base },
      head: { kind: 'files', files: EXAMPLE.head },
      include: '',
    })
    expect(r.ok && r.code).toBeUndefined()
  })

  it('splits file globs between DTCG and CSS', () => {
    expect(configFor('dist/tokens.css, tokens/**/*.json')).toEqual({
      tokens: { include: ['tokens/**/*.json'] },
      css: { include: ['dist/tokens.css'] },
    })
    expect(configFor('')).toEqual({})
  })
})

describe('guide figures', () => {
  // The captions in guide.mdx describe these results; keep them true.
  it('finds legacy strings and a broken reference in the checks example, grouped', async () => {
    const side = { kind: 'files' as const, files: LEGACY_EXAMPLE }
    const r = await compare({ id: 3, base: side, head: side, include: '' })
    if (!r.ok) throw new Error(r.error)
    const groups = groupFindings(r.findings).map((g) => [g.rule, g.findings.length])
    expect(groups).toContainEqual(['dtcg/unknown-reference', 1])
    expect(groups).toContainEqual(['dtcg/legacy-syntax', 5])
    expect(groups).toContainEqual(['dtcg/legacy-syntax', 3])
  })

  it('the graph figure: color-blue-500 holds its own value and color-accent uses it', async () => {
    const r = await compare({
      id: 4,
      base: { kind: 'files', files: EXAMPLE.base },
      head: { kind: 'files', files: EXAMPLE.head },
      include: '',
    })
    if (!r.ok) throw new Error(r.error)
    const refs = r.graph.head.refs
    expect(refs.some(([from]) => from === 'color-blue-500')).toBe(false)
    expect(refs.some(([from, to]) => from === 'color-accent' && to === 'color-blue-500')).toBe(true)
  })

  it('the example has color-accent changed only in dark and through color-blue-500 elsewhere', async () => {
    const r = await compare({
      id: 4,
      base: { kind: 'files', files: EXAMPLE.base },
      head: { kind: 'files', files: EXAMPLE.head },
      include: '',
    })
    if (!r.ok) throw new Error(r.error)
    const direct = r.changeset.changes.filter((c) => c.target === 'color-accent' && c.origin === 'direct')
    expect(direct.map((c) => c.when)).toEqual([{ theme: 'dark' }])
    const blue = r.changeset.changes.find((c) => c.target === 'color-blue-500')!
    expect(r.changeset.changes.some((c) => c.target === 'color-accent' && c.cause.includes(blue.id))).toBe(
      true,
    )
  })
})

describe('files', () => {
  const list = (paths: string[]) =>
    paths.map((p) => ({
      name: p.split('/').at(-1),
      webkitRelativePath: p,
      size: 2,
      text: async () => '{}',
    })) as unknown as FileList

  it('leaves out build output next to token sources', async () => {
    const files = await filesFromInput(list(['pkg/tokens/a.json', 'pkg/dist/tokens.css', 'pkg/package.json']))
    expect(files.map((f) => f.path)).toEqual(['tokens/a.json', 'package.json'])
  })

  it('keeps build output when nothing else has tokens: a package, or dist itself', async () => {
    expect(
      (await filesFromInput(list(['pkg/dist/tokens.css', 'pkg/package.json']))).map((f) => f.path),
    ).toEqual(['dist/tokens.css', 'package.json'])
    expect((await filesFromInput(list(['dist/a.css', 'dist/b.css']))).map((f) => f.path)).toEqual([
      'a.css',
      'b.css',
    ])
  })
})

describe('code files', () => {
  const list = (paths: string[]) =>
    paths.map((p) => ({
      name: p.split('/').at(-1),
      webkitRelativePath: p,
      size: 2,
      text: async () => '',
    })) as unknown as FileList

  it('reads styles, scripts and markup, and skips dependencies and build output', async () => {
    const files = await codeFromInput(
      list([
        'app/src/Button.tsx',
        'app/src/theme.css',
        'app/src/App.vue',
        'app/README.md',
        'app/node_modules/x/index.js',
        'app/dist/bundle.js',
        'app/.next/server/page.js',
      ]),
    )
    expect(files.map((f) => f.path)).toEqual(['src/Button.tsx', 'src/theme.css', 'src/App.vue'])
  })
})

describe('view', () => {
  it('keeps changes that apply to every context or to the selected one', () => {
    expect(inContext(null, { theme: 'dark' })).toBe(true)
    expect(inContext({ theme: 'dark' }, { theme: 'dark' })).toBe(true)
    expect(inContext({ theme: 'light' }, { theme: 'dark' })).toBe(false)
    expect(inContext({ theme: 'light' }, {})).toBe(true)
  })
})

describe('url', () => {
  it('uses pkg/from/to for two versions of one package', () => {
    const url = writeUrl(
      '/tools/diff',
      {
        base: { kind: 'npm', pkg: '@acme/tokens', version: '1.0.0' },
        head: { kind: 'npm', pkg: '@acme/tokens', version: '2.0.0' },
        include: '',
        context: { theme: 'dark' },
      },
      '',
    )
    expect(url).toBe('/tools/diff?pkg=@acme/tokens&from=1.0.0&to=2.0.0&ctx=theme:dark')
    const back = readUrl(new URL(url, 'https://specsure.vercel.app'))
    expect(back.base).toEqual({ kind: 'npm', pkg: '@acme/tokens', version: '1.0.0' })
    expect(back.context).toEqual({ theme: 'dark' })
  })

  it('writes base/head specs for mixed sources and round-trips files through the fragment', async () => {
    const url = writeUrl('/d', {
      base: { kind: 'github', repo: 'acme/ds', root: 'tokens', ref: 'v1' },
      head: { kind: 'npm', pkg: 'acme-tokens', version: '2.0.0' },
      include: 'dist/*.css',
      context: {},
    })
    expect(url).toBe('/d?base=github:acme/ds/tokens@v1&head=npm:acme-tokens@2.0.0&files=dist/*.css')
    const frag = await packFiles({ base: EXAMPLE.base })
    expect(await unpackFiles(`#${frag}`)).toEqual({ base: EXAMPLE.base })
  })
})

describe('versions', () => {
  it('defaults to the latest release and the stable one before it', () => {
    expect(
      defaultVersions({ versions: ['3.0.0-beta.1', '2.1.0', '2.0.1', '2.0.0'], tags: { latest: '2.1.0' } }),
    ).toEqual({ base: '2.0.1', head: '2.1.0' })
    expect(defaultVersions({ versions: ['1.0.0'], tags: { latest: '1.0.0' } })).toEqual({
      base: '1.0.0',
      head: '1.0.0',
    })
  })
})
