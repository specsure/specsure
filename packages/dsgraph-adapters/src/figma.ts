/**
 * A Figma file's variables and styles as DTCG 2025.10. The input is plain data, as the Figma plugin
 * reads it or as Figma's REST API returns variables (`fromFigmaRest`); this module has no imports,
 * so the plugin bundles it alone (`@dsgraph/adapters/figma`).
 */

export interface FigmaColor {
  r: number
  g: number
  b: number
  a?: number
}

/** An easing: one of Figma's named curves, a cubic Bézier, or a spring. */
export interface FigmaEasing {
  type: string
  bezier?: { x1: number; y1: number; x2: number; y2: number }
}

/**
 * A value in one mode: a color, a number, a string, a boolean, an easing, a reference to another
 * variable, or a color composed of a color and an opacity, either of them a reference.
 */
export type FigmaValue =
  | FigmaColor
  | number
  | string
  | boolean
  | { alias: string }
  | { easing: FigmaEasing }
  | { composed: { color: FigmaColor | { alias: string }; opacity: number | { alias: string } } }

export interface FigmaCollection {
  id: string
  name: string
  /** In an extended collection, `parent` is the mode of the parent collection this one inherits. */
  modes: Array<{ id: string; name: string; parent?: string }>
  defaultModeId: string
  hidden?: boolean
  /**
   * An extended collection: its parent, every variable it has (the inherited ones too) and the
   * values it overrides, by variable and mode. Any other value is its parent's in the parent mode.
   */
  extends?: { parent: string; variables: string[]; overrides: Record<string, Record<string, FigmaValue>> }
}

export interface FigmaVariable {
  id: string
  name: string
  collectionId: string
  type: 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN' | 'EASING' | 'TIMING'
  description?: string
  /** Where Figma offers it: `GAP`, `CORNER_RADIUS`, `FONT_WEIGHT`, `ALL_SCOPES`… */
  scopes: string[]
  /** How code names it, per platform: `{ WEB: 'var(--color-text)' }`. */
  codeSyntax?: Record<string, string>
  hiddenFromPublishing?: boolean
  valuesByMode: Record<string, FigmaValue>
}

/** A variable from a library the file uses: its name and its value, for references that leave the file. */
export interface FigmaLibraryVariable {
  name: string
  type: FigmaVariable['type']
  scopes: string[]
  value: FigmaValue
}

export interface FigmaPaint {
  type: string
  color?: FigmaColor
  opacity?: number
  /** The variable the color is bound to. */
  variable?: string
  stops?: Array<{ position: number; color: FigmaColor; variable?: string }>
}

export interface FigmaEffect {
  type: string
  color?: FigmaColor
  offset?: { x: number; y: number }
  radius?: number
  spread?: number
  visible?: boolean
}

export interface FigmaTextStyle {
  id: string
  name: string
  description?: string
  fontFamily: string
  /** Figma's style name: `Semi Bold`, `Bold Italic`. */
  fontStyle: string
  fontSize: number
  lineHeight: { unit: 'PIXELS' | 'PERCENT' | 'AUTO'; value?: number }
  letterSpacing: { unit: 'PIXELS' | 'PERCENT'; value: number }
  textCase?: string
  textDecoration?: string
  /** Variables bound to the style's fields: `fontSize`, `fontFamily`, `lineHeight`… */
  bound?: Record<string, string>
}

/** One grid of a grid style: columns, rows or a square grid, in pixels. */
export interface FigmaGrid {
  pattern: 'COLUMNS' | 'ROWS' | 'GRID'
  alignment?: 'MIN' | 'MAX' | 'STRETCH' | 'CENTER'
  count?: number
  gutterSize?: number
  offset?: number
  sectionSize?: number
  visible?: boolean
  /** Variables bound to the grid's fields: `count`, `gutterSize`, `offset`, `sectionSize`. */
  bound?: Record<string, string>
}

export interface FigmaExport {
  file: { name: string }
  collections: FigmaCollection[]
  variables: FigmaVariable[]
  external: Record<string, FigmaLibraryVariable>
  styles: {
    paint: Array<{ id: string; name: string; description?: string; paints: FigmaPaint[] }>
    text: FigmaTextStyle[]
    effect: Array<{ id: string; name: string; description?: string; effects: FigmaEffect[] }>
    grid?: Array<{ id: string; name: string; description?: string; grids: FigmaGrid[] }>
  }
}

/**
 * A Figma file's variables and styles as DTCG 2025.10. Two shapes of the same tokens:
 * - `files`: a file per collection (`Primitives.tokens.json`) or, for a collection with several
 *   modes, per mode (`Theme/Dark.tokens.json`), styles in `styles.tokens.json`, and a resolver
 *   (`tokens.resolver.json`) where each collection with modes is a modifier;
 * - `single`: one document, the modes of each token in `$extensions.mode`, for tools that read one file.
 * Token paths are the variables' names. An extended collection's tokens are under its name, and so
 * are a collection's whose names overlap another collection's. What has no DTCG type (booleans,
 * plain strings) is left out; that and every renaming are listed in `notes`.
 */
export interface FigmaTokens {
  files: Record<string, unknown>
  single: Record<string, unknown>
  /** How the files make up the system: a set per collection with one mode, a modifier per collection with several. */
  layout: Array<
    | { kind: 'set'; name: string; file: string }
    | { kind: 'modifier'; name: string; contexts: Array<{ name: string; file: string }>; default: string }
  >
  notes: Array<{ name: string; message: string }>
  stats: { collections: number; variables: number; styles: number; skipped: number }
  /** What was written, for a person to check: each collection with its modes, and the styles by type. */
  summary: {
    collections: Array<{ name: string; modes: string[]; variables: number }>
    styles: Record<string, number>
  }
}

type Doc = Record<string, unknown>

/** Scopes of a number that is a length: a radius, a gap, a size, a stroke, a font size. */
const LENGTH_SCOPES = new Set([
  'CORNER_RADIUS',
  'WIDTH_HEIGHT',
  'GAP',
  'STROKE_FLOAT',
  'EFFECT_FLOAT',
  'FONT_SIZE',
  'LINE_HEIGHT',
  'LETTER_SPACING',
  'PARAGRAPH_SPACING',
  'PARAGRAPH_INDENT',
])
/** Name words of a length, for numbers Figma offers everywhere (`ALL_SCOPES`). */
const LENGTH_WORDS =
  /(^|[/._-])(space|spacing|size|sizes|radius|radii|width|height|gap|inset|padding|margin|gutter|offset|stroke|border|breakpoint|dimension|blur|spread|indent)([/._-]|$)/i
const WEIGHTS: Array<[RegExp, number]> = [
  [/thin|hairline/i, 100],
  [/extra\s*light|ultra\s*light/i, 200],
  [/light/i, 300],
  [/semi\s*bold|demi\s*bold/i, 600],
  [/extra\s*bold|ultra\s*bold/i, 800],
  [/bold/i, 700],
  [/black|heavy/i, 900],
  [/medium/i, 500],
]

/**
 * Figma's named curves: CSS's own, and the back curves as Figma draws them. Springs and `HOLD`
 * have no cubic Bézier.
 */
const CURVES: Record<string, number[]> = {
  LINEAR: [0, 0, 1, 1],
  EASE_IN: [0.42, 0, 1, 1],
  EASE_OUT: [0, 0, 0.58, 1],
  EASE_IN_AND_OUT: [0.42, 0, 0.58, 1],
  EASE_IN_BACK: [0.3, -0.05, 0.7, -0.5],
  EASE_OUT_BACK: [0.45, 1.45, 0.8, 1],
  EASE_IN_AND_OUT_BACK: [0.7, -0.4, 0.4, 1.4],
}

function curve(e: FigmaEasing): number[] | undefined {
  if (e.bezier) return [e.bezier.x1, e.bezier.y1, e.bezier.x2, e.bezier.y2].map((n) => round(n))
  return CURVES[e.type]
}

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d
const hex2 = (v: number) =>
  Math.round(v * 255)
    .toString(16)
    .padStart(2, '0')

function color(c: FigmaColor, opacity = 1): Doc {
  const alpha = round((c.a ?? 1) * opacity)
  const out: Doc = { colorSpace: 'srgb', components: [round(c.r), round(c.g), round(c.b)] }
  if (alpha < 1) out.alpha = alpha
  out.hex = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`
  return out
}

const isAlias = (v: unknown): v is { alias: string } => typeof v === 'object' && v !== null && 'alias' in v
const isColor = (v: unknown): v is FigmaColor => typeof v === 'object' && v !== null && 'r' in v

/** A token name in DTCG: `/` separates groups; `.`, `{`, `}` and a leading `$` are not allowed in names. */
const pathOf = (name: string): string[] =>
  name.split('/').map((s) => s.trim().replace(/[{}]/g, '').replace(/\./g, '-').replace(/^\$/, '') || '_')
const fileName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').trim() || '_'
const refTo = (path: string[]) => `{${path.join('.')}}`

function setAt(doc: Doc, path: string[], token: Doc): boolean {
  let node = doc
  for (const seg of path.slice(0, -1)) {
    const next = node[seg]
    if (next !== undefined && (typeof next !== 'object' || next === null || '$value' in (next as Doc)))
      return false
    node[seg] = next ?? {}
    node = node[seg] as Doc
  }
  const last = path[path.length - 1]!
  if (node[last] !== undefined) return false
  node[last] = token
  return true
}

/** Token paths as keys, and every group above them: two sets of names overlap where a key of one is a key or a group of the other. */
function keysOf(paths: string[][]): { tokens: Set<string>; groups: Set<string> } {
  const tokens = new Set<string>()
  const groups = new Set<string>()
  for (const p of paths) {
    tokens.add(p.join('.'))
    for (let i = 1; i < p.length; i++) groups.add(p.slice(0, i).join('.'))
  }
  return { tokens, groups }
}
const overlap = (a: ReturnType<typeof keysOf>, b: ReturnType<typeof keysOf>) =>
  [...a.tokens].some((k) => b.tokens.has(k) || b.groups.has(k)) || [...b.tokens].some((k) => a.groups.has(k))

export function figmaTokens(raw: FigmaExport): FigmaTokens {
  const notes: FigmaTokens['notes'] = []
  const byId = new Map(raw.variables.map((v) => [v.id, v]))
  const collections = new Map(raw.collections.map((c) => [c.id, c]))

  // A variable's DTCG type: from Figma's type and scopes; a reference takes its target's type.
  const types = new Map<string, string | null>()
  const typeOf = (v: FigmaVariable, seen = new Set<string>()): string | null => {
    if (types.has(v.id)) return types.get(v.id)!
    let t: string | null = null
    const target = Object.values(v.valuesByMode).find(isAlias)
    const local = target && byId.get(target.alias)
    if (local && !seen.has(local.id)) t = typeOf(local, new Set([...seen, v.id]))
    else if (v.type === 'COLOR') t = 'color'
    else if (v.type === 'EASING') t = 'cubicBezier'
    else if (v.type === 'TIMING') t = 'duration'
    else if (v.type === 'FLOAT') {
      const scopes = new Set(v.scopes)
      t = scopes.has('FONT_WEIGHT')
        ? 'fontWeight'
        : scopes.has('OPACITY')
          ? 'number'
          : [...scopes].some((s) => LENGTH_SCOPES.has(s)) ||
              ((!scopes.size || scopes.has('ALL_SCOPES')) && LENGTH_WORDS.test(v.name))
            ? 'dimension'
            : 'number'
    } else if (v.type === 'STRING')
      t = v.scopes.includes('FONT_FAMILY') || /font|family|typeface/i.test(v.name) ? 'fontFamily' : null
    types.set(v.id, t)
    return t
  }

  const literal = (type: string, value: FigmaValue): unknown => {
    if (type === 'color') return isColor(value) ? color(value) : undefined
    if (type === 'cubicBezier')
      return typeof value === 'object' && 'easing' in value ? curve(value.easing) : undefined
    // Figma keeps a duration in seconds, as a 32-bit float: 0.3 comes back as 0.30000001192092896.
    if (type === 'duration')
      return typeof value === 'number' ? { value: round(value * 1000, 3), unit: 'ms' } : undefined
    if (typeof value === 'number')
      return type === 'dimension' ? { value: round(value), unit: 'px' } : round(value)
    if (type === 'fontFamily' && typeof value === 'string') return value
    return undefined
  }

  /** The variables a collection writes: its own or, for an extended collection, all it has. */
  const members = new Map(
    raw.collections.map((col) => {
      if (!col.extends) return [col.id, raw.variables.filter((v) => v.collectionId === col.id)]
      const has = col.extends.variables.flatMap((id) => byId.get(id) ?? [])
      const missing = col.extends.variables.length - has.length
      if (missing)
        notes.push({
          name: col.name,
          message: `${missing} of the variables it inherits are not in the export; left out`,
        })
      return [col.id, has]
    }),
  )
  const memberIds = new Map([...members].map(([id, vars]) => [id, new Set(vars.map((v) => v.id))]))

  /** A variable's value in a collection's mode: an extended collection's override, or its parent's value in the parent mode. */
  const valueIn = (
    v: FigmaVariable,
    col: FigmaCollection,
    modeId: string,
    depth = 0,
  ): FigmaValue | undefined => {
    if (!col.extends) return v.valuesByMode[modeId]
    const own = col.extends.overrides[v.id]?.[modeId]
    if (own !== undefined) return own
    const parentMode = col.modes.find((m) => m.id === modeId)?.parent
    const parent = collections.get(col.extends.parent)
    if (!parentMode || depth > 16) return undefined
    // A library collection's values come with its variables.
    if (!parent) return v.collectionId === col.extends.parent ? v.valuesByMode[parentMode] : undefined
    return valueIn(v, parent, parentMode, depth + 1)
  }

  // Paths: a token's name, as in the file. An extended collection's tokens are under its name, as
  // they are its parent's under the same names; so are a collection's when its names overlap
  // another's, as one would replace the other where they are read together.
  const prefix = new Map(raw.collections.map((c) => [c.id, c.extends ? pathOf(c.name) : []]))
  const pathIn = (col: FigmaCollection, v: FigmaVariable) => [...prefix.get(col.id)!, ...pathOf(v.name)]
  const written = raw.collections.filter((c) => members.get(c.id)!.some((v) => typeOf(v)))
  const styleKeys = keysOf(
    [...raw.styles.paint, ...raw.styles.text, ...raw.styles.effect, ...(raw.styles.grid ?? [])].map((s) => [
      'styles',
      ...pathOf(s.name),
    ]),
  )
  for (let pass = 0; pass < 4; pass++) {
    const keys = written.map((col) =>
      keysOf(
        members
          .get(col.id)!
          .filter((v) => typeOf(v))
          .map((v) => pathIn(col, v)),
      ),
    )
    const clash = new Map<FigmaCollection, string[]>()
    const add = (col: FigmaCollection, other: string) => clash.set(col, [...(clash.get(col) ?? []), other])
    written.forEach((a, i) => {
      if (overlap(keys[i]!, styleKeys)) add(a, 'styles')
      for (let j = i + 1; j < written.length; j++) {
        const b = written[j]!
        if (!overlap(keys[i]!, keys[j]!)) continue
        add(a, b.name)
        add(b, a.name)
      }
    })
    let moved = false
    for (const [col, others] of clash) {
      if (prefix.get(col.id)!.length) continue
      prefix.set(col.id, pathOf(col.name))
      moved = true
      notes.push({
        name: col.name,
        message: `its names overlap ${others.join(', ')}; its tokens are under ${pathOf(col.name).join('.')}`,
      })
    }
    if (!moved) break
  }

  /** A reference to a variable where it is written, if it is: in its own collection, not an extension. */
  const homePath = (id: string): string[] | undefined => {
    const v = byId.get(id)
    const home = v && collections.get(v.collectionId)
    return v && home && !home.extends && memberIds.get(home.id)?.has(id) ? pathIn(home, v) : undefined
  }

  /** A variable's value in its collection's default mode, through references, for composed colors. */
  const resolved = (id: string, seen = new Set<string>()): FigmaValue | undefined => {
    const v = byId.get(id)
    if (!v) return raw.external[id]?.value
    const col = collections.get(v.collectionId)
    const x = v.valuesByMode[col?.defaultModeId ?? ''] ?? Object.values(v.valuesByMode)[0]
    return isAlias(x) && !seen.has(x.alias) ? resolved(x.alias, new Set([...seen, id])) : x
  }
  const nameOf = (id: string) => byId.get(id)?.name ?? raw.external[id]?.name ?? id

  /** One mode's value: a reference to a variable of the file, or a literal (a library variable's value). */
  const modeValue = (
    v: FigmaVariable,
    col: FigmaCollection,
    type: string,
    value: FigmaValue,
    ext: Doc,
  ): unknown => {
    // A color and an opacity, either one a variable: DTCG has no reference with an alpha, so the value is written.
    if (typeof value === 'object' && 'composed' in value) {
      const { color: c, opacity: o } = value.composed
      const base = isAlias(c) ? resolved(c.alias) : c
      const alpha = isAlias(o) ? resolved(o.alias) : o
      ext['com.figma.composedColor'] = {
        color: isAlias(c) ? nameOf(c.alias) : null,
        opacity: isAlias(o) ? nameOf(o.alias) : o,
      }
      return isColor(base) && typeof alpha === 'number' ? color(base, alpha) : undefined
    }
    if (!isAlias(value)) {
      const out = literal(type, value)
      if (out === undefined && type === 'cubicBezier' && typeof value === 'object' && 'easing' in value)
        notes.push({
          name: v.name,
          message: `the ${value.easing.type.toLowerCase().replace(/_/g, ' ')} curve has no cubic Bézier; left out`,
        })
      return out
    }
    // In an extended collection a reference to a variable it has is to its own copy, as Figma resolves it.
    const target = byId.get(value.alias)
    if (target && col.extends && memberIds.get(col.id)!.has(target.id)) return refTo(pathIn(col, target))
    const home = homePath(value.alias)
    if (home) return refTo(home)
    const lib =
      raw.external[value.alias] ?? (target ? { name: target.name, value: resolved(target.id) } : undefined)
    if (!lib || lib.value === undefined) {
      notes.push({
        name: v.name,
        message: 'refers to a variable that is neither in the file nor in a library it uses',
      })
      return undefined
    }
    ext['com.figma.alias'] = lib.name
    return isAlias(lib.value) ? undefined : literal(type, lib.value)
  }

  const files: Record<string, unknown> = {}
  const single: Doc = {}
  const resolver: Doc = { version: '2025.10', sets: {}, modifiers: {}, resolutionOrder: [] }
  const order = resolver.resolutionOrder as unknown[]
  const layout: FigmaTokens['layout'] = []
  let count = 0
  let skipped = 0
  const summary: FigmaTokens['summary'] = { collections: [], styles: {} }

  for (const col of raw.collections) {
    const vars = members.get(col.id)!
    if (!vars.length) continue
    const before = count
    const modes = col.modes
    const docs = new Map(modes.map((m) => [m.id, {} as Doc]))
    for (const v of vars) {
      const type = typeOf(v)
      if (!type) {
        // An extended collection's copy is left out with the original.
        if (!col.extends) {
          skipped++
          notes.push({
            name: v.name,
            message: `${v.type.toLowerCase()} variables have no DTCG type; left out`,
          })
        }
        continue
      }
      const path = pathIn(col, v)
      const ext: Doc = { 'com.figma.variableId': v.id }
      if (v.scopes.length && !v.scopes.includes('ALL_SCOPES')) ext['com.figma.scopes'] = v.scopes
      if (v.codeSyntax && Object.keys(v.codeSyntax).length) ext['com.figma.codeSyntax'] = v.codeSyntax
      if (v.hiddenFromPublishing) ext['com.figma.hiddenFromPublishing'] = true
      const perMode: Record<string, unknown> = {}
      for (const m of modes) {
        const raw0 = valueIn(v, col, m.id)
        if (raw0 === undefined) continue
        const value = modeValue(v, col, type, raw0, ext)
        if (value === undefined) continue
        perMode[m.name] = value
        const token: Doc = { $type: type, $value: value }
        if (v.description) token.$description = v.description
        token.$extensions = ext
        if (!setAt(docs.get(m.id)!, path, token))
          notes.push({ name: v.name, message: 'its name is taken by another token or group; left out' })
      }
      const base =
        perMode[modes.find((m) => m.id === col.defaultModeId)?.name ?? ''] ?? Object.values(perMode)[0]
      if (base === undefined) continue
      count++
      const token: Doc = { $type: type, $value: base }
      if (v.description) token.$description = v.description
      // Every mode, as dsgraph and other tools read modes written per token.
      token.$extensions = modes.length > 1 ? { ...ext, mode: perMode } : ext
      if (!setAt(single, path, token))
        notes.push({ name: v.name, message: 'another collection has a token or group with this name' })
    }
    summary.collections.push({ name: col.name, modes: modes.map((m) => m.name), variables: count - before })
    const name = fileName(col.name)
    if (modes.length === 1) {
      files[`${name}.tokens.json`] = docs.get(modes[0]!.id)
      ;(resolver.sets as Doc)[name] = { sources: [{ $ref: `${name}.tokens.json` }] }
      order.push({ $ref: `#/sets/${name}` })
      layout.push({ kind: 'set', name, file: `${name}.tokens.json` })
    } else {
      const contexts: Doc = {}
      for (const m of modes) {
        const f = `${name}/${fileName(m.name)}.tokens.json`
        files[f] = docs.get(m.id)
        contexts[m.name] = [{ $ref: f }]
      }
      const def = modes.find((m) => m.id === col.defaultModeId)?.name ?? modes[0]!.name
      ;(resolver.modifiers as Doc)[name] = { contexts, default: def }
      order.push({ $ref: `#/modifiers/${name}` })
      layout.push({
        kind: 'modifier',
        name,
        contexts: modes.map((m) => ({ name: m.name, file: `${name}/${fileName(m.name)}.tokens.json` })),
        default: def,
      })
    }
  }

  const styles = convertStyles(
    raw,
    (id, type) => {
      const v = byId.get(id)
      const path = homePath(id)
      return v && path && typeOf(v) === type ? refTo(path) : undefined
    },
    notes,
  )
  if (Object.keys(styles.doc).length) {
    files['styles.tokens.json'] = styles.doc
    ;(resolver.sets as Doc).styles = { sources: [{ $ref: 'styles.tokens.json' }] }
    order.push({ $ref: '#/sets/styles' })
    layout.push({ kind: 'set', name: 'styles', file: 'styles.tokens.json' })
    for (const [k, v] of Object.entries(styles.doc)) if (single[k] === undefined) single[k] = v
  }
  if (!Object.keys(resolver.modifiers as Doc).length) delete resolver.modifiers
  files['tokens.resolver.json'] = resolver

  return {
    files,
    single,
    layout,
    notes,
    stats: { collections: raw.collections.length, variables: count, styles: styles.count, skipped },
    summary: { ...summary, styles: styles.byType },
  }
}

/**
 * Styles under `styles`: paint styles as colors and gradients, text styles as typography, effect
 * styles as shadows, grid styles as a group of their numbers (DTCG has no grid type).
 */
function convertStyles(
  raw: FigmaExport,
  refOf: (id: string, type: string) => string | undefined,
  notes: FigmaTokens['notes'],
): { doc: Doc; count: number; byType: Record<string, number> } {
  const doc: Doc = {}
  let count = 0
  const byType: Record<string, number> = {}
  const ref = (id: string | undefined, type: string) => (id ? refOf(id, type) : undefined)
  const put = (name: string, token: Doc, id: string, description?: string, kind = token.$type as string) => {
    if (description) token.$description = description
    token.$extensions = { 'com.figma.styleId': id }
    if (setAt(doc, ['styles', ...pathOf(name)], token)) {
      count++
      byType[kind] = (byType[kind] ?? 0) + 1
    } else notes.push({ name, message: 'its name is taken by another style; left out' })
  }

  for (const s of raw.styles.paint) {
    const visible = s.paints
    if (visible.length !== 1) {
      notes.push({ name: s.name, message: 'a style of several paints has no DTCG type; left out' })
      continue
    }
    const p = visible[0]!
    if (p.type === 'SOLID' && p.color) {
      const value = (p.opacity ?? 1) === 1 ? ref(p.variable, 'color') : undefined
      put(s.name, { $type: 'color', $value: value ?? color(p.color, p.opacity ?? 1) }, s.id, s.description)
    } else if (p.type.startsWith('GRADIENT') && p.stops)
      put(
        s.name,
        {
          $type: 'gradient',
          $value: p.stops.map((x) => ({
            color: ref(x.variable, 'color') ?? color(x.color),
            position: round(x.position),
          })),
        },
        s.id,
        s.description,
      )
    else notes.push({ name: s.name, message: `${p.type.toLowerCase()} paints have no DTCG type; left out` })
  }

  for (const s of raw.styles.text)
    put(s.name, { $type: 'typography', $value: typography(s, ref) }, s.id, s.description)

  for (const s of raw.styles.effect) {
    const shadows = s.effects.filter(
      (e) => (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') && e.visible !== false,
    )
    if (!shadows.length) {
      notes.push({ name: s.name, message: 'blur effects have no DTCG type; left out' })
      continue
    }
    put(
      s.name,
      {
        $type: 'shadow',
        $value: shadows.map((e) => ({
          color: color(e.color ?? { r: 0, g: 0, b: 0, a: 0.25 }),
          offsetX: { value: round(e.offset?.x ?? 0), unit: 'px' },
          offsetY: { value: round(e.offset?.y ?? 0), unit: 'px' },
          blur: { value: round(e.radius ?? 0), unit: 'px' },
          spread: { value: round(e.spread ?? 0), unit: 'px' },
          inset: e.type === 'INNER_SHADOW',
        })),
      },
      s.id,
      s.description,
    )
  }

  // A grid style: a group per grid (`columns`, `rows`, `grid`), its numbers as tokens. Figma's
  // `offset` is the margin of a stretched grid and the indent of one at a side.
  for (const s of raw.styles.grid ?? []) {
    const group: Doc = {}
    for (const g of s.grids.filter((x) => x.visible !== false)) {
      const word = g.pattern === 'COLUMNS' ? 'columns' : g.pattern === 'ROWS' ? 'rows' : 'grid'
      let key = word
      for (let i = 2; group[key]; i++) key = `${word}-${i}`
      const b = g.bound ?? {}
      const px = (field: string, n: number | undefined): Doc | undefined =>
        n === undefined || !Number.isFinite(n)
          ? undefined
          : { $type: 'dimension', $value: ref(b[field], 'dimension') ?? { value: round(n), unit: 'px' } }
      const fields: Record<string, Doc | undefined> =
        g.pattern === 'GRID'
          ? { size: px('sectionSize', g.sectionSize) }
          : {
              // Figma's count of a grid that fits as many as it can is infinite.
              count:
                g.count !== undefined && Number.isFinite(g.count)
                  ? { $type: 'number', $value: ref(b.count, 'number') ?? g.count }
                  : undefined,
              gutter: px('gutterSize', g.gutterSize),
              offset: px('offset', g.offset),
              size: g.alignment === 'STRETCH' ? undefined : px('sectionSize', g.sectionSize),
            }
      const tokens = Object.fromEntries(Object.entries(fields).filter(([, t]) => t))
      if (Object.keys(tokens).length) group[key] = tokens
    }
    if (!Object.keys(group).length) {
      notes.push({ name: s.name, message: 'a grid style with no visible grids; left out' })
      continue
    }
    put(s.name, group, s.id, s.description, 'grid')
  }
  return { doc, count, byType }
}

/**
 * A text style as DTCG typography. Line height becomes a multiple of the size (`AUTO` is CSS
 * `normal`, about 1.2), letter spacing a length (a percentage is of the size); fields bound to
 * variables of the right type are references.
 */
function typography(
  s: FigmaTextStyle,
  ref: (id: string | undefined, type: string) => string | undefined,
): Doc {
  const size = s.fontSize
  const weight = WEIGHTS.find(([re]) => re.test(s.fontStyle))?.[1] ?? 400
  const lineHeight =
    s.lineHeight.unit === 'PIXELS' && s.lineHeight.value
      ? round(s.lineHeight.value / size)
      : s.lineHeight.unit === 'PERCENT' && s.lineHeight.value
        ? round(s.lineHeight.value / 100)
        : 1.2
  const tracking =
    s.letterSpacing.unit === 'PERCENT' ? (s.letterSpacing.value / 100) * size : s.letterSpacing.value
  const b = s.bound ?? {}
  return {
    fontFamily: ref(b.fontFamily, 'fontFamily') ?? s.fontFamily,
    fontSize: ref(b.fontSize, 'dimension') ?? { value: round(size), unit: 'px' },
    fontWeight: ref(b.fontWeight, 'fontWeight') ?? weight,
    letterSpacing: ref(b.letterSpacing, 'dimension') ?? { value: round(tracking), unit: 'px' },
    lineHeight,
  }
}

/** A value as Figma's REST API writes it: an alias is `{ type: 'VARIABLE_ALIAS', id }`. */
function restValue(v: unknown): FigmaValue {
  if (typeof v !== 'object' || v === null) return v as FigmaValue
  const o = v as Record<string, unknown>
  if (o.type === 'VARIABLE_ALIAS' && typeof o.id === 'string') return { alias: o.id }
  return v as FigmaValue
}

/**
 * The response of Figma's REST API for a file's variables (`GET /v1/files/:key/variables/local`)
 * as the plugin reads a file: local variables, and the library ones they use as their values.
 * Styles are not in that response.
 */
export function fromFigmaRest(response: unknown, name = 'Figma'): FigmaExport | undefined {
  const meta = (response as { meta?: Record<string, unknown> } | null)?.meta
  const vars = meta?.variables as Record<string, Record<string, unknown>> | undefined
  const cols = meta?.variableCollections as Record<string, Record<string, unknown>> | undefined
  if (!vars || !cols || typeof vars !== 'object' || typeof cols !== 'object') return undefined
  const collections: FigmaCollection[] = Object.values(cols)
    .filter((c) => !c.remote)
    .map((c) => {
      const out: FigmaCollection = {
        id: String(c.id),
        name: String(c.name),
        modes: ((c.modes as Array<{ modeId: string; name: string; parentModeId?: string }>) ?? []).map(
          (m) => ({ id: m.modeId, name: m.name, ...(m.parentModeId ? { parent: m.parentModeId } : {}) }),
        ),
        defaultModeId: String(c.defaultModeId),
      }
      if (c.isExtension && typeof c.parentVariableCollectionId === 'string') {
        const overrides = (c.variableOverrides as Record<string, Record<string, unknown>>) ?? {}
        out.extends = {
          parent: c.parentVariableCollectionId,
          variables: ((c.variableIds as string[]) ?? []).map(String),
          overrides: Object.fromEntries(
            Object.entries(overrides).map(([id, byMode]) => [
              id,
              Object.fromEntries(Object.entries(byMode).map(([m, x]) => [m, restValue(x)])),
            ]),
          ),
        }
      }
      return out
    })
  const local = new Set(collections.map((c) => c.id))
  // A library variable an extended collection inherits is one of its own: written with its values.
  const inherited = new Set(collections.flatMap((c) => c.extends?.variables ?? []))
  const variables: FigmaVariable[] = []
  const external: Record<string, FigmaLibraryVariable> = {}
  for (const v of Object.values(vars)) {
    const valuesByMode = Object.fromEntries(
      Object.entries((v.valuesByMode as Record<string, unknown>) ?? {}).map(([m, x]) => [m, restValue(x)]),
    )
    const base = {
      name: String(v.name),
      type: v.resolvedType as FigmaVariable['type'],
      scopes: (v.scopes as string[]) ?? [],
    }
    if (local.has(String(v.variableCollectionId)) || inherited.has(String(v.id))) {
      const out: FigmaVariable = {
        ...base,
        id: String(v.id),
        collectionId: String(v.variableCollectionId),
        valuesByMode,
      }
      if (v.description) out.description = String(v.description)
      if (v.codeSyntax && Object.keys(v.codeSyntax as object).length)
        out.codeSyntax = v.codeSyntax as Record<string, string>
      if (v.hiddenFromPublishing) out.hiddenFromPublishing = true
      variables.push(out)
    } else {
      const col = cols[String(v.variableCollectionId)]
      const value = valuesByMode[String(col?.defaultModeId)] ?? Object.values(valuesByMode)[0]
      if (value !== undefined) external[String(v.id)] = { ...base, value }
    }
  }
  return { file: { name }, collections, variables, external, styles: { paint: [], text: [], effect: [] } }
}
