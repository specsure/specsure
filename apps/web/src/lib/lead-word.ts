/** Words that only repeat the type at the start of a name: `color.text.body` is about text. */
const TYPE_WORDS = new Set(['color', 'colors', 'colour', 'dimension', 'size', 'semantic', 'sys', 'ref'])

/**
 * The word a name leads with once a type prefix is dropped: `text` in `color.text.body`, `bg` in
 * `bgColor.accent`. A general token names its role there; a component's token names the component.
 */
export const leadWord = (words: string[]): string =>
  (words.length > 1 && TYPE_WORDS.has(words[0]!) ? words[1] : words[0]) ?? ''
