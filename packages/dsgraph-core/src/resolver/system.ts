import type { Modifier } from '@dsgraph/schema'
import type { DiagnosticBag } from '../diagnostics.js'
import { isPlainObject } from '../path.js'
import { getAt, parsePointer, toPointer } from '../pointer.js'

/** A token document as loaded from a source: a file or an inline object inside a resolver. */
export interface TokenDocument {
  file: string
  tree: unknown
}

export interface ModifierDef {
  contexts: Map<string, TokenDocument[]>
  default?: string
  description?: string
}

/** Internal model: every token source is represented as a Resolver 2025.10 system. */
export interface TokenSystem {
  sets: Map<string, TokenDocument[]>
  modifiers: Map<string, ModifierDef>
  order: Array<{ kind: 'set' | 'modifier'; name: string }>
  synthetic: boolean
  file?: string
}

export type Input = Record<string, string>

/** Wraps plain token files into a synthetic system with one set and no modifiers. */
export function systemFromDocuments(docs: TokenDocument[]): TokenSystem {
  return {
    sets: new Map([['default', docs]]),
    modifiers: new Map(),
    order: [{ kind: 'set', name: 'default' }],
    synthetic: true,
  }
}

const ACCEPTED_VERSIONS = new Set(['2025.10', '2025-10-01', '2025-11-01'])

export function dirname(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}

export function joinPath(base: string, rel: string): string {
  const parts = (base ? `${base}/${rel}` : rel).split('/')
  const out: string[] = []
  for (const p of parts) {
    if (p === '' || p === '.') continue
    if (p === '..') out.pop()
    else out.push(p)
  }
  return out.join('/')
}

/**
 * Parses a resolver document (Resolver 2025.10). Tolerant of known inconsistencies in the
 * specification itself (version spelled as a date, `context` instead of `contexts`).
 */
export async function systemFromResolver(
  tree: unknown,
  file: string,
  load: (path: string) => Promise<unknown>,
  diag: DiagnosticBag,
): Promise<TokenSystem> {
  const system: TokenSystem = { sets: new Map(), modifiers: new Map(), order: [], synthetic: false, file }
  const at = (pointer: string) => ({ file, pointer })
  if (!isPlainObject(tree)) {
    diag.error('resolver/invalid-document', 'A resolver document must be a JSON object', at(''))
    return system
  }

  if (tree.version === undefined)
    diag.error('resolver/missing-version', 'Resolver must declare "version"', at(''))
  else if (!ACCEPTED_VERSIONS.has(String(tree.version)))
    diag.warn(
      'resolver/unknown-version',
      `Unknown resolver version "${String(tree.version)}"`,
      at('/version'),
    )
  else if (tree.version !== '2025.10')
    diag.info('resolver/version-date', `Version "${String(tree.version)}" is read as 2025.10`, at('/version'))

  const fileCache = new Map<string, unknown>()
  const loadFile = async (path: string): Promise<unknown> => {
    if (!fileCache.has(path)) fileCache.set(path, await load(path))
    return fileCache.get(path)
  }

  const sourcesOf = async (
    items: unknown,
    pointer: string,
    allowSetRefs: boolean,
  ): Promise<TokenDocument[]> => {
    if (!Array.isArray(items)) {
      diag.error('resolver/invalid-sources', 'Sources must be an array', at(pointer))
      return []
    }
    const docs: TokenDocument[] = []
    for (const [i, item] of items.entries()) {
      const p = `${pointer}/${i}`
      if (!isPlainObject(item)) {
        diag.error(
          'resolver/invalid-source',
          'Each source must be a reference object or inline tokens',
          at(p),
        )
        continue
      }
      if (typeof item.$ref !== 'string') {
        docs.push({ file: `${file}#${p}`, tree: item })
        continue
      }
      const { $ref, ...siblings } = item
      const ref = $ref as string
      if (ref.startsWith('#')) {
        const segs = parsePointer(ref)
        if (!segs) {
          diag.error('resolver/invalid-pointer', `Malformed pointer "${ref}"`, at(p))
          continue
        }
        if (segs[0] === 'modifiers' || segs[0] === 'resolutionOrder') {
          diag.error('resolver/invalid-pointer', `Sources must not reference "${ref}"`, at(p))
          continue
        }
        if (segs[0] === 'sets' && segs.length === 2) {
          if (!allowSetRefs) continue
          const set = isPlainObject(tree.sets) ? tree.sets[segs[1]!] : undefined
          if (!isPlainObject(set)) diag.error('resolver/invalid-pointer', `Set "${segs[1]}" not found`, at(p))
          else docs.push(...(await sourcesOf(set.sources, toPointer(['sets', segs[1]!, 'sources']), false)))
          continue
        }
        const found = getAt(tree, segs)
        if (!found.found) diag.error('resolver/invalid-pointer', `"${ref}" not found`, at(p))
        else docs.push({ file: `${file}#${toPointer(segs)}`, tree: override(found.value, siblings) })
        continue
      }
      if (/^[a-z]+:\/\//i.test(ref)) {
        diag.warn('resolver/remote-unsupported', `Remote source "${ref}" is not loaded`, at(p))
        continue
      }
      const [filePart, fragment] = ref.split('#') as [string, string | undefined]
      const path = joinPath(dirname(file), filePart)
      let content: unknown
      try {
        content = await loadFile(path)
      } catch (e) {
        diag.error('resolver/source-not-found', `Cannot load "${path}": ${(e as Error).message}`, at(p))
        continue
      }
      if (fragment !== undefined) {
        const segs = parsePointer(fragment.startsWith('/') ? fragment : `/${fragment}`)
        const found = segs ? getAt(content, segs) : { found: false, value: undefined }
        if (!found.found) {
          diag.error('resolver/invalid-pointer', `"${ref}" not found`, at(p))
          continue
        }
        content = found.value
      }
      docs.push({
        file: fragment !== undefined ? `${path}#${fragment}` : path,
        tree: override(content, siblings),
      })
    }
    return docs
  }

  const defineSet = async (name: string, def: unknown, pointer: string) => {
    if (!isPlainObject(def)) {
      diag.error('resolver/invalid-set', `Set "${name}" must be an object`, at(pointer))
      return
    }
    system.sets.set(name, await sourcesOf(def.sources, `${pointer}/sources`, true))
  }

  const defineModifier = async (name: string, def: unknown, pointer: string) => {
    if (!isPlainObject(def)) {
      diag.error('resolver/invalid-modifier', `Modifier "${name}" must be an object`, at(pointer))
      return
    }
    let contexts = def.contexts
    let key = 'contexts'
    if (contexts === undefined && def.context !== undefined) {
      contexts = def.context
      key = 'context'
      diag.warn(
        'resolver/context-typo',
        `Modifier "${name}" uses "context"; the property is "contexts"`,
        at(pointer),
      )
    }
    if (!isPlainObject(contexts) || Object.keys(contexts).length === 0) {
      diag.error('resolver/no-contexts', `Modifier "${name}" must declare at least one context`, at(pointer))
      return
    }
    if (Object.keys(contexts).length === 1)
      diag.warn(
        'resolver/single-context',
        `Modifier "${name}" has a single context; use a set instead`,
        at(pointer),
      )
    const m: ModifierDef = { contexts: new Map() }
    for (const [ctx, items] of Object.entries(contexts))
      m.contexts.set(ctx, await sourcesOf(items, `${pointer}/${key}/${ctx}`, true))
    if (def.default !== undefined) {
      if (typeof def.default === 'string' && m.contexts.has(def.default)) m.default = def.default
      else
        diag.error(
          'resolver/invalid-default',
          `Default "${String(def.default)}" is not a context of "${name}"`,
          at(pointer),
        )
    }
    if (typeof def.description === 'string') m.description = def.description
    system.modifiers.set(name, m)
  }

  const setDefs = isPlainObject(tree.sets) ? tree.sets : {}
  const modifierDefs = isPlainObject(tree.modifiers) ? tree.modifiers : {}

  let order = tree.resolutionOrder
  if (!Array.isArray(order)) {
    diag.error('resolver/missing-resolution-order', 'Resolver must declare "resolutionOrder"', at(''))
    order = [
      ...Object.keys(setDefs).map((n) => ({ $ref: `#/sets/${n}` })),
      ...Object.keys(modifierDefs).map((n) => ({ $ref: `#/modifiers/${n}` })),
    ]
  }
  const seen = new Set<string>()
  for (const [i, item] of (order as unknown[]).entries()) {
    const p = `/resolutionOrder/${i}`
    if (!isPlainObject(item)) {
      diag.error('resolver/invalid-order-item', 'Resolution order items must be objects', at(p))
      continue
    }
    let kind: 'set' | 'modifier' | undefined
    let name: string | undefined
    if (typeof item.$ref === 'string') {
      const segs = parsePointer(item.$ref)
      if (segs && segs.length === 2 && (segs[0] === 'sets' || segs[0] === 'modifiers')) {
        kind = segs[0] === 'sets' ? 'set' : 'modifier'
        name = segs[1]!
        const defs = kind === 'set' ? setDefs : modifierDefs
        if (!(name in defs)) {
          diag.error('resolver/invalid-pointer', `"${item.$ref}" not found`, at(p))
          continue
        }
        if (kind === 'set' && !system.sets.has(name)) await defineSet(name, defs[name], `/sets/${name}`)
        if (kind === 'modifier' && !system.modifiers.has(name))
          await defineModifier(name, defs[name], `/modifiers/${name}`)
      } else {
        diag.error('resolver/invalid-pointer', `Resolution order must reference a set or modifier`, at(p))
        continue
      }
    } else if ((item.type === 'set' || item.type === 'modifier') && typeof item.name === 'string') {
      kind = item.type
      name = item.name
      if (kind === 'set') await defineSet(name, item, p)
      else await defineModifier(name, item, p)
    } else {
      diag.error('resolver/invalid-order-item', 'Inline items need "type" (set | modifier) and "name"', at(p))
      continue
    }
    if (seen.has(name))
      diag.error('resolver/duplicate-name', `"${name}" appears twice in resolutionOrder`, at(p))
    seen.add(name)
    system.order.push({ kind, name })
  }
  return system
}

function override(value: unknown, siblings: Record<string, unknown>): unknown {
  if (Object.keys(siblings).length === 0 || !isPlainObject(value)) return value
  return { ...value, ...siblings }
}

/** Modifiers in resolution order with contexts in declaration order. */
export function modifiersOf(system: TokenSystem): Modifier[] {
  const out: Modifier[] = []
  for (const item of system.order) {
    if (item.kind !== 'modifier') continue
    const m = system.modifiers.get(item.name)
    if (!m) continue
    const mod: Modifier = { name: item.name, contexts: [...m.contexts.keys()] }
    if (m.default) mod.default = m.default
    out.push(mod)
  }
  return out
}

/** Cartesian product of all modifier contexts, deterministic order. */
export function enumerateInputs(modifiers: readonly Modifier[]): Input[] {
  let inputs: Input[] = [{}]
  for (const m of modifiers) inputs = inputs.flatMap((i) => m.contexts.map((c) => ({ ...i, [m.name]: c })))
  return inputs
}

export function defaultInput(modifiers: readonly Modifier[], configured: Input = {}): Input {
  const input: Input = {}
  for (const m of modifiers) {
    const c = configured[m.name]
    input[m.name] = c !== undefined && m.contexts.includes(c) ? c : (m.default ?? m.contexts[0]!)
  }
  return input
}

/** Validates an input (Resolver 2025.10 section 6.1); context names are matched case-insensitively. */
export function validateInput(
  modifiers: readonly Modifier[],
  input: Input,
  diag: DiagnosticBag,
): Input | null {
  let ok = true
  const out: Input = {}
  const byLower = new Map(modifiers.map((m) => [m.name.toLowerCase(), m]))
  for (const [key, value] of Object.entries(input)) {
    const m = byLower.get(key.toLowerCase())
    if (!m) {
      diag.error('resolver/invalid-input', `Unknown modifier "${key}"`)
      ok = false
      continue
    }
    if (typeof value !== 'string') {
      diag.error('resolver/invalid-input', `Input values must be strings ("${key}")`)
      ok = false
      continue
    }
    const ctx = m.contexts.find((c) => c.toLowerCase() === value.toLowerCase())
    if (!ctx) {
      diag.error('resolver/invalid-input', `Invalid context "${value}" for modifier "${m.name}"`)
      ok = false
      continue
    }
    out[m.name] = ctx
  }
  for (const m of modifiers) {
    if (out[m.name] !== undefined) continue
    if (m.default !== undefined) out[m.name] = m.default
    else {
      diag.error('resolver/invalid-input', `Missing modifier "${m.name}"`)
      ok = false
    }
  }
  return ok ? out : null
}

/** Documents for an input, in resolution order. */
export function selectDocuments(system: TokenSystem, input: Input): TokenDocument[] {
  const docs: TokenDocument[] = []
  for (const item of system.order) {
    if (item.kind === 'set') docs.push(...(system.sets.get(item.name) ?? []))
    else {
      const m = system.modifiers.get(item.name)
      const ctx = input[item.name]
      if (m && ctx !== undefined) docs.push(...(m.contexts.get(ctx) ?? []))
    }
  }
  return docs
}
