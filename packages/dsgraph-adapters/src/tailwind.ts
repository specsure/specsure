import type { StyleLiteral, TokenUse } from '@dsgraph/core'
import { literalsIn } from './styles.js'
import { tailwindColor } from './tailwind-palette.js'

/**
 * Utility classes in the Tailwind style: what a class string uses from the tokens and what it
 * writes by hand. `bg-primary` uses a token (`--color-primary` or `--primary`), `bg-(--brand)` and
 * `bg-[var(--brand)]` use `--brand`, `bg-[#3366ff]` and `p-[13px]` are values written by hand.
 * Only names are read; the Tailwind config is not executed.
 */

export type ClassItem =
  | {
      kind: 'use'
      text: string
      property: string
      names: string[]
      /** A name of Tailwind's own palette (`blue-500`), the color when the theme does not define it. */
      palette?: string
    }
  | {
      kind: 'literal'
      text: string
      property: string
      literal: Pick<StyleLiteral, 'text' | 'type' | 'value'>
    }

type Family = 'color' | 'text' | 'space' | 'radius' | 'shadow' | 'font' | 'leading' | 'tracking'

/** Utility → the CSS property it sets and how its named values map to custom properties. */
const UTILITIES: Array<[string, string, Family]> = [
  ['bg', 'background-color', 'color'],
  ['text', 'color', 'text'],
  ['border-x', 'border-color', 'color'],
  ['border-y', 'border-color', 'color'],
  ['border-t', 'border-top-color', 'color'],
  ['border-r', 'border-right-color', 'color'],
  ['border-b', 'border-bottom-color', 'color'],
  ['border-l', 'border-left-color', 'color'],
  ['border-s', 'border-color', 'color'],
  ['border-e', 'border-color', 'color'],
  ['border', 'border-color', 'color'],
  ['divide', 'border-color', 'color'],
  ['outline', 'outline-color', 'color'],
  ['ring-offset', 'outline-color', 'color'],
  ['ring', 'outline-color', 'color'],
  ['decoration', 'text-decoration-color', 'color'],
  ['accent', 'accent-color', 'color'],
  ['caret', 'caret-color', 'color'],
  ['fill', 'fill', 'color'],
  ['stroke', 'stroke', 'color'],
  ['placeholder', 'color', 'color'],
  ['from', 'background-color', 'color'],
  ['via', 'background-color', 'color'],
  ['to', 'background-color', 'color'],
  ['shadow', 'box-shadow', 'shadow'],
  ['rounded-tl', 'border-top-left-radius', 'radius'],
  ['rounded-tr', 'border-top-right-radius', 'radius'],
  ['rounded-bl', 'border-bottom-left-radius', 'radius'],
  ['rounded-br', 'border-bottom-right-radius', 'radius'],
  ['rounded-t', 'border-radius', 'radius'],
  ['rounded-r', 'border-radius', 'radius'],
  ['rounded-b', 'border-radius', 'radius'],
  ['rounded-l', 'border-radius', 'radius'],
  ['rounded-s', 'border-radius', 'radius'],
  ['rounded-e', 'border-radius', 'radius'],
  ['rounded', 'border-radius', 'radius'],
  ['font', 'font-weight', 'font'],
  ['leading', 'line-height', 'leading'],
  ['tracking', 'letter-spacing', 'tracking'],
  ['space-x', 'margin-left', 'space'],
  ['space-y', 'margin-top', 'space'],
  ['gap-x', 'column-gap', 'space'],
  ['gap-y', 'row-gap', 'space'],
  ['gap', 'gap', 'space'],
  ['px', 'padding-left', 'space'],
  ['py', 'padding-top', 'space'],
  ['ps', 'padding-left', 'space'],
  ['pe', 'padding-right', 'space'],
  ['pt', 'padding-top', 'space'],
  ['pr', 'padding-right', 'space'],
  ['pb', 'padding-bottom', 'space'],
  ['pl', 'padding-left', 'space'],
  ['p', 'padding', 'space'],
  ['mx', 'margin-left', 'space'],
  ['my', 'margin-top', 'space'],
  ['ms', 'margin-left', 'space'],
  ['me', 'margin-right', 'space'],
  ['mt', 'margin-top', 'space'],
  ['mr', 'margin-right', 'space'],
  ['mb', 'margin-bottom', 'space'],
  ['ml', 'margin-left', 'space'],
  ['m', 'margin', 'space'],
]

/** Values of these utilities that are keywords, not names of tokens. */
const KEYWORDS: Partial<Record<string, Set<string>>> = {
  text: new Set([
    'left',
    'center',
    'right',
    'justify',
    'start',
    'end',
    'wrap',
    'nowrap',
    'balance',
    'pretty',
    'clip',
    'ellipsis',
    'inherit',
    'current',
    'transparent',
  ]),
  bg: new Set([
    'fixed',
    'local',
    'scroll',
    'auto',
    'cover',
    'contain',
    'center',
    'top',
    'bottom',
    'left',
    'right',
    'repeat',
    'no-repeat',
    'repeat-x',
    'repeat-y',
    'repeat-round',
    'repeat-space',
    'none',
    'inherit',
    'current',
    'transparent',
    'clip-border',
    'clip-padding',
    'clip-content',
    'clip-text',
    'origin-border',
    'origin-padding',
    'origin-content',
    'blend-multiply',
    'gradient-to-r',
    'gradient-to-l',
    'gradient-to-t',
    'gradient-to-b',
    'gradient-to-tr',
    'gradient-to-tl',
    'gradient-to-br',
    'gradient-to-bl',
  ]),
  border: new Set([
    'solid',
    'dashed',
    'dotted',
    'double',
    'hidden',
    'none',
    'collapse',
    'separate',
    'current',
    'transparent',
    'inherit',
  ]),
  font: new Set(['sans', 'serif', 'mono', 'italic']),
  shadow: new Set(['none', 'inner']),
  outline: new Set(['none', 'dashed', 'dotted', 'double', 'solid', 'hidden']),
  ring: new Set(['inset']),
  decoration: new Set(['solid', 'double', 'dotted', 'dashed', 'wavy', 'clone', 'slice', 'auto', 'from-font']),
}

function candidates(family: Family, name: string): string[] {
  switch (family) {
    case 'color':
      return [`--color-${name}`, `--${name}`]
    case 'text':
      return [`--color-${name}`, `--${name}`, `--text-${name}`, `--font-size-${name}`]
    case 'radius':
      return [`--radius-${name}`]
    case 'shadow':
      return [`--shadow-${name}`, `--color-${name}`]
    case 'font':
      return [`--font-${name}`, `--font-weight-${name}`]
    case 'leading':
      return [`--leading-${name}`, `--line-height-${name}`]
    case 'tracking':
      return [`--tracking-${name}`, `--letter-spacing-${name}`]
    default:
      // Numbers are steps of Tailwind's own spacing; names may be the project's (`p-gutter`).
      return /^[\d.]+$|^px$|^auto$|^full$|^screen$/.test(name) ? [] : [`--spacing-${name}`, `--space-${name}`]
  }
}

/** `hover:md:bg-primary/50` → `bg-primary`: variants, `!` and the opacity modifier dropped. */
function bare(cls: string): string {
  let depth = 0
  let start = 0
  for (let i = 0; i < cls.length; i++) {
    const ch = cls[i]
    if (ch === '[' || ch === '(') depth++
    else if (ch === ']' || ch === ')') depth--
    else if (ch === ':' && depth === 0) start = i + 1
  }
  return cls.slice(start).replace(/^!|!$/g, '').replace(/^-/, '')
}

function arbitrary(value: string): string {
  // Underscores stand for spaces; a type hint (`[color:…]`, `[length:…]`) comes first.
  return value.replace(/_/g, ' ').replace(/^(color|length|percentage|number|url|image|position|size):/, '')
}

/** One class. */
export function classItem(cls: string): ClassItem | undefined {
  const c = bare(cls)
  // `[color:#fff]`: an arbitrary property.
  const prop = /^\[([a-z-]+):(.+)\]$/.exec(c)
  if (prop) {
    const literal = literalsIn(prop[1]!, arbitrary(prop[2]!))[0]
    return literal ? { kind: 'literal', text: cls, property: prop[1]!, literal } : undefined
  }
  for (const [utility, property, family] of UTILITIES) {
    if (!c.startsWith(`${utility}-`)) continue
    let rest = c.slice(utility.length + 1)
    // `bg-(--brand)` (Tailwind 4) and `bg-[var(--brand)]`.
    const short = /^\((--[\w-]+)\)$/.exec(rest)
    if (short) return { kind: 'use', text: cls, property, names: [short[1]!] }
    const bracket = /^\[(.+)\](\/.*)?$/.exec(rest)
    if (bracket) {
      const value = arbitrary(bracket[1]!)
      const v = /^var\(\s*(--[\w-]+)/.exec(value)
      if (v) return { kind: 'use', text: cls, property, names: [v[1]!] }
      // `text-[13px]` is a size, `text-[#fff]` a color.
      const props = family === 'text' ? ['color', 'font-size'] : [property]
      for (const p of props) {
        const literal = literalsIn(p, value)[0]
        if (literal) return { kind: 'literal', text: cls, property: p, literal }
      }
      return undefined
    }
    const modifier = /\/[\w.[\]()-]+$/.test(rest)
    rest = rest.replace(/\/[\w.[\]()-]+$/, '')
    if (!rest || KEYWORDS[utility]?.has(rest)) return undefined
    // `border-2`, `outline-4`: widths, not names.
    if (/^\d+$/.test(rest) && family !== 'space') return undefined
    const names = candidates(family, rest)
    if (!names.length) return undefined
    // With an opacity modifier the color is not the palette's own.
    const palette =
      (family === 'color' || family === 'text') && !modifier && tailwindColor(rest) ? rest : undefined
    return { kind: 'use', text: cls, property, names, ...(palette ? { palette } : {}) }
  }
  return undefined
}

/**
 * A color of Tailwind's own palette (`blue-500`) as a value, in Tailwind 4 unless told otherwise:
 * what a class such as `bg-blue-500` writes when the project's theme does not define the name.
 */
export function paletteColor(name: string, major: 3 | 4 = 4): TokenUse['builtin'] {
  const css = tailwindColor(name, major)
  const l = css ? literalsIn('color', css)[0] : undefined
  return l ? { name, text: l.text, value: l.value } : undefined
}

/** Every class of a class string that uses a token or writes a value by hand. */
export function classesIn(text: string): ClassItem[] {
  const out: ClassItem[] = []
  for (const cls of text.split(/\s+/)) {
    if (!cls) continue
    const item = classItem(cls)
    if (item) out.push(item)
  }
  return out
}

const UTILITY_LIKE = new RegExp(
  `^(?:[\\w-]+:)*!?-?(?:${UTILITIES.map(([u]) => u).join('|')}|flex|grid|block|inline|hidden|w|h|size|min|max|items|justify|self|z|opacity|overflow|cursor|transition|duration|ease|animate|absolute|relative|fixed|sticky|truncate|underline|uppercase|lowercase|capitalize|italic|sr)(?:-|$|\\[)`,
)

/** Whether a string outside `className` looks like a list of utility classes (`const base = "px-4 bg-primary"`). */
export function looksLikeClasses(text: string): boolean {
  const parts = text.trim().split(/\s+/)
  if (parts.length === 0 || !parts[0]) return false
  if (parts.some((p) => /^[!-]?(?:[\w-]+:)*[\w-]+-[[(]/.test(p))) return true
  if (parts.length < 2) return false
  return parts.filter((p) => UTILITY_LIKE.test(p)).length / parts.length >= 0.6
}
