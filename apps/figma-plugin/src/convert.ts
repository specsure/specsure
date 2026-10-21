import type { RawColor, RawEasing, RawExport, RawTextStyle, RawValue, RawVariable } from './raw'

/**
 * A Figma file's variables and styles as DTCG 2025.10. Two shapes of the same tokens:
 * - `files`: a file per collection (`Primitives.tokens.json`) or, for a collection with several
 *   modes, per mode (`Theme/Dark.tokens.json`), styles in `styles.tokens.json`, and a resolver
 *   (`tokens.resolver.json`) where each collection with modes is a modifier;
 * - `single`: one document, the modes of each token in `$extensions.mode`, for tools that read one file.
 * What has no DTCG type (booleans, plain strings) is left out and listed in `notes`.
 */
export interface Converted {
  files: Record<string, unknown>
  single: Record<string, unknown>
  notes: Array<{ name: string; message: string }>
  stats: { collections: number; variables: number; styles: number; skipped: number }
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

/** Figma's named curves that are CSS's own; the others (back, springs) have no exact curve here. */
const CURVES: Record<string, number[]> = {
  LINEAR: [0, 0, 1, 1],
  EASE_IN: [0.42, 0, 1, 1],
  EASE_OUT: [0, 0, 0.58, 1],
  EASE_IN_AND_OUT: [0.42, 0, 0.58, 1],
}

function curve(e: RawEasing): number[] | undefined {
  if (e.bezier) return [e.bezier.x1, e.bezier.y1, e.bezier.x2, e.bezier.y2].map((n) => round(n))
  return CURVES[e.type]
}

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d
const hex2 = (v: number) =>
  Math.round(v * 255)
    .toString(16)
    .padStart(2, '0')

function color(c: RawColor, opacity = 1): Doc {
  const alpha = round((c.a ?? 1) * opacity)
  const out: Doc = { colorSpace: 'srgb', components: [round(c.r), round(c.g), round(c.b)] }
  if (alpha < 1) out.alpha = alpha
  out.hex = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`
  return out
}

const isAlias = (v: unknown): v is { alias: string } => typeof v === 'object' && v !== null && 'alias' in v
const isColor = (v: unknown): v is RawColor => typeof v === 'object' && v !== null && 'r' in v

/** A token name in DTCG: `/` separates groups; `.`, `{`, `}` and a leading `$` are not allowed in names. */
const pathOf = (name: string): string[] =>
  name.split('/').map((s) => s.trim().replace(/[{}]/g, '').replace(/\./g, '-').replace(/^\$/, '') || '_')
const fileName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').trim() || '_'

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

export function convert(raw: RawExport): Converted {
  const notes: Converted['notes'] = []
  const byId = new Map(raw.variables.map((v) => [v.id, v]))
  const collections = new Map(raw.collections.map((c) => [c.id, c]))

  // A variable's DTCG type: from Figma's type and scopes; a reference takes its target's type.
  const types = new Map<string, string | null>()
  const typeOf = (v: RawVariable, seen = new Set<string>()): string | null => {
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

  const literal = (type: string, value: RawValue): unknown => {
    if (type === 'color') return isColor(value) ? color(value) : undefined
    if (type === 'cubicBezier')
      return typeof value === 'object' && 'easing' in value ? curve(value.easing) : undefined
    if (type === 'duration')
      return typeof value === 'number' ? { value: round(value), unit: 'ms' } : undefined
    if (typeof value === 'number')
      return type === 'dimension' ? { value: round(value), unit: 'px' } : round(value)
    if (type === 'fontFamily' && typeof value === 'string') return value
    return undefined
  }

  /** A variable's value in its collection's default mode, through references, for composed colors. */
  const resolved = (id: string, seen = new Set<string>()): RawValue | undefined => {
    const v = byId.get(id)
    if (!v) return raw.external[id]?.value
    const col = collections.get(v.collectionId)
    const x = v.valuesByMode[col?.defaultModeId ?? ''] ?? Object.values(v.valuesByMode)[0]
    return isAlias(x) && !seen.has(x.alias) ? resolved(x.alias, new Set([...seen, id])) : x
  }
  const nameOf = (id: string) => byId.get(id)?.name ?? raw.external[id]?.name ?? id

  /** One mode's value: a reference to a variable of the file, or a literal (a library variable's value). */
  const modeValue = (v: RawVariable, type: string, value: RawValue, ext: Doc): unknown => {
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
          message: `the ${value.easing.type.toLowerCase()} curve has no exact cubic Bézier; left out`,
        })
      return out
    }
    const local = byId.get(value.alias)
    if (local) return `{${pathOf(local.name).join('.')}}`
    const lib = raw.external[value.alias]
    if (!lib) {
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
  let count = 0
  let skipped = 0

  for (const col of raw.collections) {
    const vars = raw.variables.filter((v) => v.collectionId === col.id)
    if (!vars.length) continue
    const modes = col.modes
    const docs = new Map(modes.map((m) => [m.id, {} as Doc]))
    for (const v of vars) {
      const type = typeOf(v)
      if (!type) {
        skipped++
        notes.push({ name: v.name, message: `${v.type.toLowerCase()} variables have no DTCG type; left out` })
        continue
      }
      const path = pathOf(v.name)
      const ext: Doc = { 'com.figma.variableId': v.id }
      if (v.scopes.length && !v.scopes.includes('ALL_SCOPES')) ext['com.figma.scopes'] = v.scopes
      if (v.codeSyntax && Object.keys(v.codeSyntax).length) ext['com.figma.codeSyntax'] = v.codeSyntax
      if (v.hiddenFromPublishing) ext['com.figma.hiddenFromPublishing'] = true
      const perMode: Record<string, unknown> = {}
      for (const m of modes) {
        const raw0 = v.valuesByMode[m.id]
        if (raw0 === undefined) continue
        const value = modeValue(v, type, raw0, ext)
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
    const name = fileName(col.name)
    if (modes.length === 1) {
      files[`${name}.tokens.json`] = docs.get(modes[0]!.id)
      ;(resolver.sets as Doc)[name] = { sources: [{ $ref: `${name}.tokens.json` }] }
      order.push({ $ref: `#/sets/${name}` })
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
    }
  }

  const styles = convertStyles(raw, byId, typeOf, notes)
  if (Object.keys(styles.doc).length) {
    files['styles.tokens.json'] = styles.doc
    ;(resolver.sets as Doc).styles = { sources: [{ $ref: 'styles.tokens.json' }] }
    order.push({ $ref: '#/sets/styles' })
    for (const [k, v] of Object.entries(styles.doc)) if (single[k] === undefined) single[k] = v
  }
  if (!Object.keys(resolver.modifiers as Doc).length) delete resolver.modifiers
  files['tokens.resolver.json'] = resolver

  return {
    files,
    single,
    notes,
    stats: { collections: raw.collections.length, variables: count, styles: styles.count, skipped },
  }
}

/** Styles under `styles`: paint styles as colors and gradients, text styles as typography, effect styles as shadows. */
function convertStyles(
  raw: RawExport,
  byId: Map<string, RawVariable>,
  typeOf: (v: RawVariable) => string | null,
  notes: Converted['notes'],
): { doc: Doc; count: number } {
  const doc: Doc = {}
  let count = 0
  const ref = (id: string | undefined, type: string): string | undefined => {
    const v = id ? byId.get(id) : undefined
    return v && typeOf(v) === type ? `{${pathOf(v.name).join('.')}}` : undefined
  }
  const put = (name: string, token: Doc, id: string, description?: string) => {
    if (description) token.$description = description
    token.$extensions = { 'com.figma.styleId': id }
    if (setAt(doc, ['styles', ...pathOf(name)], token)) count++
    else notes.push({ name, message: 'its name is taken by another style; left out' })
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
  return { doc, count }
}

/**
 * A text style as DTCG typography. Line height becomes a multiple of the size (`AUTO` is CSS
 * `normal`, about 1.2), letter spacing a length (a percentage is of the size); fields bound to
 * variables of the right type are references.
 */
function typography(s: RawTextStyle, ref: (id: string | undefined, type: string) => string | undefined): Doc {
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
