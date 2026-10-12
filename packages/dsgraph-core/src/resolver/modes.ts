import type { DiagnosticBag } from '../diagnostics.js'
import { isPlainObject } from '../path.js'
import type { ModifierDef, TokenDocument, TokenSystem } from './system.js'

interface ModeToken {
  path: string[]
  token: Record<string, unknown>
  modes: Record<string, unknown>
}

const THEME_WORDS = new Set(['light', 'dark'])

/** The token without `mode` in its extensions (and without empty extensions left behind). */
function withoutModes(token: Record<string, unknown>): Record<string, unknown> {
  const { $extensions, ...rest } = token
  if (!isPlainObject($extensions)) return token
  const { mode: _mode, ...ext } = $extensions
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
    if (!isPlainObject(ext) || !isPlainObject(ext.mode)) return tree
    if (Object.keys(ext.mode).length > 1) found.push({ path, token: withoutModes(tree), modes: ext.mode })
    return withoutModes(tree)
  }
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(tree)) out[k] = k.startsWith('$') ? v : strip(v, found, [...path, k])
  return out
}

/**
 * Modes written per token in `$extensions.mode` (`{ "light": …, "dark": … }`), as Figma variable
 * exports and Terrazzo write them, become modifiers. Tokens that share the same mode names share a
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
  const groups: Array<{ modes: string[]; roots: Set<string> }> = []
  const groupOf = (modes: string[]) => {
    let g = groups.find((x) => modes.every((m) => x.modes.includes(m)))
    if (!g) {
      g = { modes, roots: new Set() }
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
      tokenGroup.set(t, g)
    }

  const out: TokenSystem = { ...system, sets, modifiers: new Map(), order: [...system.order] }
  const names: string[] = []
  for (const g of groups) {
    let name = g.modes.some((m) => THEME_WORDS.has(m.toLowerCase()))
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
