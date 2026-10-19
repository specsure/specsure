import {
  type CodeIndex,
  canonicalValue,
  cssColorToDtcg,
  DiagnosticBag,
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

const DEFAULT_INCLUDE = ['**/*.css', '**/*.scss', '**/*.sass']
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
/** Spacing, radii and font sizes; positions (`top`, `inset`) are layout, not steps of a scale. */
const SCALE_PROPERTY =
  /^(margin|padding|scroll-(margin|padding))(-(top|right|bottom|left|block|inline)(-(start|end))?)?$|^(gap|row-gap|column-gap|font-size)$|^border(-(top|bottom|start|end)-(left|right|start|end))?-radius$/i

/** Properties worth reading in a style object: colors and scale values. */
export const isStyleProperty = (property: string): boolean =>
  COLOR_PROPERTY.test(property) ||
  SCALE_PROPERTY.test(property) ||
  /^(background|border|outline|box-shadow|text-shadow|fill|stroke)/i.test(property)

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

/** A parsed CSS color as the canonical value tokens hold, so code and tokens compare directly. */
function canonicalColor(css: string): unknown {
  const dtcg = cssColorToDtcg(css)
  if (!dtcg) return undefined
  const ctx = {
    strict: false,
    allowNonstandardUnits: true,
    diag: new DiagnosticBag(),
    flags: new Set<string>(),
  }
  return canonicalValue('color', dtcg, ctx)
}

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
        const color = canonicalColor(p)
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
      const color = canonicalColor(p)
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

const WRAP = '.__dsgraph__'

/**
 * The full selector a declaration applies to, nesting resolved: `&:hover` inside `.button` is
 * `.button:hover`. The wrapper of a declaration list (a `styled` template) is `&`, and a
 * declaration right inside it has no selector.
 */
function selectorOf(decl: Declaration): string | undefined {
  const rules: string[][] = []
  for (let p = decl.parent; p && p.type !== 'root'; p = p.parent as typeof p)
    if (p.type === 'rule') rules.unshift((p as postcss.Rule).selectors)
  if (!rules.length) return undefined
  let full = ['']
  for (const selectors of rules) {
    const next: string[] = []
    for (const outer of full)
      for (const raw of selectors) {
        const inner = raw.trim()
        next.push(!outer ? inner : inner.includes('&') ? inner.replaceAll('&', outer) : `${outer} ${inner}`)
      }
    // Lists inside lists multiply; a few are enough to tell states and components.
    full = next.slice(0, 8)
  }
  const out = full.map((s) => s.replaceAll(WRAP, '&').replace(/\s+/g, ' ').trim()).join(', ')
  return out === '&' ? undefined : out
}

export interface CssTextOptions {
  scss?: boolean
  /** Line in the file where the text starts (1 for a whole file). */
  line?: number
  /** A declaration list without a selector: a `styled` template, a `style` attribute. */
  declarations?: boolean
}

/**
 * Reads CSS text into an index: every `var(--…)` and every color or scale value written by hand.
 * Definitions of custom properties and SCSS variables are where values are named, so their
 * literals are not reported; their `var()` references are. Throws when the text does not parse.
 */
export function scanCssText(file: string, text: string, index: CodeIndex, opts: CssTextOptions = {}): void {
  // A wrapping rule on the same line keeps line numbers.
  const src = opts.declarations ? `${WRAP}{${text}}` : text
  // postcss-scss may resolve its own copy of postcss; the tree is the same.
  const root: Root = opts.scss
    ? (scss.parse(src, { from: file }) as unknown as Root)
    : postcss.parse(src, { from: file })
  const offset = (opts.line ?? 1) - 1
  root.walkDecls((decl) => {
    const loc = {
      file,
      line: (decl.source?.start?.line ?? 1) + offset,
      column: decl.source?.start?.column ?? 0,
    }
    const selector = selectorOf(decl)
    const property = decl.prop
    for (const v of varsIn(decl.value)) {
      const use: TokenUse = { ...loc, name: v.name, property }
      if (selector) use.selector = selector
      if (v.fallback !== undefined) use.fallback = v.fallback
      index.uses.push(use)
    }
    if (property.startsWith('--') || property.startsWith('$') || property.startsWith('@')) return
    // SCSS interpolation, variables and JS expressions compute values we cannot see.
    if (/#\{|\$[\w-]|__expr__/.test(decl.value)) return
    for (const l of literalsIn(property, decl.value)) {
      const lit: StyleLiteral = { ...loc, property, ...l }
      if (selector) lit.selector = selector
      index.literals.push(lit)
    }
  })
}

// Indented Sass: a declaration is `property: value` (or the old `:property value`) on its own line.
const SASS_DECL = /^\s*(--[\w-]+|\$?[a-z][\w-]*)\s*:\s+(.*?)\s*;?\s*$/i
const SASS_OLD_DECL = /^\s*:([a-z][\w-]*)\s+(.*?)\s*$/i

/**
 * Reads indented Sass (`.sass`): each declaration line is read as SCSS at its own line, so a line
 * the reader cannot make sense of is skipped, not the file. Selectors are not kept.
 */
export function scanSassText(
  file: string,
  text: string,
  index: CodeIndex,
  opts: { line?: number } = {},
): void {
  const offset = (opts.line ?? 1) - 1
  let comment = false
  text.split('\n').forEach((raw, i) => {
    let line = raw
    if (comment) {
      const end = line.indexOf('*/')
      if (end < 0) return
      comment = false
      line = line.slice(end + 2)
    }
    line = line.replace(/\/\*.*?\*\//g, '')
    const start = line.indexOf('/*')
    if (start >= 0) {
      comment = true
      line = line.slice(0, start)
    }
    line = line.replace(/(^|\s)\/\/.*$/, '')
    const m = SASS_DECL.exec(line) ?? SASS_OLD_DECL.exec(line)
    if (!m?.[2]) return
    try {
      scanCssText(file, `${m[1]}: ${m[2]};`, index, { scss: true, declarations: true, line: i + 1 + offset })
    } catch {
      // Not a declaration after all.
    }
  })
}

/**
 * Reads a project's style files (CSS, SCSS, Sass, CSS modules). `scanCode` reads scripts and markup too.
 */
export async function scanStyles(source: Source, opts: StylesOptions = {}): Promise<CodeIndex> {
  const exclude = [...DEFAULT_EXCLUDE, ...(opts.exclude ?? [])]
  const files = (await source.list(opts.include ?? DEFAULT_INCLUDE))
    .filter((f) => !matchGlob(f, exclude))
    .sort()
  await prefetch(source, files)
  const index: CodeIndex = { files: [], uses: [], literals: [], skipped: [] }
  for (const file of files) {
    try {
      const text = await source.readText(file)
      if (/\.sass$/i.test(file)) scanSassText(file, text, index)
      else scanCssText(file, text, index, { scss: /\.scss$/i.test(file) })
      index.files.push(file)
    } catch (e) {
      index.skipped.push({ file, message: (e as Error).message })
    }
  }
  return index
}
