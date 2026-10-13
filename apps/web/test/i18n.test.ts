import { describe, expect, it } from 'vitest'
import { langOf, localePath } from '../src/i18n'
import { messages } from '../src/i18n/messages'

const ru = messages.ru
const nb = (s: string) => s.replace(/ /g, ' ')

describe('i18n', () => {
  it('agrees Russian words with numbers', () => {
    expect(nb(ru.inputs.tokens(1))).toBe('1 токен')
    expect(nb(ru.inputs.tokens(3))).toBe('3 токена')
    expect(nb(ru.inputs.tokens(17))).toBe('17 токенов')
    expect(nb(ru.inputs.tokens(21))).toBe('21 токен')
    expect(nb(ru.verdict.counts.removed(1))).toBe('1 удалён')
    expect(nb(ru.verdict.counts.added(2))).toBe('2 добавлены')
    expect(nb(ru.verdict.counts.changed(6))).toBe('6 изменено')
    expect(nb(ru.results.status(10, 11, false))).toBe('10 изменений · 11 мс')
  })

  it('writes the verdict reason as a sentence a Russian reader would', () => {
    expect(nb(ru.verdict.reason.major(2, ['token.removed', 'token.renamed']))).toBe(
      '2 токена удалены или переименованы: код и макеты, которые их используют, перестанут работать, пока их не обновят.',
    )
    expect(nb(ru.verdict.reason.major(1, ['token.removed']))).toBe(
      '1 токен удалён: код и макеты, которые его используют, перестанут работать, пока их не обновят.',
    )
    expect(ru.verdict.published.lower('minor', 'major')).toBe(
      'Версия опубликована как минорная, а изменения токенов требуют мажорной.',
    )
  })

  it('maps addresses between languages', () => {
    expect(localePath('ru', '/')).toBe('/ru/')
    expect(localePath('ru', '/tools/diff')).toBe('/ru/tools/diff')
    expect(localePath('en', '/ru/tools/mcp')).toBe('/tools/mcp')
    expect(langOf('/ru/tools/diff')).toBe('ru')
    expect(langOf('/tools/diff')).toBe('en')
  })

  it('has every check explained in both languages', () => {
    expect(Object.keys(ru.checks.help).sort()).toEqual(Object.keys(messages.en.checks.help).sort())
    expect(Object.keys(ru.checks.titles).sort()).toEqual(Object.keys(ru.checks.help).sort())
  })
})
