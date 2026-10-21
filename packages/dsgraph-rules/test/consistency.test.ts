import { cssTokens } from '@dsgraph/adapters'
import { buildSnapshot, DiagnosticBag, DsGraph, scan, systemFromDocuments } from '@dsgraph/core'
import { MemorySource } from '@dsgraph/sources'
import { describe, expect, it } from 'vitest'
import { check } from '../src/index.js'

const px = (value: number) => ({ value, unit: 'px' })
const json = async (tree: Record<string, unknown>) =>
  DsGraph.from(
    await buildSnapshot(systemFromDocuments([{ file: 't.tokens.json', tree }]), {
      diagnostics: new DiagnosticBag(),
    }),
  )
const css = async (text: string) =>
  DsGraph.from(
    await scan(
      new MemorySource({ 't.css': text }, { kind: 'files', path: 't.css' }),
      { css: { include: ['t.css'] } },
      {
        adapters: [cssTokens],
      },
    ),
  )
const of = async (g: DsGraph, rule: string) =>
  (await check(g)).filter((f) => f.rule === rule).map((f) => f.message)

describe('consistency rules', () => {
  it('find a value set in one theme and empty or written by hand in another', async () => {
    const g = await css(`:root {
  --size-26: 26px;
  --scrim: rgb(16 20 26 / 72%);
  --title-size: var(--size-26);
  --overlay: var(--scrim);
  --gap-none: 0px;
}
[data-theme="dark"] { --title-size: 0px; --overlay: #ffffff; --gap-none: 0px; }`)
    expect(await of(g, 'context/empty-value')).toEqual([
      '"title-size" is 0px in theme: dark, while theme: default has 26px: the value was probably never set',
    ])
    expect(await of(g, 'context/literal-value')).toEqual([
      '"overlay" is written by hand in theme: dark (#ffffff), while every other value references a token',
    ])
  })

  it('find descriptions whose numbers the value no longer has', async () => {
    const g = await json({
      size: { $type: 'dimension', s14: { $value: px(14) }, s16: { $value: px(16) }, s25: { $value: px(25) } },
      radius: {
        $type: 'dimension',
        compact: { $value: '{size.s14}', $description: '13 · 18 − 1 − 4' },
        body: { $value: '{size.s14}', $description: '14 · matches the card' },
      },
      font: { $type: 'fontFamily', sans: { $value: 'Inter' } },
      text: {
        $type: 'typography',
        nav: {
          $value: {
            fontFamily: '{font.sans}',
            fontSize: '{size.s16}',
            fontWeight: 500,
            lineHeight: '{size.s16}',
            letterSpacing: px(-0.192),
          },
          $description: 'Inter Medium · 16/16 · tracking 0%',
        },
        body: {
          $value: {
            fontFamily: '{font.sans}',
            fontSize: '{size.s16}',
            fontWeight: 400,
            lineHeight: '{size.s25}',
            letterSpacing: px(0),
          },
          $description: 'Inter Regular · 16/25 · tracking 0%',
        },
        caption: {
          $value: {
            fontFamily: '{font.sans}',
            fontSize: '{size.s14}',
            fontWeight: 400,
            lineHeight: '{size.s16}',
            letterSpacing: px(0),
          },
          $description: 'Inter Regular · 13/16',
        },
      },
    })
    expect(await of(g, 'description/value-mismatch')).toEqual([
      '"radius.compact": the description says 13, the value is 14',
      '"text.caption": the description says size 13, the value is 14',
      '"text.nav": the description says tracking % 0, the value is -1.2',
    ])
  })

  it('find a typography field written by hand where the others reference a token', async () => {
    const style = (family: string) => ({
      $value: {
        fontFamily: family,
        fontSize: '{size.s16}',
        fontWeight: 400,
        lineHeight: '{size.s16}',
        letterSpacing: px(0),
      },
    })
    const g = await json({
      size: { $type: 'dimension', s16: { $value: px(16) } },
      font: { $type: 'fontFamily', sans: { $value: 'Inter' }, mono: { $value: 'JetBrains Mono' } },
      text: {
        $type: 'typography',
        a: style('{font.sans}'),
        b: style('{font.sans}'),
        c: style('{font.mono}'),
        d: style('{font.mono}'),
        label: style('JetBrains Mono'),
      },
    })
    expect(await of(g, 'typography/unlinked-field')).toEqual([
      '"text.label" writes fontFamily by hand ("JetBrains Mono"); 4 of 5 typography tokens take it from a token',
    ])
  })
})
