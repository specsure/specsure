import { DsGraph, scan, VarMatcher } from '@dsgraph/core'
import { MemorySource } from '@dsgraph/sources'
import { describe, expect, it } from 'vitest'
import { cssTokens, literalsIn, scanStyles, varsIn } from '../src/index.js'

const project = new MemorySource({
  'src/button.module.css': `
.button {
  color: var(--color-text);
  background: var(--color-accent, #2563eb);
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 2px rgb(0 0 0 / 8%);
}
.button:hover { background: color-mix(in oklch, var(--color-accent), black 10%); }
`,
  'src/card.scss': `
$card-bg: #ffffff;
.card {
  background: $card-bg;
  margin: -16px 0 calc(24px + var(--space-sm));
  color: red;
  font: 14px/1.5 Inter, sans-serif;
  &__title { font-size: 1.25rem; color: var(--ds-color-text); }
}
`,
  'src/broken.css': '.x { color: ',
  'node_modules/lib/x.css': '.y { color: #000; }',
  'dist/app.css': '.z { color: #000; }',
})

describe('scanStyles', () => {
  it('finds var() uses with property, selector, fallback and position', async () => {
    const index = await scanStyles(project)
    expect(index.files).toEqual(['src/button.module.css', 'src/card.scss'])
    expect(index.skipped.map((s) => s.file)).toEqual(['src/broken.css'])
    const uses = index.uses.map(
      (u) => `${u.file}:${u.line} ${u.property} ${u.name}${u.fallback ? ` ?? ${u.fallback}` : ''}`,
    )
    expect(uses).toEqual([
      'src/button.module.css:3 color --color-text',
      'src/button.module.css:4 background --color-accent ?? #2563eb',
      'src/button.module.css:10 background --color-accent',
      'src/card.scss:5 margin --space-sm',
      'src/card.scss:8 color --ds-color-text',
    ])
    expect(index.uses[0]).toMatchObject({ selector: '.button', column: 3 })
  })

  it('reports colors and scale values written by hand, not definitions or fallbacks', async () => {
    const index = await scanStyles(project)
    const literals = index.literals.map((l) => `${l.file}:${l.line} ${l.property} ${l.type} ${l.text}`)
    expect(literals).toEqual([
      'src/button.module.css:5 padding dimension 8px',
      'src/button.module.css:5 padding dimension 12px',
      'src/button.module.css:6 border-radius dimension 6px',
      'src/button.module.css:7 border color #e5e7eb',
      'src/button.module.css:8 box-shadow color rgb(0 0 0 / 8%)',
      'src/card.scss:5 margin dimension -16px',
      'src/card.scss:5 margin dimension 24px',
      'src/card.scss:6 color color red',
      'src/card.scss:8 font-size dimension 1.25rem',
    ])
    // A negative margin is the same step of the scale.
    expect(index.literals.find((l) => l.text === '-16px')?.value).toEqual({ value: 16, unit: 'px' })
  })

  it('resolves nested selectors, so states and components are seen', async () => {
    const index = await scanStyles(
      new MemorySource({
        'src/button.scss': `
.button, .link {
  color: #111;
  &:hover { color: #222; }
  .icon { color: #333; }
  @media (min-width: 40em) { &--large:focus { color: #444; } }
}
`,
      }),
    )
    expect(index.literals.map((l) => `${l.text} ${l.selector}`)).toEqual([
      '#111 .button, .link',
      '#222 .button:hover, .link:hover',
      '#333 .button .icon, .link .icon',
      '#444 .button--large:focus, .link--large:focus',
    ])
  })

  it('keeps alpha inside gradients and skips urls', () => {
    expect(
      literalsIn('background', 'linear-gradient(#fff, rgb(0 0 0 / 50%)) , url(a.png)').map((l) => l.text),
    ).toEqual(['#fff', 'rgb(0 0 0 / 50%)'])
    expect(literalsIn('font-family', 'Inter, red')).toEqual([])
    expect(literalsIn('mask', 'linear-gradient(#000, transparent)').map((l) => l.text)).toEqual(['#000'])
  })

  it('reads nested var() with fallbacks', () => {
    expect(varsIn('var(--a, var(--b, 4px)) var(--c)')).toEqual([
      { name: '--a', fallback: 'var(--b, 4px)' },
      { name: '--b', fallback: '4px' },
      { name: '--c' },
    ])
  })
})

describe('VarMatcher', () => {
  const tokens = new MemorySource({
    'tokens.json': JSON.stringify({
      color: { $type: 'color', text: { $value: '#111111' }, accent: { $value: '#2563eb' } },
      space: { $type: 'dimension', sm: { $value: { value: 8, unit: 'px' } } },
    }),
  })

  it('matches DTCG paths by name and learns a prefix from the code', async () => {
    const graph = DsGraph.from(await scan(tokens))
    const names = ['--ds-color-text', '--ds-color-accent', '--ds-space-sm', '--header-height', '--color-text']
    const m = new VarMatcher(graph, names)
    expect(m.prefix).toBe('ds')
    expect(m.token('--ds-color-text')?.id).toBe('color.text')
    expect(m.token('--color-accent')?.id).toBe('color.accent')
    expect(m.token('--header-height')).toBeUndefined()
    // One word does not stand for the end of a path: `text-sm` is not `space.sm`.
    expect(m.tokenOfUse({ name: '--color-sm', candidates: ['--sm', '--text-sm'] })).toBeUndefined()
    expect(m.isSystemName('--ds-color-gone')).toBe(true)
    expect(m.isSystemName('--header-height')).toBe(false)
  })

  it('matches CSS token ids as written, and a configured prefix', async () => {
    const graph = DsGraph.from(
      await scan(
        new MemorySource({ 'tokens.css': ':root { --acme-space-sm: 8px; --color-text: #111; }' }),
        {},
        {
          adapters: [cssTokens],
        },
      ),
    )
    const m = new VarMatcher(graph, [], '--acme-')
    expect(m.token('--acme-space-sm')?.id).toBe('acme-space-sm')
    expect(m.token('--color-text')?.id).toBe('color-text')
    expect(m.isSystemName('--acme-anything')).toBe(true)
  })
})
