import {
  type CodeIndex,
  cssColorToDtcg,
  matchGlob,
  prefetch,
  type Source,
  type StyleLiteral,
  type TokenUse,
} from '@dsgraph/core'
import postcss, { type Declaration, type Root } from 'postcss'
import scss from 'postcss-scss'
import { splitTopLevel } from './css-values.js'

export interface StylesOptions {
  /** Globs of style files; default every `.css` and `.scss` file. */
  include?: string[]
  exclude?: string[]
}

const DEFAULT_INCLUDE = ['**/*.css', '**/*.scss']
const DEFAULT_EXCLUDE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/.next/**',
  '**/coverage/**',
  '**/*.min.css',
]

/** Properties whose colors are worth a token. Named colors (`red`) count only here. */
const COLOR_PROPERTY =
  /^(color|background(-color)?|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?|outline(-color)?|fill|stroke|(box|text)-shadow|caret-color|accent-color|text-decoration(-color)?|column-rule(-color)?|scrollbar-color)$/i

/** Properties that take values from a spacing, radius or type scale. */
const SCALE_PROPERTY =
  /^(margin|padding|inset|scroll-(margin|padding))(-(top|right|bottom|left|block|inline)(-(start|end))?)?$|^(gap|row-gap|column-gap|top|right|bottom|left|font-size)$|^border(-(top|bottom|start|end)-(left|right|start|end))?-radius$/i

const NOT_A_COLOR = new Set([
  'transparent',
  'currentcolor',
  'inherit',
  'initial',
  'unset',
  'revert',
  'none',
  'auto',
])
const COLOR_FUNCTION = /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const LENGTH = /^(-?)(\d+\.?\d*|\.\d+)(px|rem)$/i

/** Every `var(--name, fallback)` in a value, nested ones included. */
export function varsIn(value: string): Array<{ name: string; fallback?: string }> {
  const out: Array<{ name: string; fallback?: string }> = []
  const re = /var\(\s*(--[\w-]+)\s*/gi
  for (let m = re.exec(value); m; m = re.exec(value)) {
    let depth = 1
    let i = re.lastIndex
    for (; i < value.length && depth > 0; i++) {
      if (value[i] === '(') depth++
      else if (value[i] === ')') depth--
    }
    const rest = value.slice(re.lastIndex, i - 1).trim()
    const use: { name: string; fallback?: string } = { name: m[1]! }
    if (rest.startsWith(',')) use.fallback = rest.slice(1).trim()
    out.push(use)
  }
  return out
}

/** Value parts outside `var()`, `url()` and other functions that are not colors. */
function plainParts(value: string): string[] {
  const parts: string[] = []
  for (const item of splitTopLevel(value, ',')) {
    for (const part of splitTopLevel(item, ' ')) {
      const p = part.trim()
      if (!p) continue
      const fn = /^([\w-]+)\(/.exec(p)
      if (fn && !COLOR_FUNCTION.test(p)) {
        // calc(16px + var(--x)), clamp(…), min(…): look inside, but not into var(), url() or env().
        // A color mixed from a token (`color-mix(in oklch, var(--accent), black 10%)`) is derived, not hard-coded.
        if (/^(var|url|env|image-set|format|local|color-mix)$/i.test(fn[1]!)) continue
        const inner = p.slice(fn[0].length, -1)
        parts.push(
          ...plainParts(/^(calc|clamp|min|max)$/i.test(fn[1]!) ? inner.replace(/[+*/]/g, ' ') : inner),
        )
      } else parts.push(p)
    }
  }
  return parts
}

/** Colors and scale values written by hand in a declaration. */
export function literalsIn(
  property: string,
  value: string,
): Array<Pick<StyleLiteral, 'text' | 'type' | 'value'>> {
  const out: Array<Pick<StyleLiteral, 'text' | 'type' | 'value'>> = []
  const colorProperty = COLOR_PROPERTY.test(property)
  const scaleProperty = SCALE_PROPERTY.test(property)
  if (!colorProperty && !scaleProperty && !/^(background|border|outline)/i.test(property)) {
    // Any property can carry an explicit color (`fill`, gradients in `mask`), but only as hex or a color function.
    for (const p of plainParts(value))
      if (HEX.test(p) || COLOR_FUNCTION.test(p)) {
        const color = cssColorToDtcg(p)
        if (color) out.push({ text: p, type: 'color', value: color })
      }
    return out
  }
  for (const p of plainParts(value)) {
    const lower = p.toLowerCase()
    if (
      HEX.test(p) ||
      COLOR_FUNCTION.test(p) ||
      (colorProperty && /^[a-z]+$/.test(lower) && !NOT_A_COLOR.has(lower))
    ) {
      const color = cssColorToDtcg(p)
      if (color) {
        out.push({ text: p, type: 'color', value: color })
        continue
      }
    }
    const m = scaleProperty ? LENGTH.exec(p) : null
    // 0 and hairlines are not scale values.
    if (m && Number(m[2]) !== 0 && !(m[3]!.toLowerCase() === 'px' && Number(m[2]) <= 1))
      out.push({ text: p, type: 'dimension', value: { value: Number(m[2]), unit: m[3]!.toLowerCase() } })
  }
  return out
}

function selectorOf(decl: Declaration): string | undefined {
  const parent = decl.parent
  return parent && parent.type === 'rule' ? (parent as postcss.Rule).selector.replace(/\s+/g, ' ') : undefined
}

function parse(file: string, text: string): Root {
  // postcss-scss may resolve its own copy of postcss; the tree is the same.
  if (/\.scss$/i.test(file)) return scss.parse(text, { from: file }) as unknown as Root
  return postcss.parse(text, { from: file })
}

/**
 * Reads a project's style files (CSS, SCSS, CSS modules): every `var(--…)` and every color or
 * scale value written by hand. Definitions of custom properties and SCSS variables are where values
 * are named, so their literals are not reported; their `var()` references are.
 */
export async function scanStyles(source: Source, opts: StylesOptions = {}): Promise<CodeIndex> {
  const exclude = [...DEFAULT_EXCLUDE, ...(opts.exclude ?? [])]
  const files = (await source.list(opts.include ?? DEFAULT_INCLUDE))
    .filter((f) => !matchGlob(f, exclude))
    .sort()
  await prefetch(source, files)
  const index: CodeIndex = { files: [], uses: [], literals: [], skipped: [] }
  for (const file of files) {
    let root: Root
    try {
      root = parse(file, await source.readText(file))
    } catch (e) {
      index.skipped.push({ file, message: (e as Error).message })
      continue
    }
    index.files.push(file)
    root.walkDecls((decl) => {
      const loc = { file, line: decl.source?.start?.line ?? 0, column: decl.source?.start?.column ?? 0 }
      const selector = selectorOf(decl)
      const property = decl.prop
      for (const v of varsIn(decl.value)) {
        const use: TokenUse = { ...loc, name: v.name, property }
        if (selector) use.selector = selector
        if (v.fallback !== undefined) use.fallback = v.fallback
        index.uses.push(use)
      }
      if (property.startsWith('--') || property.startsWith('$') || property.startsWith('@')) return
      // SCSS interpolation and function calls compute values we cannot see.
      if (/#\{|\$[\w-]/.test(decl.value)) return
      for (const l of literalsIn(property, decl.value)) {
        const lit: StyleLiteral = { ...loc, property, ...l }
        if (selector) lit.selector = selector
        index.literals.push(lit)
      }
    })
  }
  return index
}
