import { type CodeIndex, matchGlob, prefetch, type Source } from '@dsgraph/core'
import { scanScriptText } from './scripts.js'
import { scanCssText } from './styles.js'

export interface CodeOptions {
  /** Globs of files to read; default every style, script and markup file. */
  include?: string[]
  exclude?: string[]
}

/** Every style, script and markup file. */
export const CODE_INCLUDE = [
  '**/*.{css,scss}',
  '**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}',
  '**/*.{vue,svelte,astro,html}',
]
const DEFAULT_EXCLUDE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.svelte-kit/**',
  '**/.astro/**',
  '**/coverage/**',
  '**/*.min.{css,js}',
  '**/*.d.ts',
  // Config files define a theme; tests and fixtures hold values on purpose.
  '**/*.config.{js,mjs,cjs,ts,mts,cts}',
  '**/*.{test,spec}.*',
  '**/__tests__/**',
]
/** Larger files are bundles or generated code, not what people write. */
const MAX_CHARS = 500_000

const lineAt = (text: string, index: number) => {
  let line = 1
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++
  return line
}

/** `{…}` from `start` (an opening brace), braces balanced; undefined when it does not close. */
function balanced(text: string, start: number): string | undefined {
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}' && --depth === 0) return text.slice(start + 1, i)
  }
  return undefined
}

/**
 * Vue, Svelte, Astro and HTML: `<script>` and `<style>` blocks, Astro frontmatter, and in the
 * template the `class` and `style` attributes, bound ones (`:class`, `class={…}`) included.
 */
export function scanMarkupText(file: string, text: string, index: CodeIndex): void {
  const ts = (attrs: string) => /lang=["']?ts|typescript/i.test(attrs) || /\.astro$/i.test(file)
  let template = text
  const blank = (from: number, to: number) => {
    template = template.slice(0, from) + template.slice(from, to).replace(/[^\n]/g, ' ') + template.slice(to)
  }
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (fm && /\.astro$/i.test(file)) {
    scanScriptText(file, fm[1]!, index, { typescript: true, line: 2 })
    blank(0, fm[0].length)
  }
  for (const m of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const at = m.index + m[0].indexOf('>') + 1
    if (m[2]!.trim() && !/type=["']?(application\/(ld\+)?json|text\/template)/i.test(m[1]!))
      scanScriptText(file, m[2]!, index, { typescript: ts(m[1]!), jsx: !ts(m[1]!), line: lineAt(text, at) })
    blank(m.index, m.index + m[0].length)
  }
  for (const m of text.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi)) {
    const at = m.index + m[0].indexOf('>') + 1
    scanCssText(file, m[2]!, index, { scss: /lang=["']?s[ac]ss/i.test(m[1]!), line: lineAt(text, at) })
    blank(m.index, m.index + m[0].length)
  }

  const expr = (code: string, at: number, classes: boolean) => {
    try {
      // Wrapped in cn(…) the expression is read as classes.
      scanScriptText(file, classes ? `cn(${code})` : `(${code})`, index, {
        typescript: true,
        line: lineAt(template, at),
      })
    } catch {
      // Not plain JavaScript (a template language of its own): skip.
    }
  }
  const attr =
    /\s(:?class|className|class:list|v-bind:class|:?style|v-bind:style)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{)/g
  for (const m of template.matchAll(attr)) {
    const name = m[1]!.replace('v-bind:', ':')
    const isClass = /class/i.test(name)
    const bound = name.startsWith(':') || name === 'class:list'
    const quoted = m[2] ?? m[3]
    if (quoted === undefined) {
      const inner = balanced(template, m.index + m[0].length - 1)
      if (inner !== undefined) expr(inner, m.index, isClass)
      continue
    }
    if (bound) expr(quoted, m.index, isClass)
    else if (isClass) expr(JSON.stringify(quoted), m.index, true)
    else
      try {
        scanCssText(file, quoted, index, { declarations: true, line: lineAt(template, m.index) })
      } catch {
        // Not CSS: skip.
      }
  }
}

/** Reads one file of any supported kind into an index. Throws when it does not parse. */
export function scanFileText(file: string, text: string, index: CodeIndex): void {
  if (/\.s?css$/i.test(file)) scanCssText(file, text, index, { scss: /\.scss$/i.test(file) })
  else if (/\.(vue|svelte|astro|html?)$/i.test(file)) scanMarkupText(file, text, index)
  else
    scanScriptText(file, text, index, {
      typescript: /\.(m|c)?tsx?$/i.test(file),
      jsx: !/\.(m|c)?ts$/i.test(file),
    })
}

/**
 * Reads a project's code: styles (CSS, SCSS, CSS modules), scripts (JS, TS, JSX, TSX with style
 * objects, CSS-in-JS and utility classes) and markup (Vue, Svelte, Astro, HTML): where it uses
 * tokens and where it writes values by hand.
 */
export async function scanCode(source: Source, opts: CodeOptions = {}): Promise<CodeIndex> {
  const exclude = [...DEFAULT_EXCLUDE, ...(opts.exclude ?? [])]
  const files = (await source.list(opts.include ?? CODE_INCLUDE)).filter((f) => !matchGlob(f, exclude)).sort()
  await prefetch(source, files)
  const index: CodeIndex = { files: [], uses: [], literals: [], skipped: [] }
  for (const file of files) {
    let text: string
    try {
      text = await source.readText(file)
    } catch (e) {
      index.skipped.push({ file, message: (e as Error).message })
      continue
    }
    if (text.length > MAX_CHARS) continue
    // Each file on its own: a file that fails to parse adds nothing half-read.
    const part: CodeIndex = { files: [], uses: [], literals: [], skipped: [] }
    try {
      scanFileText(file, text, part)
    } catch (e) {
      index.skipped.push({ file, message: (e as Error).message })
      continue
    }
    index.files.push(file)
    index.uses.push(...part.uses)
    index.literals.push(...part.literals)
  }
  return index
}
