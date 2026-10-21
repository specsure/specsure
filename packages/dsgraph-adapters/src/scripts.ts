import { parse } from '@babel/parser'
import type { CodeIndex, StyleLiteral, TokenUse } from '@dsgraph/core'
import { isStyleProperty, literalsIn, scanCssText, varsIn } from './styles.js'
import { classesIn, looksLikeClasses, paletteColor } from './tailwind.js'

interface Node {
  type: string
  loc?: { start: { line: number; column: number } }
  [key: string]: unknown
}

/** JSX attributes that hold classes. */
const CLASS_ATTRIBUTES = new Set(['className', 'class', 'tw', 'classList'])
/** Functions whose arguments are classes: cn(), clsx(), cva() and the like. */
const CLASS_FUNCTIONS = new Set([
  'cn',
  'clsx',
  'classnames',
  'classNames',
  'cva',
  'cx',
  'twMerge',
  'twJoin',
  'tv',
  'tw',
  'ctl',
])
/** Tags of CSS-in-JS templates besides `styled.…`. */
const CSS_TAGS = new Set(['css', 'createGlobalStyle', 'keyframes', 'injectGlobal', 'global', 'styled'])
const SKIP = new Set([
  'loc',
  'start',
  'end',
  'extra',
  'leadingComments',
  'trailingComments',
  'innerComments',
  'range',
])
/** Properties whose bare numbers are pixels in a style object and steps of a scale; positions are not. */
const PX = /^(margin|padding|gap|row-gap|column-gap|font-size)|radius$/

const isNode = (v: unknown): v is Node =>
  typeof v === 'object' && v !== null && typeof (v as Node).type === 'string'
const kebab = (k: string) =>
  k.startsWith('--')
    ? k
    : k
        .replace(/^(Webkit|Moz|ms)(?=[A-Z])/, '-$1')
        .replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
        .toLowerCase()

/** The identifier a tag or callee starts from: `styled` in `styled.div.attrs({})`. */
function rootName(n: unknown): string | undefined {
  let cur = n as Node | undefined
  while (cur) {
    if (cur.type === 'Identifier') return cur.name as string
    if (cur.type === 'MemberExpression') cur = cur.object as Node
    else if (cur.type === 'CallExpression') cur = cur.callee as Node
    else return undefined
  }
  return undefined
}

function calleeName(n: Node): string | undefined {
  if (n.type === 'Identifier') return n.name as string
  if (n.type === 'MemberExpression' && isNode(n.property) && n.property.type === 'Identifier')
    return n.property.name as string
  return undefined
}

export interface ScriptOptions {
  /** Line in the file where the script starts (a `<script>` block). */
  line?: number
  jsx?: boolean
  typescript?: boolean
}

/**
 * Reads a script (JS, TS, JSX, TSX) into an index: `var(--…)` in any string, style objects
 * (`style={{ color: '#fff' }}`, `sx`), CSS-in-JS templates (`styled.div`, `css`) and utility
 * classes in `className`, `cn()`, `clsx()`, `cva()` and strings that look like class lists.
 * Throws when the script does not parse.
 */
export function scanScriptText(file: string, text: string, index: CodeIndex, opts: ScriptOptions = {}): void {
  // Decorators (`@Component` in Angular, MobX, NestJS) are common in the wild; the legacy form is what TS writes.
  const plugins: Array<'jsx' | 'typescript' | 'decorators-legacy'> = ['decorators-legacy']
  if (opts.jsx) plugins.push('jsx')
  if (opts.typescript) plugins.push('typescript')
  const ast = parse(text, { sourceType: 'unambiguous', errorRecovery: true, plugins }) as unknown as Node
  const offset = (opts.line ?? 1) - 1
  const locOf = (n: Node) => ({
    file,
    line: (n.loc?.start.line ?? 1) + offset,
    column: (n.loc?.start.column ?? 0) + 1,
  })

  const classString = (value: string, at: Node) => {
    const loc = locOf(at)
    for (const item of classesIn(value)) {
      if (item.kind === 'use') {
        const use: TokenUse = { ...loc, name: item.names[0]!, property: item.property, text: item.text }
        if (item.names.length > 1) use.candidates = item.names.slice(1)
        if (item.palette) {
          const builtin = paletteColor(item.palette)
          if (builtin) use.builtin = builtin
        }
        index.uses.push(use)
      } else {
        const lit: StyleLiteral = { ...loc, property: item.property, ...item.literal, source: item.text }
        index.literals.push(lit)
      }
    }
  }

  const plainString = (value: string, at: Node, property = '') => {
    const loc = locOf(at)
    for (const v of varsIn(value)) {
      const use: TokenUse = { ...loc, name: v.name, property }
      if (v.fallback !== undefined) use.fallback = v.fallback
      index.uses.push(use)
    }
    if (property) for (const l of literalsIn(property, value)) index.literals.push({ ...loc, property, ...l })
  }

  const stringValue = (value: string, at: Node, classes: boolean) => {
    if (classes || looksLikeClasses(value)) classString(value, at)
    else plainString(value, at)
  }

  const visit = (n: unknown, classes: boolean): void => {
    if (Array.isArray(n)) {
      for (const x of n) visit(x, classes)
      return
    }
    if (!isNode(n)) return
    switch (n.type) {
      case 'JSXAttribute': {
        const name = isNode(n.name) ? (n.name.name as string) : ''
        const value = n.value as Node | null
        if (!value) return
        if (CLASS_ATTRIBUTES.has(name)) {
          visit(value, true)
          return
        }
        if (name === 'style' && value.type === 'StringLiteral') {
          try {
            scanCssText(file, value.value as string, index, { declarations: true, line: locOf(value).line })
          } catch {
            // A style attribute that is not CSS: nothing to read.
          }
          return
        }
        visit(value, false)
        return
      }
      case 'CallExpression': {
        const callee = n.callee as Node
        visit(callee, false)
        visit(n.arguments, classes || CLASS_FUNCTIONS.has(calleeName(callee) ?? ''))
        return
      }
      case 'TaggedTemplateExpression': {
        const quasi = n.quasi as Node
        const quasis = quasi.quasis as Node[]
        const root = rootName(n.tag)
        if (root && CSS_TAGS.has(root)) {
          const css = quasis.map((q) => (q.value as { raw: string }).raw).join('__expr__')
          try {
            scanCssText(file, css, index, {
              scss: true,
              declarations: true,
              line: locOf(quasis[0] ?? quasi).line,
            })
          } catch {
            // Templates built from fragments may not parse alone.
          }
          visit(n.tag, false)
          visit(quasi.expressions, false)
          return
        }
        if (root === 'tw') {
          for (const q of quasis) classString((q.value as { raw: string }).raw, q)
          visit(quasi.expressions, false)
          return
        }
        break
      }
      case 'ObjectProperty': {
        const key = n.key as Node
        const name = n.computed
          ? undefined
          : key.type === 'Identifier'
            ? (key.name as string)
            : key.type === 'StringLiteral'
              ? (key.value as string)
              : undefined
        const value = n.value as Node
        // cn({ 'bg-primary': active }), :class="{ 'text-muted': off }": the keys are classes.
        if (classes && key.type === 'StringLiteral') classString(key.value as string, key)
        const property = name && !classes ? kebab(name) : undefined
        if (property && isStyleProperty(property)) {
          if (value.type === 'StringLiteral') {
            plainString(value.value as string, value, property)
            return
          }
          if (value.type === 'NumericLiteral') {
            const num = value.value as number
            if (num !== 0 && PX.test(property)) plainString(`${num}px`, value, property)
            return
          }
          if (value.type === 'TemplateLiteral' && (value.expressions as unknown[]).length === 0) {
            const q = (value.quasis as Node[])[0]!
            plainString((q.value as { cooked?: string; raw: string }).cooked ?? '', value, property)
            return
          }
        }
        visit(value, classes)
        return
      }
      case 'StringLiteral':
        stringValue(n.value as string, n, classes)
        return
      case 'TemplateLiteral': {
        for (const q of n.quasis as Node[]) {
          const v = q.value as { cooked?: string; raw: string }
          stringValue(v.cooked ?? v.raw, q, classes)
        }
        visit(n.expressions, classes)
        return
      }
      case 'JSXText':
      case 'ImportDeclaration':
      case 'ExportAllDeclaration':
        return
    }
    for (const [k, v] of Object.entries(n))
      if (!SKIP.has(k) && (isNode(v) || Array.isArray(v))) visit(v, classes)
  }

  visit((ast as { program?: unknown }).program ?? ast, false)
}
