import { describe, expect, it } from 'vitest'
import {
  buildSnapshot,
  DiagnosticBag,
  DsGraph,
  type Knowledge,
  nearestTokens,
  readKnowledge,
  styleContext,
  systemFromDocuments,
  vocabularyOf,
} from '../src/index.js'

describe('styleContext', () => {
  it('reads states from the selector, not from what :not() excludes', () => {
    expect(styleContext({ file: 'a.css', property: 'color', selector: '.x:hover' }).states).toEqual(['hover'])
    expect(
      styleContext({
        file: 'a.css',
        property: 'color',
        selector: '.x:focus-visible, .x[aria-disabled="true"]',
      }).states,
    ).toEqual(['disabled', 'focus'])
    expect(
      styleContext({ file: 'a.css', property: 'color', selector: '.x:not(:disabled)' }).states,
    ).toBeUndefined()
    expect(
      styleContext({ file: 'a.css', property: 'color', selector: '[role=tab][aria-selected=true]' }).states,
    ).toEqual(['selected'])
  })

  it("reads states from a class's variants", () => {
    expect(
      styleContext({ file: 'a.tsx', property: 'color', source: 'group-hover:text-[#fff]' }).states,
    ).toEqual(['hover'])
    expect(
      styleContext({ file: 'a.tsx', property: 'color', source: 'md:aria-disabled:text-[#fff]' }).states,
    ).toEqual(['disabled'])
    expect(
      styleContext({ file: 'a.tsx', property: 'color', source: 'md:text-[#fff]' }).states,
    ).toBeUndefined()
  })

  it('names the component by the BEM block and the file, leaving out generic and state names', () => {
    expect(
      styleContext({ file: 'src/card.scss', property: 'color', selector: '.card__title--large.is-active' })
        .components,
    ).toEqual(['card', 'cardtitle'])
    expect(
      styleContext({ file: 'src/ActionList/Item.module.css', property: 'color', selector: '.root' })
        .components,
    ).toEqual(['item'])
    expect(styleContext({ file: 'src/Button/index.tsx', property: 'color' }).components).toEqual(['button'])
    expect(
      styleContext({ file: 'src/styles.css', property: 'color', selector: '.text' }).components,
    ).toBeUndefined()
  })
})

describe('nearestTokens', () => {
  it('of equal tokens, puts first the one the system names its default', async () => {
    const white = { colorSpace: 'srgb', components: [1, 1, 1] }
    const tree = {
      gray: { $type: 'color', 0: { $value: white } },
      // `raised` is the one more tokens build on; `default` still says which white is the page's.
      bg: { $type: 'color', raised: { $value: '{gray.0}' }, default: { $value: '{gray.0}' } },
      card: { $type: 'color', bg: { $value: '{bg.raised}' } },
      popover: { $type: 'color', bg: { $value: '{bg.raised}' } },
    }
    const graph = DsGraph.from(
      await buildSnapshot(systemFromDocuments([{ file: 't.tokens.json', tree }]), {
        diagnostics: new DiagnosticBag(),
      }),
    )
    const value = { space: 'srgb', components: [1, 1, 1], alpha: 1 }
    const ids = nearestTokens(graph, { type: 'color', value }, graph.defaultInput(), 2, 'background').map(
      (m) => m.token.id,
    )
    expect(ids).toEqual(['bg.default', 'bg.raised'])
  })
})

describe('knowledge packs', () => {
  const pack: Knowledge = {
    schema: 'dsgraph/knowledge@1',
    version: '0.0.1',
    vocabulary: { states: { pressed: 'active' }, rest: ['idle'], generic: ['legacy'] },
  }

  it('add words to the neutral vocabulary without replacing it', () => {
    const v = vocabularyOf(pack)
    expect(v.states.get('pressed')).toBe('active')
    expect(v.states.get('hover')).toBe('hover')
    expect(v.rest.has('idle') && v.rest.has('rest')).toBe(true)
    expect(v.defaults.has('default')).toBe(true)
    expect(vocabularyOf().states.has('pressed')).toBe(false)
    expect(styleContext({ file: 'src/legacy/Button.tsx', property: 'color' }).components).toEqual(['button'])
    expect(styleContext({ file: 'src/legacy.css', property: 'color' }, pack).components).toBeUndefined()
  })

  it('rank by the words a pack adds', async () => {
    const blue = { colorSpace: 'srgb', components: [0.035, 0.412, 0.855] }
    const tree = {
      base: { $type: 'color', blue: { $value: blue } },
      button: { $type: 'color', bg: { idle: { $value: '{base.blue}' }, pressed: { $value: '{base.blue}' } } },
    }
    const graph = DsGraph.from(
      await buildSnapshot(systemFromDocuments([{ file: 't.tokens.json', tree }]), {
        diagnostics: new DiagnosticBag(),
      }),
    )
    const value = { space: 'srgb', components: [0.035, 0.412, 0.855], alpha: 1 }
    const first = (states: string[], k?: Knowledge) =>
      nearestTokens(
        graph,
        { type: 'color', value },
        graph.defaultInput(),
        1,
        { property: 'background', states },
        k,
      )[0]?.token.id
    // Without the pack, "pressed" and "idle" are just words: the name order decides.
    expect(first(['active'])).toBe('button.bg.idle')
    expect(first(['active'], pack)).toBe('button.bg.pressed')
    expect(first([], pack)).toBe('button.bg.idle')
  })

  it('are checked before use', () => {
    expect(() => readKnowledge({ schema: 'other' })).toThrow(/dsgraph\/knowledge@1/)
    expect(() =>
      readKnowledge({ schema: 'dsgraph/knowledge@1', version: '1', vocabulary: { rest: 'idle' } }),
    ).toThrow(/arrays of words/)
    expect(readKnowledge(pack)).toBe(pack)
  })
})
