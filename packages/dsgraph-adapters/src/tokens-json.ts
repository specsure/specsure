import {
  type DiagnosticBag,
  excludeFor,
  matchGlob,
  NOT_TOKENS,
  parseJsonLenient,
  prefetch,
  type ScanConfig,
  type Source,
  type TokenAdapter,
  type TokenDocument,
  type TokenSystem,
} from '@dsgraph/core'
import {
  type Conversion,
  convertValue,
  type Dialect,
  groupType,
  normalizeRefs,
  STUDIO_ONLY_TYPES,
} from './json-values.js'

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

const base = (p: string) => p.slice(p.lastIndexOf('/') + 1)
const dir = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')
const META = /(^|\/)\$(themes|metadata)\.json$/

/** `{ value }` without `$`: a token as Tokens Studio and Style Dictionary write it. */
function isLegacyToken(o: Record<string, unknown>): boolean {
  if (!Object.hasOwn(o, 'value') || Object.hasOwn(o, '$value')) return false
  const v = o.value
  return 'type' in o || !isObj(v) || !Object.values(v).every(isObj)
}

/** A token whose values per mode sit under `sets`: `{ "sets": { "light": { "value" }, "dark": … } }`. */
function isSetToken(o: Record<string, unknown>): boolean {
  if (Object.hasOwn(o, 'value') || Object.hasOwn(o, '$value') || !isObj(o.sets)) return false
  const sets = Object.values(o.sets)
  return sets.length > 0 && sets.every((v) => isObj(v) && (Object.hasOwn(v, 'value') || isSetToken(v)))
}
const isToken = (o: Record<string, unknown>) =>
  Object.hasOwn(o, '$value') || isLegacyToken(o) || isSetToken(o)

/** A type named by the token's `$schema` link (`…/token-types/color.json`); aliases and sets have none. */
function schemaType(o: Record<string, unknown>): string | undefined {
  const m = typeof o.$schema === 'string' ? /token-types\/([\w-]+)\.json$/.exec(o.$schema) : null
  return m && m[1] !== 'alias' && !m[1]!.endsWith('-set') ? m[1] : undefined
}

/** Leaves of `sets`, nested sets joined with ` / `. */
function setLeaves(o: Record<string, unknown>, prefix = ''): Array<[string, Record<string, unknown>]> {
  const out: Array<[string, Record<string, unknown>]> = []
  for (const [name, v] of Object.entries(o.sets as Record<string, Record<string, unknown>>)) {
    const mode = prefix ? `${prefix} / ${name}` : name
    if (isSetToken(v)) out.push(...setLeaves(v, mode))
    else out.push([mode, v])
  }
  return out
}

/** A `sets` token as one token with its values per mode in `$extensions.mode`. */
function fromSets(o: Record<string, unknown>): Record<string, unknown> {
  const leaves = setLeaves(o)
  const { sets: _sets, ...rest } = o
  const type =
    schemaType(o) ?? leaves.map(([, l]) => l.type ?? schemaType(l)).find((t) => typeof t === 'string')
  const token: Record<string, unknown> = { ...rest, value: leaves[0]![1].value }
  if (type) token.type = type
  const ext = isObj(o.$extensions) ? o.$extensions : {}
  token.$extensions = { ...ext, mode: Object.fromEntries(leaves.map(([m, l]) => [m, l.value])) }
  return token
}

interface Survey {
  legacy: number
  dtcg: number
  studioTypes: number
  /** Tokens with a type of their own or from a group. */
  typed: number
  /** Literal values (no references), to tell alternative exports of the same tokens. */
  values: Set<string>
  /** Token paths, to tell a copy in the same format from a different file. */
  ids: Set<string>
}

const newSurvey = (): Survey => ({
  legacy: 0,
  dtcg: 0,
  typed: 0,
  studioTypes: 0,
  values: new Set(),
  ids: new Set(),
})

function survey(node: unknown, s: Survey, inheritsType = false, path: string[] = []): void {
  if (!isObj(node)) return
  const tree = isSetToken(node) ? fromSets(node) : node
  if (isToken(tree)) {
    const dollar = Object.hasOwn(tree, '$value')
    if (dollar) s.dtcg++
    else s.legacy++
    // The token's own type as written; a type taken from `$schema` or `sets` is not Tokens Studio's.
    const own = node.type ?? node.$type
    if (typeof own === 'string' || inheritsType || schemaType(tree)) s.typed++
    if (typeof own === 'string' && STUDIO_ONLY_TYPES.has(own)) s.studioTypes++
    const v = dollar ? tree.$value : tree.value
    if ((typeof v === 'string' && !v.includes('{')) || typeof v === 'number')
      s.values.add(String(v).trim().toLowerCase())
    s.ids.add(path.join('.'))
    return
  }
  const groupType = typeof tree.$type === 'string'
  if (groupType && STUDIO_ONLY_TYPES.has(tree.$type as string)) s.studioTypes++
  for (const [k, v] of Object.entries(tree))
    if (!k.startsWith('$')) survey(v, s, inheritsType || groupType, [...path, k])
}

/** JSON Schema documents describe tokens; they are not tokens. */
const isJsonSchema = (tree: unknown): boolean =>
  isObj(tree) &&
  ((typeof tree.$schema === 'string' && /json-schema\.org/.test(tree.$schema)) ||
    (isObj(tree.properties) && ('type' in tree || 'allOf' in tree || '$id' in tree)))

interface Loaded {
  file: string
  tree: unknown
}

async function readAll(source: Source, config: ScanConfig, diag?: DiagnosticBag): Promise<Loaded[]> {
  const exclude = excludeFor(config, 'tokens')
  const files = (await source.list(config.tokens?.include ?? ['**/*.json', '**/*.json5']))
    .filter(
      (p) => /\.(json5?|tokens)$/i.test(p) && !matchGlob(p, exclude) && (META.test(p) || !NOT_TOKENS.test(p)),
    )
    .sort()
    .slice(0, 2000)
  const out: Loaded[] = []
  await prefetch(source, files)
  for (const file of files) {
    const text = await source.readText(file)
    if (!META.test(file) && !/["']?\$?value["']?\s*:|"sets"\s*:/.test(text)) continue
    try {
      const tree = parseJsonLenient(text).value
      if (isJsonSchema(tree)) continue
      out.push({ file, tree })
    } catch (e) {
      diag?.error('tokens/invalid-json', (e as Error).message, { file })
    }
  }
  return out
}

const hasMarkers = (f: Loaded) =>
  META.test(f.file) || (isObj(f.tree) && ('$themes' in f.tree || '$metadata' in f.tree))

/**
 * Which tool wrote these files, or undefined for typed DTCG (left to the core). DTCG syntax
 * without any `$type` is read like Style Dictionary: types come from names and values.
 */
function dialectOf(files: Loaded[]): Dialect | undefined {
  const s = newSurvey()
  for (const f of files) survey(f.tree, s)
  // Only a single exported file keeps its token sets as top-level keys.
  const tokenFiles = files.filter((f) => !hasMarkers(f))
  const setsAtTop =
    tokenFiles.length === 1 && isObj(tokenFiles[0]!.tree) && topLevelAreSets(tokenFiles[0]!.tree)
  if (files.some(hasMarkers) || s.studioTypes > 0 || setsAtTop) return 'tokens-studio'
  if (s.legacy > 0) return 'style-dictionary'
  if (s.dtcg > 0 && s.typed === 0) return 'style-dictionary'
  return undefined
}

/** Prefer the export with the most typed tokens; then DTCG, Tokens Studio, Style Dictionary. */
function rankOf(s: Survey): number {
  const typed = Math.round((s.typed / Math.max(1, s.legacy + s.dtcg)) * 10)
  return typed * 10 + (s.studioTypes > 0 ? 3 : s.legacy > 0 ? 2 : 4)
}

const jaccard = (a: Set<string>, b: Set<string>): number => {
  let common = 0
  for (const v of a) if (b.has(v)) common++
  return common / (a.size + b.size - common)
}

/**
 * Two files are exports of the same tokens when they are about the same size, their literal
 * values mostly coincide, and they differ in format or repeat the same token names. Sibling
 * files of one system share many values (8px, 12px) but not their size, format and names.
 */
function alternatives(a: Survey, b: Survey): boolean {
  const na = a.legacy + a.dtcg
  const nb = b.legacy + b.dtcg
  if (Math.min(na, nb) / Math.max(na, nb) < 0.7) return false
  if (jaccard(a.values, b.values) < 0.5) return false
  const sameFormat = a.studioTypes > 0 === b.studioTypes > 0 && a.dtcg > 0 === b.dtcg > 0
  return !sameFormat || jaccard(a.ids, b.ids) >= 0.8
}

/**
 * Packages often ship the same tokens in several formats (`tokens.json`,
 * `figma-tokens.json`, `style-dictionary-tokens.json`). Files whose literal values mostly
 * coincide are alternatives: only the best-typed one is read.
 */
function pickExports(files: Loaded[], diag?: DiagnosticBag): Loaded[] {
  const info = files
    .filter((f) => !hasMarkers(f))
    .map((f) => {
      const s = newSurvey()
      survey(f.tree, s)
      return { f, s }
    })
    .filter((x) => x.s.values.size >= 10)
  if (info.length < 2 || info.length > 200) return files
  const parent = info.map((_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i]!
    return i
  }
  for (let i = 0; i < info.length; i++)
    for (let j = i + 1; j < info.length; j++)
      if (alternatives(info[i]!.s, info[j]!.s)) parent[find(i)] = find(j)
  const clusters = new Map<number, typeof info>()
  for (const [i, x] of info.entries()) clusters.set(find(i), [...(clusters.get(find(i)) ?? []), x])
  const dropped = new Set<string>()
  for (const list of clusters.values()) {
    if (list.length < 2) continue
    const [best, ...rest] = [...list].sort(
      (x, y) =>
        rankOf(y.s) - rankOf(x.s) ||
        y.s.legacy + y.s.dtcg - (x.s.legacy + x.s.dtcg) ||
        x.f.file.localeCompare(y.f.file),
    )
    for (const r of rest) dropped.add(r.f.file)
    diag?.info(
      'tokens/alternative-exports',
      `${rest.map((r) => `"${r.f.file}"`).join(', ')} repeat the tokens of "${best!.f.file}"; reading "${best!.f.file}"`,
    )
  }
  return files.filter((f) => !dropped.has(f.file))
}

const DTCG_PROPS = new Set(['$type', '$description', '$deprecated', '$extensions'])

/** Converts a token tree to DTCG 2025.10. Group types are carried down to convert values. */
function convertTree(
  tree: unknown,
  dialect: Dialect,
  unit: string,
  path: string[] = [],
  type?: string,
): unknown {
  if (!isObj(tree)) return tree
  const out: Record<string, unknown> = {}
  const inherited = typeof tree.$type === 'string' ? tree.$type : type
  for (const [k, v] of Object.entries(tree)) {
    if (k.startsWith('$')) {
      if (k === '$type' && typeof v === 'string') {
        const t = groupType(v)
        if (t) out.$type = t
      } else if (DTCG_PROPS.has(k)) out[k] = v
      continue
    }
    if (!isObj(v)) continue
    // Figma-style names are paths: `Dark/color.background.hovered` is a group chain.
    const segs = splitName(k)
    const at = [...path, ...segs]
    const converted = isToken(v)
      ? convertToken(v, at, dialect, unit, inherited)
      : convertTree(v, dialect, unit, at, inherited)
    place(out, segs, converted)
  }
  return out
}

/** `a/b.c` → `[a, b, c]`; decimal steps such as `0.5` stay whole. */
function splitName(key: string): string[] {
  if (!/[./]/.test(key)) return [key]
  return key
    .split('/')
    .flatMap((part) => (/^\d+\.\d+$/.test(part) ? [part] : part.split('.')))
    .filter((p) => p !== '')
}

/**
 * Puts a converted node at a path. Flat names can make one path both a token and a group
 * (`color.bg` and `color.bg.hovered`); the token then becomes the group's `$root`.
 */
function place(out: Record<string, unknown>, segs: string[], value: unknown): void {
  const isTok = (v: unknown): boolean => isObj(v) && '$value' in v
  let node = out
  for (const seg of segs.slice(0, -1)) {
    const cur = node[seg]
    if (isTok(cur)) node[seg] = { $root: cur }
    else if (!isObj(cur)) node[seg] = {}
    node = node[seg] as Record<string, unknown>
  }
  const last = segs[segs.length - 1]!
  const prev = node[last]
  if (!isObj(prev) || !isObj(value)) {
    node[last] = value
    return
  }
  const a = prev as Record<string, unknown>
  const b = value as Record<string, unknown>
  if (isTok(b) && !isTok(a)) node[last] = { ...a, $root: b }
  else if (!isTok(b) && isTok(a)) node[last] = { ...b, $root: a }
  else if (!isTok(b)) node[last] = { ...a, ...b }
  else node[last] = b
}

function convertToken(
  node: Record<string, unknown>,
  path: string[],
  dialect: Dialect,
  unit: string,
  inherited?: string,
): Record<string, unknown> {
  if (isSetToken(node)) node = fromSets(node)
  const dollar = Object.hasOwn(node, '$value')
  const raw = dollar ? node.$value : node.value
  const ownType = (dollar ? node.$type : node.type) ?? (dollar ? undefined : node.$type) ?? schemaType(node)
  const c: Conversion = { dialect, unit, expression: false }
  const sourceType = typeof ownType === 'string' ? ownType : inherited
  const { type, value, inferred } = convertValue(sourceType, raw, path, c)
  const token: Record<string, unknown> = { $value: value }
  // A type inherited from the group stays inherited unless conversion changed it.
  if (type && (typeof ownType === 'string' || type !== (inherited && groupType(inherited))))
    token.$type = type
  const description = node.$description ?? node.description ?? node.comment
  if (typeof description === 'string' && description !== '') token.$description = description
  const deprecated = node.$deprecated ?? node.deprecated
  if (typeof deprecated === 'boolean' || typeof deprecated === 'string') {
    const comment = node.deprecated_comment
    token.$deprecated = deprecated === true && typeof comment === 'string' ? comment : deprecated
  }

  const ext: Record<string, unknown> = {
    ...(isObj(node.extensions) ? node.extensions : {}),
    ...(isObj(node.$extensions) ? (normalizeRefs(node.$extensions) as Record<string, unknown>) : {}),
  }
  // Per-mode values (`$extensions.mode`) are values of the same token: converted the same way.
  if (isObj(ext.mode))
    ext.mode = Object.fromEntries(
      Object.entries(ext.mode).map(([m, v]) => [m, convertValue(type ?? sourceType, v, path, c).value]),
    )
  const dev: Record<string, unknown> = {}
  if (inferred) dev.typeInferred = true
  if (c.expression) dev.expression = { unit }
  if (sourceType && sourceType !== type) dev.sourceType = sourceType
  // A `uuid` stays when a token is renamed: the diff matches renames by it.
  if (typeof node.uuid === 'string' && node.uuid) dev.stableId = node.uuid
  const studio = ext['studio.tokens']
  if (isObj(studio) && isObj(studio.modify) && typeof studio.modify.type === 'string') {
    const m = studio.modify
    dev.colorModifier = { type: m.type, value: m.value, space: m.space, color: m.color }
  }
  if (Object.keys(dev).length > 0) ext['dev.dsgraph'] = dev
  if (Object.keys(ext).length > 0) token.$extensions = ext
  return token
}

interface Theme {
  name: string
  group: string
  sets: Map<string, string>
}

function themesOf(raw: unknown, diag: DiagnosticBag, file: string): Theme[] {
  if (!Array.isArray(raw)) return []
  const out: Theme[] = []
  for (const t of raw) {
    if (!isObj(t) || typeof t.name !== 'string') continue
    const sets = new Map<string, string>()
    if (isObj(t.selectedTokenSets))
      for (const [k, v] of Object.entries(t.selectedTokenSets)) if (typeof v === 'string') sets.set(k, v)
    out.push({ name: t.name, group: typeof t.group === 'string' && t.group ? t.group : 'theme', sets })
  }
  if (out.length === 0 && raw.length > 0)
    diag.warn('tokens-studio/invalid-themes', 'No usable themes found', { file })
  return out
}

/** Ids of tokens in a tree, prefixed by `prefix`. */
function tokenIds(tree: unknown, prefix: string[], out: Set<string>): void {
  if (!isObj(tree)) return
  for (const [k, v] of Object.entries(tree)) {
    if (k.startsWith('$') || !isObj(v)) continue
    if (isToken(v)) out.add([...prefix, k].join('.'))
    else tokenIds(v, [...prefix, k], out)
  }
}

function refsIn(v: unknown, out: string[]): void {
  if (typeof v === 'string')
    for (const m of v.matchAll(/\{([^{}]+)\}/g)) out.push(m[1]!.replace(/\.\$?value$/, ''))
  else if (Array.isArray(v)) for (const x of v) refsIn(x, out)
  else if (isObj(v)) for (const x of Object.values(v)) refsIn(x, out)
}

/**
 * A single Tokens Studio file keeps token sets as top-level keys; references then leave the set
 * name out. Without `$themes`/`$metadata` the references decide which reading resolves more.
 */
function topLevelAreSets(tree: Record<string, unknown>): boolean {
  if ('$themes' in tree || '$metadata' in tree) return true
  const asGroups = new Set<string>()
  const asSets = new Set<string>()
  tokenIds(tree, [], asGroups)
  for (const [k, v] of Object.entries(tree)) if (!k.startsWith('$')) tokenIds(v, [], asSets)
  const refs: string[] = []
  refsIn(tree, refs)
  if (refs.length === 0) return false
  const hits = (ids: Set<string>) => refs.filter((r) => ids.has(r)).length
  return hits(asSets) > hits(asGroups)
}

function studioSystem(files: Loaded[], diag: DiagnosticBag): TokenSystem {
  const unit = 'px'
  const sets = new Map<string, TokenDocument>()
  let order: string[] | undefined
  let themes: Theme[] = []
  const metaFile = files.find((f) => base(f.file) === '$metadata.json')
  const themesFile = files.find((f) => base(f.file) === '$themes.json')
  const root = dir((metaFile ?? themesFile)?.file ?? '')
  if (metaFile && isObj(metaFile.tree) && Array.isArray(metaFile.tree.tokenSetOrder))
    order = metaFile.tree.tokenSetOrder.filter((s): s is string => typeof s === 'string')
  if (themesFile) themes = themesOf(themesFile.tree, diag, themesFile.file)

  const single = files.filter((f) => !META.test(f.file)).length === 1
  for (const f of files) {
    if (META.test(f.file) || !isObj(f.tree)) continue
    if (isObj(f.tree.$metadata) && Array.isArray(f.tree.$metadata.tokenSetOrder))
      order ??= f.tree.$metadata.tokenSetOrder.filter((s): s is string => typeof s === 'string')
    if (f.tree.$themes) themes = themes.length ? themes : themesOf(f.tree.$themes, diag, f.file)
    const exported = '$themes' in f.tree || '$metadata' in f.tree
    if (exported || (single && topLevelAreSets(f.tree))) {
      for (const [name, tree] of Object.entries(f.tree))
        if (!name.startsWith('$') && isObj(tree))
          sets.set(name, { file: `${f.file}#/${name}`, tree: convertTree(tree, 'tokens-studio', unit) })
    } else {
      const rel = root && f.file.startsWith(`${root}/`) ? f.file.slice(root.length + 1) : f.file
      const name = rel.replace(/\.(json|tokens)$/i, '')
      sets.set(name, { file: f.file, tree: convertTree(f.tree, 'tokens-studio', unit) })
    }
  }

  const names = [
    ...(order ?? []).filter((n) => sets.has(n)),
    ...[...sets.keys()].filter((n) => !order?.includes(n)),
  ]
  const docs = (list: string[]) => list.map((n) => sets.get(n)!)
  const system: TokenSystem = {
    sets: new Map(),
    modifiers: new Map(),
    order: [{ kind: 'set', name: 'base' }],
    synthetic: true,
    kind: 'tokens-studio',
  }
  if (themes.length === 0) {
    system.sets.set('base', docs(names))
    if (sets.size > 1)
      diag.info('tokens-studio/no-themes', `No themes: ${sets.size} token sets are merged in set order`)
    return system
  }

  const used = (t: Theme) =>
    new Set(names.filter((n) => t.sets.get(n) === 'enabled' || t.sets.get(n) === 'source'))
  const groups = new Map<string, Theme[]>()
  for (const t of themes) groups.set(t.group, [...(groups.get(t.group) ?? []), t])
  // A group with one theme is always on: its sets join the base, like sets every theme uses.
  const switching = themes.filter((t) => groups.get(t.group)!.length > 1)
  const fixed = new Set(themes.filter((t) => !switching.includes(t)).flatMap((t) => [...used(t)]))
  const shared = names.filter(
    (n) => fixed.has(n) || (switching.length > 0 && switching.every((t) => used(t).has(n))),
  )
  system.sets.set('base', docs(shared))
  for (const [group, list] of groups) {
    if (list.length < 2) continue
    const contexts = new Map<string, TokenDocument[]>()
    for (const t of list) {
      const u = used(t)
      contexts.set(t.name, docs(names.filter((n) => u.has(n) && !shared.includes(n))))
    }
    system.modifiers.set(group, { contexts, default: list[0]!.name })
    system.order.push({ kind: 'modifier', name: group })
  }
  const unused = names.filter((n) => !themes.some((t) => used(t).has(n)))
  if (unused.length > 0)
    diag.info('tokens-studio/unused-sets', `Token sets in no theme are not read: ${unused.join(', ')}`)
  return system
}

/**
 * Tokens Studio and Style Dictionary JSON → token system (DTCG 2025.10 values).
 * Tokens Studio: token sets (one file each, or top-level keys of one file), `$metadata.json` for
 * set order and `$themes.json` for themes; theme groups become modifiers. Style Dictionary: every
 * file merges into one set, untyped tokens take their type from the category (`color`, `size`,
 * `time`) or the value. Plain DTCG files are left to the core.
 */
export const jsonTokens: TokenAdapter = {
  name: 'tokens-json',
  priority: 'first',

  async detect(source: Source, config: ScanConfig): Promise<string[]> {
    const files = pickExports(await readAll(source, config))
    return dialectOf(files) ? files.map((f) => f.file) : []
  },

  async load(source: Source, files: string[], config: ScanConfig, diag: DiagnosticBag): Promise<TokenSystem> {
    const wanted = new Set(files)
    const all = await readAll(source, config, diag)
    pickExports(all, diag)
    const loaded = all.filter((f) => wanted.has(f.file))
    const dialect = dialectOf(loaded) ?? 'style-dictionary'
    if (dialect === 'tokens-studio') return studioSystem(loaded, diag)
    const docs: TokenDocument[] = loaded.map((f) => ({
      file: f.file,
      tree: convertTree(f.tree, 'style-dictionary', 'px'),
    }))
    return {
      sets: new Map([['default', docs]]),
      modifiers: new Map(),
      order: [{ kind: 'set', name: 'default' }],
      synthetic: true,
      kind: 'style-dictionary',
    }
  },
}
