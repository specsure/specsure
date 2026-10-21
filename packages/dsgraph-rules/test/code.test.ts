import { buildSnapshot, type CodeIndex, DiagnosticBag, DsGraph, systemFromDocuments } from '@dsgraph/core'
import { describe, expect, it } from 'vitest'
import { check } from '../src/index.js'
import { classFor } from '../src/rules/code.js'

const srgb = (r: number, g: number, b: number) => ({ colorSpace: 'srgb', components: [r, g, b] })
/** Values in a code index are canonical, as tokens hold them. */
const lit = (r: number, g: number, b: number) => ({ space: 'srgb', components: [r, g, b], alpha: 1 })
const px = (value: number) => ({ value, unit: 'px' })

async function system() {
  const tree = {
    color: {
      $type: 'color',
      blue: { 500: { $value: srgb(0.15, 0.39, 0.92) } },
      accent: { $value: '{color.blue.500}' },
      danger: { $value: srgb(0.94, 0.27, 0.27), $deprecated: 'Use {color.critical}' },
      critical: { $value: srgb(0.94, 0.27, 0.27) },
    },
    space: { $type: 'dimension', sm: { $value: px(8) }, md: { $value: px(16) }, lg: { $value: px(24) } },
    radius: { $type: 'dimension', md: { $value: px(6) } },
  }
  const snapshot = await buildSnapshot(systemFromDocuments([{ file: 't.tokens.json', tree }]), {
    diagnostics: new DiagnosticBag(),
  })
  return DsGraph.from(snapshot)
}

const at = (line: number) => ({ file: 'src/app.css', line, column: 3 })
const code: CodeIndex = {
  files: ['src/app.css'],
  skipped: [],
  uses: [
    { ...at(1), name: '--ds-color-accent', property: 'color' },
    { ...at(2), name: '--ds-color-danger', property: 'border-color' },
    { ...at(3), name: '--ds-color-gone', property: 'color', fallback: '#000' },
    { ...at(4), name: '--ds-space-md', property: 'padding' },
    { ...at(5), name: '--header-height', property: 'top' },
  ],
  literals: [
    { ...at(6), property: 'color', text: '#2663eb', type: 'color', value: lit(0.149, 0.388, 0.922) },
    { ...at(7), property: 'background', text: '#ff00ff', type: 'color', value: lit(1, 0, 1) },
    { ...at(8), property: 'padding', text: '24px', type: 'dimension', value: px(24) },
    { ...at(9), property: 'margin', text: '18px', type: 'dimension', value: px(18) },
    { ...at(10), property: 'border-radius', text: '7px', type: 'dimension', value: px(7) },
    { ...at(11), property: 'border-radius', text: '999px', type: 'dimension', value: px(999) },
    {
      file: 'src/legacy/old.css',
      line: 1,
      column: 1,
      property: 'color',
      text: '#ff00ff',
      type: 'color',
      value: lit(1, 0, 1),
    },
  ],
}

const lines = (fs: Awaited<ReturnType<typeof check>>, prefix: string) =>
  fs
    .filter((f) => f.rule.startsWith(prefix))
    .map((f) => `${f.loc?.file}:${f.loc?.line} ${f.severity} ${f.message}`)
    .sort()

describe('the spacing scale', () => {
  it('leaves out font sizes, line heights and borders that carry spacing words', async () => {
    const tree = {
      text: { $type: 'dimension', subtitle: { size: { $value: px(20) } } },
      control: {
        $type: 'dimension',
        medium: { lineBoxHeight: { $value: px(20) }, gap: { $value: px(12) } },
      },
      border: { $type: 'dimension', size: { thick: { $value: px(20) } } },
      stack: { $type: 'dimension', gap: { large: { $value: px(24) } } },
    }
    const graph = DsGraph.from(
      await buildSnapshot(systemFromDocuments([{ file: 't.tokens.json', tree }]), {
        diagnostics: new DiagnosticBag(),
      }),
    )
    const fs = await check(graph, {}, [], {
      code: {
        files: ['a.sass'],
        skipped: [],
        uses: [],
        literals: [{ ...at(1), property: 'margin', text: '20px', type: 'dimension', value: px(20) }],
      },
    })
    expect(
      fs.filter((f) => f.rule === 'style/off-scale').map((f) => (f.evidence as { token: string }).token),
    ).toEqual(['stack.gap.large'])
  })
})

describe('the token for a color written by hand', () => {
  it('is the one made for the property: text for color, background for background, border for border-color', async () => {
    const blue = srgb(0.035, 0.412, 0.855)
    const tree = {
      base: { $type: 'color', blue: { $value: blue } },
      // The control token is a component token with the longest chain: general tokens come first.
      control: { $type: 'color', checked: { borderColor: { $value: '{borderColor.accent}' } } },
      borderColor: { $type: 'color', accent: { $value: '{base.blue}' } },
      fgColor: { $type: 'color', accent: { $value: '{base.blue}' } },
      bgColor: { $type: 'color', accent: { $value: '{base.blue}' } },
    }
    const graph = DsGraph.from(
      await buildSnapshot(systemFromDocuments([{ file: 't.tokens.json', tree }]), {
        diagnostics: new DiagnosticBag(),
      }),
    )
    const value = lit(0.035, 0.412, 0.855)
    const fs = await check(graph, {}, [], {
      code: {
        files: ['a.css'],
        skipped: [],
        uses: [],
        literals: [
          { ...at(1), property: 'color', text: '#0969da', type: 'color', value },
          { ...at(2), property: 'background-color', text: '#0969da', type: 'color', value },
          { ...at(3), property: 'border-color', text: '#0969da', type: 'color', value },
        ],
      },
    })
    expect(
      fs
        .filter((f) => f.rule === 'style/hardcoded-color')
        .map((f) => `${f.loc?.line} ${(f.evidence as { token: string }).token}`)
        .sort(),
    ).toEqual(['1 fgColor.accent', '2 bgColor.accent', '3 borderColor.accent'])
  })

  it("is the one for the state and the component: hover in :hover, the button's own in .button", async () => {
    const blue = srgb(0.035, 0.412, 0.855)
    const tree = {
      base: { $type: 'color', blue: { $value: blue } },
      fgColor: { $type: 'color', accent: { $value: '{base.blue}' } },
      bgColor: { $type: 'color', accent: { $value: '{base.blue}' } },
      control: { $type: 'color', bgColor: { hover: { $value: '{base.blue}' } } },
      button: {
        $type: 'color',
        primary: { bgColor: { rest: { $value: '{base.blue}' }, hover: { $value: '{base.blue}' } } },
      },
    }
    const graph = DsGraph.from(
      await buildSnapshot(systemFromDocuments([{ file: 't.tokens.json', tree }]), {
        diagnostics: new DiagnosticBag(),
      }),
    )
    const value = lit(0.035, 0.412, 0.855)
    const color = { text: '#0969da', type: 'color' as const, value }
    const fs = await check(graph, {}, [], {
      code: {
        files: ['src/card.css', 'src/button.css', 'src/Button.tsx'],
        skipped: [],
        uses: [],
        literals: [
          { file: 'src/card.css', line: 1, column: 1, property: 'background', selector: '.card', ...color },
          {
            file: 'src/card.css',
            line: 2,
            column: 1,
            property: 'background',
            selector: '.card:hover',
            ...color,
          },
          {
            file: 'src/button.css',
            line: 3,
            column: 1,
            property: 'background',
            selector: '.button',
            ...color,
          },
          {
            file: 'src/button.css',
            line: 4,
            column: 1,
            property: 'background',
            selector: '.button:hover',
            ...color,
          },
          {
            file: 'src/button.css',
            line: 5,
            column: 1,
            property: 'background',
            selector: '.button:hover:not(:disabled)',
            ...color,
          },
          {
            file: 'src/button.css',
            line: 6,
            column: 1,
            property: 'color',
            selector: '.button:hover',
            ...color,
          },
          {
            file: 'src/Button.tsx',
            line: 7,
            column: 1,
            property: 'background-color',
            source: 'hover:bg-[#0969da]',
            ...color,
          },
        ],
      },
    })
    expect(
      fs
        .filter((f) => f.rule === 'style/hardcoded-color')
        .map((f) => `${f.loc?.line} ${(f.evidence as { token: string }).token}`)
        .sort(),
    ).toEqual([
      '1 bgColor.accent',
      '2 control.bgColor.hover',
      '3 button.primary.bgColor.rest',
      '4 button.primary.bgColor.hover',
      '5 button.primary.bgColor.hover',
      '6 fgColor.accent',
      '7 button.primary.bgColor.hover',
    ])
  })
})

describe("the code's own variables", () => {
  it('are values written by hand when they do not lead to a token, with alpha counted', async () => {
    const own: CodeIndex = {
      files: ['src/proto.css'],
      skipped: [],
      literals: [],
      uses: [
        {
          ...at(1),
          name: '--sp-accent',
          property: 'color',
          resolved: {
            text: '#2663eb',
            type: 'color',
            value: lit(0.15, 0.39, 0.92),
            via: ['--sp-accent'],
            at: at(9),
          },
        },
        {
          ...at(2),
          name: '--sp-veil',
          property: 'background',
          resolved: {
            text: 'rgba(38, 99, 235, .02)',
            type: 'color',
            value: { ...lit(0.15, 0.39, 0.92), alpha: 0.02 },
            via: ['--sp-veil'],
            at: at(9),
          },
        },
        // A chain through a token of the system is the system's.
        {
          ...at(3),
          name: '--sp-link',
          property: 'color',
          resolved: {
            text: '#2663eb',
            type: 'color',
            value: lit(0.15, 0.39, 0.92),
            via: ['--sp-link', '--ds-color-accent'],
            at: at(9),
          },
        },
        {
          ...at(4),
          name: '--sp-gap',
          property: 'padding',
          resolved: { text: '16px', type: 'dimension', value: px(16), via: ['--sp-gap'], at: at(9) },
        },
      ],
    }
    const fs = await check(await system(), { code: { prefix: '--ds-' } }, [], { code: own })
    expect(lines(fs, 'style/hardcoded-color')).toEqual([
      'src/app.css:1 warning "var(--sp-accent)" is #2663eb in the code\'s own variables (src/app.css:9), not a token; use "color.accent"',
      expect.stringMatching(
        /^src\/app\.css:2 warning "var\(--sp-veil\)" is rgba\(38, 99, 235, \.02\) .*no token has it/,
      ),
    ])
    expect(lines(fs, 'style/off-scale')).toEqual([
      'src/app.css:4 info "var(--sp-gap)" is 16px in the code\'s own variables (src/app.css:9), on the scale; use "space.md"',
    ])
    expect(fs.find((f) => f.rule === 'style/hardcoded-color')?.evidence).toMatchObject({
      variable: '--sp-accent',
      via: ['--sp-accent'],
      definedAt: 'src/app.css:9',
      replacement: 'color.accent',
    })
  })
})

describe('rules on code', () => {
  it('stay silent without code', async () => {
    const fs = await check(await system())
    expect(fs.filter((f) => /^(style|usage)\//.test(f.rule) || f.rule === 'token/unused')).toEqual([])
  })

  it('point colors written by hand to the token, or say they are off the palette', async () => {
    const fs = await check(await system(), {}, [], { code })
    expect(lines(fs, 'style/hardcoded-color')).toEqual([
      'src/app.css:6 warning Color "#2663eb" in color is written by hand; use "color.accent"',
      expect.stringMatching(
        /^src\/app\.css:7 warning Color "#ff00ff" in background is not in the palette; closest is "color\.\w+"/,
      ),
      expect.stringMatching(/^src\/legacy\/old\.css:1 warning/),
    ])
  })

  it('takes spacing and radius from their own scale', async () => {
    const fs = await check(await system(), {}, [], { code })
    expect(lines(fs, 'style/off-scale')).toEqual([
      'src/app.css:10 warning "7px" in border-radius is off the scale; closest is "radius.md" (6px)',
      'src/app.css:8 info "24px" in padding is on the scale; use "space.lg"',
      'src/app.css:9 warning "18px" in margin is off the scale; closest is "space.md" (16px)',
    ])
  })

  it('finds deprecated and unknown design-system variables, learning the prefix', async () => {
    const fs = await check(await system(), {}, [], { code })
    expect(lines(fs, 'usage/')).toEqual([
      'src/app.css:2 warning "--ds-color-danger" is deprecated; use "color.critical"',
      'src/app.css:3 error "--ds-color-gone" is not a token; the fallback "#000" is used instead',
    ])
  })

  it('lists tokens the code does not use, counting what used tokens reference', async () => {
    const fs = await check(await system(), {}, [], { code })
    const unused = fs.filter((f) => f.rule === 'token/unused').map((f) => f.nodes[0])
    expect(unused).toEqual(['color.critical', 'radius.md', 'space.lg', 'space.sm'])
  })

  it('honors exceptions by file and value', async () => {
    const fs = await check(
      await system(),
      {
        rules: {
          'style/hardcoded-color': [
            'warning',
            { exceptions: { files: ['src/legacy/**'], values: ['#FF00FF'] } },
          ],
        },
      },
      [],
      { code },
    )
    expect(lines(fs, 'style/hardcoded-color')).toEqual([
      'src/app.css:6 warning Color "#2663eb" in color is written by hand; use "color.accent"',
    ])
  })
})

describe('classFor', () => {
  it('names the class that replaces an arbitrary value, variants kept', () => {
    expect(classFor('hover:bg-[#2952cc]', { id: 'color-accent', type: 'color' })).toBe('hover:bg-accent')
    expect(classFor('bg-[#0f172a]', { id: 'primary', type: 'color' })).toBe('bg-primary')
    // A plain variable whose name repeats the utility is not in Tailwind's theme: named as a variable.
    expect(classFor('hover:bg-[#1d4ed8]', { id: 'bg-accent-hover', type: 'color' })).toBe(
      'hover:bg-(--bg-accent-hover)',
    )
    expect(classFor('rounded-[6px]', { id: 'radius-md', type: 'dimension' })).toBe('rounded-md')
    expect(classFor('-mt-[16px]', { id: 'space-md', type: 'dimension' })).toBe('-mt-(--space-md)')
    expect(classFor('text-[#111]', { id: 'color.text.primary', type: 'color' })).toBe(
      'text-(--color-text-primary)',
    )
  })
})
