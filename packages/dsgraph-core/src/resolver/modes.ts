import type { DiagnosticBag } from '../diagnostics.js'
import { isPlainObject } from '../path.js'
import type { ModifierDef, TokenDocument, TokenSystem } from './system.js'

interface ModeToken {
  path: string[]
  token: Record<string, unknown>
  modes: Record<string, unknown>
}

const THEME_WORDS = new Set(['light', 'dark'])

/**
 * The Figma collection a token says it was exported from: `com.figma.collection`, or a
 * `figma.collection.name` some exporters write. Empty when it says none.
 */
function collectionOf(token: Record<string, unknown>): string {
  const ext = token.$extensions as Record<string, unknown> | undefined
  const own = ext?.['com.figma.collection']
  if (typeof own === 'string') return own
  const figma = ext?.figma as { collection?: { name?: unknown } } | undefined
  return typeof figma?.collection?.name === 'string' ? figma.collection.name : ''
}

/** The context a token's own `$value` stands for when `modes` lists only the overrides. */
const BASE_MODE = 'default'

/** The token without `mode` or `modes` in its extensions (and without empty extensions left behind). */
function withoutModes(token: Record<string, unknown>): Record<string, unknown> {
  const { $extensions, ...rest } = token
  if (!isPlainObject($extensions)) return token
  const { mode: _mode, modes: _modes, ...ext } = $extensions
  return Object.keys(ext).length > 0 ? { ...rest, $extensions: ext } : rest
}

function setAt(tree: Record<string, unknown>, path: string[], value: unknown): void {
  let node = tree
  for (const seg of path.slice(0, -1)) {
    if (!isPlainObject(node[seg])) node[seg] = {}
    node = node[seg] as Record<string, unknown>
  }
  node[path[path.length - 1]!] = value
}

/** Copies the document without `mode` extensions and collects the tokens that had them. */
function strip(tree: unknown, found: ModeToken[], path: string[] = []): unknown {
  if (!isPlainObject(tree)) return tree
  if (Object.hasOwn(tree, '$value')) {
    const ext = tree.$extensions
    if (!isPlainObject(ext)) return tree
    // `mode` lists every mode; `modes` only the ones that differ, the token's own value being the rest.
    const modes = isPlainObject(ext.mode)
      ? ext.mode
      : isPlainObject(ext.modes) && Object.keys(ext.modes).length > 0
        ? { [BASE_MODE]: tree.$value, ...ext.modes }
        : undefined
    if (!modes) return tree
    if (Object.keys(modes).length > 1) found.push({ path, token: withoutModes(tree), modes })
    return withoutModes(tree)
  }
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(tree)) out[k] = k.startsWith('$') ? v : strip(v, found, [...path, k])
  return out
}

/**
 * Modes written per token in `$extensions.mode` (`{ "light": …, "dark": … }`), as Figma variable
 * exports and some build tools write them, become modifiers; so do `$extensions.modes` that list
 * only the modes where a value differs (`{ "mobile": … }`), the token's own value then being the
 * `default` context. Tokens that share the same mode names share a
 * modifier; it is called `theme` for light and dark, otherwise after the top-level group (a Figma
 * collection) its tokens live in. Systems that already have modifiers are left as they are.
 */
export function expandModes(system: TokenSystem, diag: DiagnosticBag): TokenSystem {
  if (system.modifiers.size > 0) return system
  const sets = new Map<string, TokenDocument[]>()
  const byDoc: Array<{ file: string; tokens: ModeToken[] }> = []
  for (const [name, docs] of system.sets) {
    sets.set(
      name,
      docs.map((d) => {
        const tokens: ModeToken[] = []
        const tree = strip(d.tree, tokens)
        if (tokens.length > 0) byDoc.push({ file: d.file, tokens })
        return { file: d.file, tree }
      }),
    )
  }
  if (byDoc.length === 0) return system

  // Tokens with the same modes share a modifier; a token whose modes are a subset of another
  // token's (light and dark next to light, dark and wireframe) joins the larger one and keeps its
  // base value in the modes it leaves out.
  const signatures = new Map<string, string[]>()
  for (const { tokens } of byDoc)
    for (const t of tokens) {
      const modes = Object.keys(t.modes)
      signatures.set(modes.join('\u0000'), modes)
    }
  const larger = [...signatures.values()].sort((a, b) => b.length - a.length)
  const groups: Array<{ modes: string[]; roots: Set<string>; collections: Set<string> }> = []
  const groupOf = (modes: string[]) => {
    let g = groups.find((x) => modes.every((m) => x.modes.includes(m)))
    if (!g) {
      g = { modes, roots: new Set(), collections: new Set() }
      groups.push(g)
    }
    return g
  }
  for (const modes of larger) groupOf(modes)
  const tokenGroup = new Map<ModeToken, (typeof groups)[number]>()
  for (const { tokens } of byDoc)
    for (const t of tokens) {
      const g = groupOf(Object.keys(t.modes))
      // The top-level group names the modifier (a Figma collection); a top-level token does not.
      g.roots.add(t.path.length > 1 ? t.path[0]! : '')
      g.collections.add(collectionOf(t.token))
      tokenGroup.set(t, g)
    }

  const out: TokenSystem = { ...system, sets, modifiers: new Map(), order: [...system.order] }
  const names: string[] = []
  for (const g of groups) {
    // The collection its tokens say they come from names it first, as the exporter wrote it.
    const collection = g.collections.size === 1 ? [...g.collections][0] : ''
    let name = collection
      ? collection
      : g.modes.some((m) => THEME_WORDS.has(m.toLowerCase()))
        ? 'theme'
        : g.roots.size === 1 && [...g.roots][0]
          ? [...g.roots][0]!
          : 'mode'
    for (let i = 2; names.includes(name); i++) name = `${name.replace(/-\d+$/, '')}-${i}`
    names.push(name)
    const contexts = new Map<string, TokenDocument[]>()
    for (const mode of g.modes) {
      const docs: TokenDocument[] = []
      for (const { file, tokens } of byDoc) {
        const tree: Record<string, unknown> = {}
        for (const t of tokens)
          if (tokenGroup.get(t) === g && Object.hasOwn(t.modes, mode))
            setAt(tree, t.path, { ...t.token, $value: t.modes[mode] })
        if (Object.keys(tree).length > 0) docs.push({ file, tree })
      }
      contexts.set(mode, docs)
    }
    const def: ModifierDef = { contexts, default: g.modes[0]! }
    out.modifiers.set(name, def)
    out.order.push({ kind: 'modifier', name })
    diag.info('tokens/modes-from-extensions', `Modes per token: ${name} (${g.modes.join(', ')})`)
  }
  return out
}

const stem = (file: string) =>
  file.slice(file.lastIndexOf('/') + 1).replace(/\.(tokens\.json|tokens|json5?)$/i, '')
const dirOf = (file: string) => (file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '')

function tokenIds(tree: unknown, path: string[] = [], out = new Set<string>()): Set<string> {
  if (!isPlainObject(tree)) return out
  if (Object.hasOwn(tree, '$value')) out.add(path.join('.'))
  else for (const [k, v] of Object.entries(tree)) if (!k.startsWith('$')) tokenIds(v, [...path, k], out)
  return out
}

/**
 * Files side by side that define the same tokens are modes of one collection, as Figma exports
 * write them (`Colors/Light.tokens.json`, `Colors/Dark.tokens.json`): one modifier per folder,
 * a context per file. Undefined when no folder looks like that.
 */
export function systemFromModeFiles(docs: TokenDocument[], diag: DiagnosticBag): TokenSystem | undefined {
  const byDir = new Map<string, TokenDocument[]>()
  for (const d of docs) byDir.set(dirOf(d.file), [...(byDir.get(dirOf(d.file)) ?? []), d])
  const groups: Array<{ dir: string; docs: TokenDocument[] }> = []
  for (const [dir, list] of byDir) {
    if (list.length < 2) continue
    const ids = list.map((d) => tokenIds(d.tree))
    const first = ids[0]!
    if (first.size === 0) continue
    const same = ids.every((s) => {
      let common = 0
      for (const id of s) if (first.has(id)) common++
      return common / (s.size + first.size - common) >= 0.8
    })
    if (same) groups.push({ dir, docs: list })
  }
  if (!groups.length) return undefined
  const inGroup = new Set(groups.flatMap((g) => g.docs))
  const system: TokenSystem = {
    sets: new Map([['base', docs.filter((d) => !inGroup.has(d))]]),
    modifiers: new Map(),
    order: [{ kind: 'set', name: 'base' }],
    synthetic: true,
  }
  for (const g of groups) {
    const contexts = g.docs.map((d) => stem(d.file))
    let name = contexts.some((c) => THEME_WORDS.has(c.toLowerCase())) ? 'theme' : stem(g.dir) || 'mode'
    for (let i = 2; system.modifiers.has(name); i++) name = `${name.replace(/-\d+$/, '')}-${i}`
    const light = contexts.find((c) => c.toLowerCase() === 'light')
    system.modifiers.set(name, {
      contexts: new Map(g.docs.map((d) => [stem(d.file), [d]])),
      default: light ?? contexts[0]!,
    })
    system.order.push({ kind: 'modifier', name })
    diag.info(
      'tokens/mode-files',
      `Files in ${g.dir || 'the root'} are modes of one collection: ${name} (${contexts.join(', ')})`,
    )
  }
  return system
}
