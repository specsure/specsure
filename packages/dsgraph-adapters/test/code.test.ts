import { coverageOf, DsGraph, scan, VarMatcher, varNames } from '@dsgraph/core'
import { MemorySource } from '@dsgraph/sources'
import { describe, expect, it } from 'vitest'
import { classesIn, classItem, cssTokens, looksLikeClasses, scanCode } from '../src/index.js'

const use = (cls: string) => {
  const item = classItem(cls)
  return item?.kind === 'use'
    ? item.names
    : item
      ? `literal ${item.property} ${item.literal.text}`
      : undefined
}

describe('utility classes', () => {
  it('reads token names behind named classes, with variants and opacity dropped', () => {
    expect(use('bg-primary')).toEqual(['--color-primary', '--primary'])
    expect(use('hover:md:bg-primary/90')).toEqual(['--color-primary', '--primary'])
    expect(use('rounded-lg')).toEqual(['--radius-lg'])
    expect(use('font-medium')).toEqual(['--font-medium', '--font-weight-medium'])
    expect(use('p-gutter')).toEqual(['--spacing-gutter', '--space-gutter'])
  })

  it('reads custom properties in brackets and the Tailwind 4 shorthand', () => {
    expect(use('bg-(--brand)')).toEqual(['--brand'])
    expect(use('bg-[var(--brand)]')).toEqual(['--brand'])
    expect(use('mt-(--space-md)')).toEqual(['--space-md'])
  })

  it('reads values written by hand in arbitrary values and properties', () => {
    expect(use('bg-[#3366ff]')).toBe('literal background-color #3366ff')
    expect(use('text-[#fff]')).toBe('literal color #fff')
    expect(use('text-[13px]')).toBe('literal font-size 13px')
    expect(use('-mt-[4px]')).toBe('literal margin-top 4px')
    expect(use('rounded-[7px]')).toBe('literal border-radius 7px')
    expect(use('[color:#222]')).toBe('literal color #222')
    expect(use('bg-[color:rgb(0_0_0_/_50%)]')).toBe('literal background-color rgb(0 0 0 / 50%)')
  })

  it('skips keywords, widths, Tailwind spacing steps and classes it does not know', () => {
    for (const cls of [
      'text-center',
      'bg-cover',
      'border-2',
      'border-solid',
      'p-4',
      'px-2.5',
      'flex',
      'w-[13px]',
      'shadow-none',
    ])
      expect(use(cls)).toBeUndefined()
  })

  it('tells class lists from other strings', () => {
    expect(looksLikeClasses('rounded-[7px] border bg-card p-6')).toBe(true)
    expect(looksLikeClasses('flex items-center gap-2')).toBe(true)
    expect(looksLikeClasses('Save changes')).toBe(false)
    expect(looksLikeClasses('primary')).toBe(false)
    expect(classesIn('px-4 bg-primary text-[15px]').map((c) => c.text)).toEqual(['bg-primary', 'text-[15px]'])
  })
})

const project = new MemorySource({
  'components/ui/button.tsx': `import { cva } from "class-variance-authority"
const buttonVariants = cva("inline-flex rounded-md text-sm", {
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground",
      brand: "bg-[#3366ff] hover:bg-[#2952cc]",
    },
  },
})
export function Button({ active }) {
  return <button className={cn(buttonVariants(), { "ring-ring": active })} />
}`,
  'app/page.tsx': `export default function Page() {
  const card = "rounded-[7px] border bg-card p-6"
  return (
    <main style={{ padding: 13, top: 20, color: '#111827', background: 'var(--background)' }}>
      <div className={card}>Don't panic</div>
    </main>
  )
}`,
  'components/card.styled.ts':
    "import styled from 'styled-components'\nexport const Card = styled.div`\n  color: ${(p) => p.color};\n  background: #fafafa;\n  &:hover { background: var(--color-bg-hover); }\n`",
  'src/App.vue': `<template>
  <div class="p-4 bg-[#ff0000]" :class="{ 'text-primary': active }" style="margin: 18px">
    <span :style="{ color: '#222' }">x</span>
  </div>
</template>
<script setup lang="ts">
const accent = 'var(--color-accent)'
</script>
<style scoped lang="scss">
.x { color: #333; }
</style>`,
  'src/pages/index.astro':
    '---\nconst title = "Hi"\n---\n<h1 class="text-brand text-[22px]" style="color: #444">{title}</h1>\n',
  'src/Badge.svelte': '<span class={active ? "bg-primary" : "bg-[#eee]"}>x</span>\n',
  'tailwind.config.ts': "export default { theme: { colors: { primary: '#3366ff' } } }",
  'src/broken.tsx': 'export const x = <div className="a" ',
})

describe('scanCode', () => {
  it('reads scripts, CSS-in-JS and markup, and skips config files', async () => {
    const index = await scanCode(project)
    expect(index.files).toEqual([
      'app/page.tsx',
      'components/card.styled.ts',
      'components/ui/button.tsx',
      'src/App.vue',
      'src/Badge.svelte',
      'src/pages/index.astro',
    ])
    expect(index.skipped.map((s) => s.file)).toEqual(['src/broken.tsx'])
  })

  it('finds uses: classes, var() in style objects, CSS-in-JS, Vue scripts and bound classes', async () => {
    const index = await scanCode(project)
    const uses = index.uses.map((u) => `${u.file}:${u.line} ${u.text ?? u.name}`)
    expect(uses).toEqual(
      expect.arrayContaining([
        'components/ui/button.tsx:2 rounded-md',
        'components/ui/button.tsx:5 bg-primary',
        'components/ui/button.tsx:5 text-primary-foreground',
        'components/ui/button.tsx:11 ring-ring',
        'app/page.tsx:2 bg-card',
        'app/page.tsx:4 --background',
        'components/card.styled.ts:5 --color-bg-hover',
        'src/App.vue:2 text-primary',
        'src/App.vue:7 --color-accent',
        'src/Badge.svelte:1 bg-primary',
        'src/pages/index.astro:4 text-brand',
      ]),
    )
  })

  it('finds values written by hand everywhere, positions in style objects left out', async () => {
    const index = await scanCode(project)
    const literals = index.literals.map(
      (l) => `${l.file}:${l.line} ${l.property} ${l.text}${l.source ? ` (${l.source})` : ''}`,
    )
    expect(literals.sort()).toEqual(
      [
        'app/page.tsx:2 border-radius 7px (rounded-[7px])',
        'app/page.tsx:4 padding 13px',
        'app/page.tsx:4 color #111827',
        'components/card.styled.ts:4 background #fafafa',
        'components/ui/button.tsx:6 background-color #3366ff (bg-[#3366ff])',
        'components/ui/button.tsx:6 background-color #2952cc (hover:bg-[#2952cc])',
        'src/App.vue:2 background-color #ff0000 (bg-[#ff0000])',
        'src/App.vue:2 margin 18px',
        'src/App.vue:3 color #222',
        'src/App.vue:10 color #333',
        'src/Badge.svelte:1 background-color #eee (bg-[#eee])',
        'src/pages/index.astro:4 font-size 22px (text-[22px])',
        'src/pages/index.astro:4 color #444',
      ].sort(),
    )
  })
})

describe('Tailwind themes as tokens', () => {
  const graphOf = async (css: string) =>
    DsGraph.from(await scan(new MemorySource({ 'app/globals.css': css }), {}, { adapters: [cssTokens] }))

  it('reads @theme as the base theme, with :root and .dark around it', async () => {
    const g = await graphOf(`:root { --primary: oklch(0.205 0 0); }
.dark { --primary: oklch(0.922 0 0); }
@theme inline { --color-primary: var(--primary); }
@theme { --color-brand: #3366ff; --spacing-gutter: 24px; }`)
    expect(g.modifiers.map((m) => m.name)).toEqual(['theme'])
    expect(g.tokens().map((t) => `${t.id}:${t.type}`)).toEqual([
      'color-brand:color',
      'color-primary:color',
      'primary:color',
      'spacing-gutter:dimension',
    ])
    expect(g.value('color-primary', { theme: 'dark' })).toMatchObject({
      space: 'oklch',
      components: [0.922, 0, 0],
    })
  })

  it('reads bare HSL channels as colors', async () => {
    const g = await graphOf(
      '@layer base { :root { --primary: 222.2 47.4% 11.2%; --ring: 215 20.2% 65.1% / 50%; } }',
    )
    expect(g.tokens().map((t) => `${t.id}:${t.type}`)).toEqual(['primary:color', 'ring:color'])
  })

  it('counts how much of the code is on tokens', async () => {
    const g = await graphOf('@theme { --color-primary: #3366ff; --color-card: #ffffff; --radius-md: 6px; }')
    const index = await scanCode(project)
    const c = coverageOf(index, new VarMatcher(g, varNames(index)))
    expect(c.fromTokens).toBe(
      index.uses.filter((u) => /^(bg-primary|bg-card|rounded-md|text-primary)$/.test(u.text ?? '')).length,
    )
    expect(c.byHand).toBe(13)
    expect(c.share).toBeGreaterThan(0)
  })
})
