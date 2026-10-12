import {
  type DiagnosticBag,
  excludeFor,
  matchGlob,
  prefetch,
  type ScanConfig,
  type Source,
  type TokenAdapter,
  type TokenDocument,
  type TokenSystem,
} from '@dsgraph/core'
import postcss, { type AtRule, type Declaration } from 'postcss'
import { cssValueToToken, idFromCustomProperty } from './css-values.js'

type Placement =
  | { kind: 'base' }
  | { kind: 'context'; modifier: string; context: string; boolean?: boolean }
  | { kind: 'skip' }

const ROOT_LIKE = /^(:root|html|:host|body|\*)(:not\([^)]*\))*$/
const ATTR_THEME = /^(?::root|html|body|:host)?\[(data-[\w-]+)(?:=["']?([\w-]+)["']?)?\](:not\([^)]*\))*$/
const CLASS_THEME = /^(?::root|html|body|:host)?\.(dark|light|theme-([\w-]+)|([\w-]+)-theme)(:not\([^)]*\))*$/
const COLOR_SCHEME = /prefers-color-scheme\s*:\s*(dark|light)/i
/** Several attributes at once: `[data-color-mode="dark"][data-dark-theme="dark_dimmed"]`. */
const COMPOUND_ATTR =
  /^(?::root|html|body|:host)?((?:\[data-[\w-]+(?:=["']?[\w-]+["']?)?\]){2,})(:not\([^)]*\))*$/

const norm = (s: string) => s.replace(/\s+/g, ' ').replace(/["']/g, '').trim().toLowerCase()

/** Conditional at-rules around a declaration, outermost first (`@layer` is ignored). */
function atRulesOf(decl: Declaration): string[] {
  const out: string[] = []
  let node = decl.parent?.parent
  while (node && node.type !== 'root') {
    if (node.type === 'atrule') {
      const at = node as AtRule
      if (at.name !== 'layer') out.unshift(`@${at.name} ${norm(at.params)}`)
    }
    node = node.parent
  }
  return out
}

/** Well-known conditions under the names people use for them. */
const KNOWN_CONDITIONS: Array<[RegExp, string]> = [
  [/display-p3|color-gamut\s*:\s*p3/, 'display-p3'],
  [/color-gamut\s*:\s*rec2020/, 'rec2020'],
  [/prefers-reduced-motion\s*:\s*reduce/, 'reduced-motion'],
  [/prefers-contrast\s*:\s*more/, 'high-contrast'],
  [/prefers-contrast\s*:\s*less/, 'low-contrast'],
  [/forced-colors\s*:\s*active/, 'forced-colors'],
]

/**
 * A short modifier name for an at-rule: `@media (min-width: 768px)` → `min-width: 768px`,
 * `@supports (color: color(display-p3 1 1 1))` → `display-p3`.
 */
export function conditionName(atRule: string): string {
  for (const [re, name] of KNOWN_CONDITIONS) if (re.test(atRule)) return name
  const m = /^@(\w+)\s*(.*)$/.exec(atRule.trim())
  if (!m) return atRule
  const params = m[2]!
    .replace(/^\((.*)\)$/, '$1')
    .replace(/\(([^()]*)\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return m[1] === 'media' ? params : `${m[1]} ${params}`
}

function autoPlacement(selectors: string[], atRules: string[]): Placement {
  const media = atRules.find((a) => !COLOR_SCHEME.test(a))
  const scheme = atRules.map((a) => COLOR_SCHEME.exec(a)?.[1]?.toLowerCase()).find(Boolean)
  for (const raw of selectors) {
    const sel = raw.replace(/\s+/g, '')
    if (ROOT_LIKE.test(sel)) {
      if (media) return { kind: 'context', modifier: conditionName(media), context: 'on', boolean: true }
      if (scheme) return { kind: 'context', modifier: 'theme', context: scheme }
      return { kind: 'base' }
    }
    const attr = ATTR_THEME.exec(sel)
    if (attr && !media)
      return { kind: 'context', modifier: attr[1]!.replace(/^data-/, ''), context: attr[2] ?? 'on' }
    const cls = CLASS_THEME.exec(sel)
    if (cls && !media) return { kind: 'context', modifier: 'theme', context: cls[2] ?? cls[3] ?? cls[1]! }
    // The most specific attribute names the theme: `…[data-dark-theme="dark_dimmed"]` → dark_dimmed.
    const compound = COMPOUND_ATTR.exec(sel)
    if (compound && !media) {
      const values = [...compound[1]!.matchAll(/=["']?([\w-]+)["']?\]/g)].map((m) => m[1]!)
      if (values.length) return { kind: 'context', modifier: 'theme', context: values[values.length - 1]! }
    }
  }
  return { kind: 'skip' }
}

/** Configured placement: `css.contexts` patterns such as `[data-theme=dark]` or `@media (prefers-color-scheme: dark) :root`. */
function configuredPlacement(
  selectors: string[],
  atRules: string[],
  contexts: Record<string, Record<string, string[]>>,
): Placement | undefined {
  const sels = selectors.map(norm)
  for (const [modifier, ctxs] of Object.entries(contexts)) {
    for (const [context, patterns] of Object.entries(ctxs)) {
      for (const pattern of patterns) {
        const m = /^(@\w+\s*\([^)]*\))?\s*(.*)$/.exec(pattern.trim())!
        const atPart = m[1] ? norm(m[1].replace(/^@(\w+)\s*/, '@$1 ')) : undefined
        const selPart = m[2] ? norm(m[2]) : undefined
        const atOk = atPart ? atRules.includes(atPart) : atRules.length === 0
        const selOk = selPart
          ? sels.includes(selPart)
          : sels.some((s) => ROOT_LIKE.test(s.replace(/\s+/g, '')))
        if (atOk && selOk) return { kind: 'context', modifier, context }
      }
    }
  }
  return undefined
}

/**
 * CSS custom properties → token system (spec section 4.3). Root-like rules form the base set;
 * theme selectors and `prefers-color-scheme` become a `theme`-style modifier; other media queries
 * become independent on/off modifiers. Scoped variables (e.g. `.button { --x }`) are not tokens.
 */
export const cssTokens: TokenAdapter = {
  name: 'tokens-css',

  async detect(source: Source, config: ScanConfig): Promise<string[]> {
    const exclude = excludeFor(config, 'css')
    const files = (await source.list(config.css?.include ?? ['**/*.css'])).filter(
      (p) => !matchGlob(p, exclude),
    )
    if (config.css?.include) return files
    await prefetch(source, files)
    const out: string[] = []
    for (const f of files) {
      const text = await source.readText(f)
      // Theme files may hold only a class rule (`.dark, .dark-theme { … }`).
      if (
        /--[\w-]+\s*:/.test(text) &&
        /(:root|html|:host|\[data-|prefers-color-scheme|\.(dark|light)\b|\.theme-|-theme\b)/.test(text)
      )
        out.push(f)
    }
    return out
  },

  async load(source: Source, files: string[], config: ScanConfig, diag: DiagnosticBag): Promise<TokenSystem> {
    const configured = config.css?.contexts
    const base: TokenDocument[] = []
    const modifiers = new Map<string, { contexts: Map<string, TokenDocument[]>; boolean: boolean }>()
    const orderOfModifiers: string[] = []
    await prefetch(source, files)

    for (const file of [...files].sort()) {
      let root: postcss.Root
      try {
        root = postcss.parse(await source.readText(file), { from: file })
      } catch (e) {
        diag.error('css/parse-error', (e as Error).message, { file })
        continue
      }
      const baseTree: Record<string, unknown> = {}
      const contextTrees = new Map<string, Record<string, unknown>>()
      let skipped = 0

      root.walkDecls((decl) => {
        if (!decl.prop.startsWith('--')) return
        const rule = decl.parent
        if (rule?.type !== 'rule') {
          skipped++
          return
        }
        const selectors = (rule as postcss.Rule).selectors
        const atRules = atRulesOf(decl)
        const placement =
          (configured && configuredPlacement(selectors, atRules, configured)) ??
          (configured
            ? selectors.some((s) => ROOT_LIKE.test(s.replace(/\s+/g, ''))) && atRules.length === 0
              ? { kind: 'base' as const }
              : { kind: 'skip' as const }
            : autoPlacement(selectors, atRules))
        if (placement.kind === 'skip') {
          skipped++
          return
        }
        const id = idFromCustomProperty(decl.prop)
        const entry = cssValueToToken(decl.prop, decl.value)
        const token: Record<string, unknown> = {
          $value: entry.$value,
          $extensions: { 'dev.dsgraph': { css: decl.prop } },
        }
        if (entry.$type) {
          token.$type = entry.$type
          ;(token.$extensions as Record<string, Record<string, unknown>>)['dev.dsgraph']!.typeInferred = true
        }
        if (placement.kind === 'base') baseTree[id] = token
        else {
          if (!modifiers.has(placement.modifier)) {
            modifiers.set(placement.modifier, { contexts: new Map(), boolean: placement.boolean ?? false })
            orderOfModifiers.push(placement.modifier)
          }
          const key = `${placement.modifier}\u0000${placement.context}`
          const tree = contextTrees.get(key) ?? {}
          tree[id] = token
          contextTrees.set(key, tree)
        }
      })

      if (skipped > 0)
        diag.info(
          'css/scoped-variable',
          `${skipped} custom properties outside root or theme selectors are not tokens`,
          { file },
        )
      if (Object.keys(baseTree).length > 0) base.push({ file, tree: baseTree })
      for (const [key, tree] of contextTrees) {
        const [modifier, context] = key.split('\u0000') as [string, string]
        const m = modifiers.get(modifier)!
        m.contexts.set(context, [...(m.contexts.get(context) ?? []), { file, tree }])
      }
    }

    const system: TokenSystem = {
      sets: new Map([['base', base]]),
      modifiers: new Map(),
      order: [{ kind: 'set', name: 'base' }],
      synthetic: true,
      kind: 'css',
    }
    for (const name of orderOfModifiers) {
      const m = modifiers.get(name)!
      const contexts = new Map<string, TokenDocument[]>()
      let defaultContext: string
      if (m.boolean) {
        contexts.set('off', [])
        contexts.set('on', m.contexts.get('on') ?? [])
        defaultContext = 'off'
      } else if (configured?.[name]) {
        for (const ctx of Object.keys(configured[name]!)) contexts.set(ctx, m.contexts.get(ctx) ?? [])
        defaultContext = Object.keys(configured[name]!)[0]!
      } else {
        // The base set plays the role of the context that has no overrides.
        defaultContext = m.contexts.has('light') ? 'light' : 'default'
        if (!m.contexts.has(defaultContext)) contexts.set(defaultContext, [])
        for (const [ctx, docs] of m.contexts) contexts.set(ctx, docs)
      }
      system.modifiers.set(name, { contexts, default: defaultContext })
      system.order.push({ kind: 'modifier', name })
    }
    if (base.length === 0 && modifiers.size === 0)
      diag.warn('tokens/no-files', 'No CSS custom properties found in root or theme selectors')
    return system
  },
}
