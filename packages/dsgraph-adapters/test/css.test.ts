import { DsGraph, diff, scan } from '@dsgraph/core'
import { MemorySource } from '@dsgraph/sources'
import { describe, expect, it } from 'vitest'
import { conditionName, cssTokens, cssValueToToken } from '../src/index.js'

const css = `
:root {
  --color-ink: #1c1c1a;
  --color-paper: oklch(1 0 0);
  --color-text: var(--color-ink);
  --space-2: 8px;
  --space-4: 1rem;
  --radius-pill: 999px;
  --font-sans: "Inter", system-ui, sans-serif;
  --font-weight-medium: 500;
  --duration-fast: 120ms;
  --ease-out: cubic-bezier(0, 0, 0.58, 1);
  --shadow-raised: 0 1px 2px rgb(0 0 0 / 0.1), 0 4px 8px var(--color-ink);
  --gap-wide: calc(var(--space-4) * 2);
  --line-height: 1.5;
}
[data-theme="dark"] {
  --color-ink: #f3f2f0;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --color-paper: #121417; }
}
@media (min-width: 768px) {
  :root { --space-4: 1.25rem; }
}
.button { --button-pad: 12px; }
`

async function scanCss(text: string, config = {}) {
  const snapshot = await scan(new MemorySource({ 'tokens.css': text }), config, { adapters: [cssTokens] })
  return { snapshot, graph: DsGraph.from(snapshot), codes: snapshot.diagnostics.map((d) => d.code) }
}

describe('tokens-css: condition names', () => {
  it('names media and supports conditions briefly', () => {
    expect(conditionName('@media (min-width: 768px)')).toBe('min-width: 768px')
    expect(conditionName('@supports (color: color(display-p3 1 1 1))')).toBe('display-p3')
    expect(conditionName('@media (prefers-reduced-motion: reduce)')).toBe('reduced-motion')
    expect(conditionName('@supports (display: grid)')).toBe('supports display: grid')
  })
})

describe('tokens-css: compound theme selectors', () => {
  it('reads a theme from several attributes, with the auto mode under prefers-color-scheme', async () => {
    const text = `
[data-color-mode="light"][data-light-theme="light"],
[data-color-mode="light"][data-light-theme="light"] ::backdrop { --bg: #ffffff; }
[data-color-mode="dark"][data-dark-theme="dark_dimmed"] { --bg: #22272e; }
@media (prefers-color-scheme: dark) {
  [data-color-mode][data-color-mode="auto"][data-dark-theme="dark_dimmed"] { --bg: #22272e; }
}`
    const { snapshot, graph } = await scanCss(text)
    expect(snapshot.contexts.modifiers).toEqual([
      { name: 'theme', contexts: ['light', 'dark_dimmed'], default: 'light' },
    ])
    expect(graph.value('bg', { theme: 'dark_dimmed' })).toMatchObject({ hex: '#22272e' })
  })
})

describe('tokens-css: types', () => {
  it('infers types from values and names', () => {
    expect(cssValueToToken('--a', '#fff').$type).toBe('color')
    expect(cssValueToToken('--a', '12px')).toEqual({ $type: 'dimension', $value: { value: 12, unit: 'px' } })
    expect(cssValueToToken('--a', '1.5em')).toEqual({
      $type: 'dimension',
      $value: { value: 1.5, unit: 'em' },
    })
    expect(cssValueToToken('--font-weight-bold', '700').$type).toBe('fontWeight')
    expect(cssValueToToken('--opacity', '0.5').$type).toBe('number')
    expect(cssValueToToken('--space-0', '0')).toEqual({
      $type: 'dimension',
      $value: { value: 0, unit: 'px' },
    })
    expect(cssValueToToken('--ease', 'ease-in-out')).toEqual({
      $type: 'cubicBezier',
      $value: [0.42, 0, 0.58, 1],
    })
    expect(cssValueToToken('--font-mono', 'JetBrains Mono, monospace')).toEqual({
      $type: 'fontFamily',
      $value: ['JetBrains Mono', 'monospace'],
    })
    expect(cssValueToToken('--a', 'var(--b)')).toEqual({ $value: '{b}' })
    expect(cssValueToToken('--a', 'color-mix(in oklch, red, blue)').$type).toBe('css-expression')
  })
})

describe('tokens-css: scan', () => {
  it('builds a base set and theme / media modifiers', async () => {
    const { graph, snapshot } = await scanCss(css)
    expect(snapshot.contexts.modifiers).toEqual([
      { name: 'theme', contexts: ['default', 'dark'], default: 'default' },
      { name: 'min-width: 768px', contexts: ['off', 'on'], default: 'off' },
    ])
    expect(graph.token('color-ink')?.typeSource).toBe('inferred')
    expect(graph.value('space-4', { 'min-width: 768px': 'on' })).toEqual({
      value: 1.25,
      unit: 'rem',
    })
  })

  it('merges [data-theme] and prefers-color-scheme into one theme modifier', async () => {
    const { graph } = await scanCss(css)
    expect(graph.value('color-ink', { theme: 'dark' })).toMatchObject({ hex: '#f3f2f0' })
    expect(graph.value('color-paper', { theme: 'dark' })).toMatchObject({ hex: '#121417' })
    expect(graph.value('color-text', { theme: 'dark' })).toMatchObject({ hex: '#f3f2f0' })
  })

  it('keeps aliases, composites and expressions with their references', async () => {
    const { graph } = await scanCss(css)
    expect(graph.chain('color-text')).toEqual(['color-text', 'color-ink'])
    expect(graph.token('color-text')?.type).toBe('color')
    const shadow = graph.value('shadow-raised') as Array<{ blur: unknown }>
    expect(shadow).toHaveLength(2)
    expect(graph.dependencies('shadow-raised')).toEqual(['color-ink'])
    expect(graph.value('gap-wide')).toBe('calc(var(--space-4) * 2)')
    expect(graph.dependencies('gap-wide')).toEqual(['space-4'])
  })

  it('ignores scoped variables with an info diagnostic and accepts non-standard units silently', async () => {
    const { graph, codes } = await scanCss(css)
    expect(graph.token('button-pad')).toBeUndefined()
    expect(codes).toContain('css/scoped-variable')
    expect(codes).not.toContain('dtcg/invalid-unit')
    expect(codes).not.toContain('dtcg/unknown-type')
  })

  it('uses configured contexts', async () => {
    const { snapshot, graph } = await scanCss(
      ':root { --c: #fff } .theme-ocean { --c: #024 } .theme-sand { --c: #ec9 }',
      {
        css: { contexts: { brand: { default: [':root'], ocean: ['.theme-ocean'], sand: ['.theme-sand'] } } },
      },
    )
    expect(snapshot.contexts.modifiers).toEqual([
      { name: 'brand', contexts: ['default', 'ocean', 'sand'], default: 'default' },
    ])
    expect(graph.value('c', { brand: 'sand' })).toMatchObject({ hex: '#eecc99' })
  })

  it('diffs two versions of a CSS token file', async () => {
    const a = await scanCss(':root { --brand: #2f5bff; --text: var(--brand); --space-sm: 8px }')
    const b = await scanCss(':root { --brand: #3366ff; --text: var(--brand); --space-small: 8px }')
    const cs = await diff(a.graph, b.graph)
    expect(cs.changes.map((c) => [c.kind, c.target, c.origin])).toEqual([
      ['token.renamed', 'space-small', 'direct'],
      ['token.value-changed', 'brand', 'direct'],
      ['token.value-changed', 'text', 'propagated'],
    ])
  })
})
