export type Lang = 'en' | 'ru'
export const LANGS: readonly Lang[] = ['en', 'ru']
export const DEFAULT_LANG: Lang = 'en'

/** Plural forms as Intl.PluralRules names them; English uses `one` and `other`, Russian adds `few` and `many`. */
export interface Forms {
  one: string
  few?: string
  many?: string
  other: string
}

const rules = new Map<Lang, Intl.PluralRules>()

/** The form of a word for a number: `plural('ru', 5, { one: 'токен', few: 'токена', many: 'токенов', other: 'токена' })`. */
export function plural(lang: Lang, n: number, forms: Forms): string {
  let r = rules.get(lang)
  if (!r) {
    r = new Intl.PluralRules(lang)
    rules.set(lang, r)
  }
  const key = r.select(n) as keyof Forms
  return forms[key] ?? forms.other
}

/** `5 токенов`: the number and its word, with a non-breaking space between them. */
export const count = (lang: Lang, n: number, forms: Forms): string =>
  `${num(lang, n)} ${plural(lang, n, forms)}`

/** A number as people write it in the language: `3,36` in Russian, thousands with a thin space. */
export const num = (lang: Lang, n: number): string => n.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US')

/** The address of a page in a language: English at the root, Russian under `/ru`. */
export function localePath(lang: Lang, path: string): string {
  const bare = path.replace(/^\/ru(?=\/|$)/, '') || '/'
  return lang === 'ru' ? (bare === '/' ? '/ru/' : `/ru${bare}`) : bare
}

/** The language of an address. */
export const langOf = (path: string): Lang => (/^\/ru(\/|$)/.test(path) ? 'ru' : 'en')
