import type { RawExport, RawExternal, RawPaint, RawValue, RawVariable } from './raw'

/** A Figma value as plain data: an alias keeps the id of the variable it points to. */
function plain(v: VariableValue): RawValue {
  const rgba = (c: RGB | RGBA) => ({ r: c.r, g: c.g, b: c.b, a: 'a' in c ? c.a : 1 })
  const alias = (x: VariableAlias) => ({ alias: x.id })
  if (typeof v !== 'object' || v === null) return v
  if ('type' in v && v.type === 'VARIABLE_ALIAS') return alias(v as VariableAlias)
  if ('r' in v) return rgba(v)
  if ('color' in v && 'opacity' in v) {
    const c = v.color
    const o = v.opacity
    return {
      composed: {
        color: 'type' in c ? alias(c as VariableAlias) : rgba(c as RGB | RGBA),
        opacity: typeof o === 'number' ? o : alias(o),
      },
    }
  }
  const e = v as MotionEasing
  const b = (e as { easingFunctionCubicBezier?: { x1: number; y1: number; x2: number; y2: number } })
    .easingFunctionCubicBezier
  return { easing: { type: e.type, ...(b ? { bezier: { x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2 } } : {}) } }
}

/** A library variable's value in its default mode, followed through aliases to the end. */
async function libraryValue(variable: Variable, seen = new Set<string>()): Promise<RawValue | undefined> {
  const col = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId)
  const raw = variable.valuesByMode[col?.defaultModeId ?? Object.keys(variable.valuesByMode)[0]!]
  if (raw === undefined) return undefined
  const value = plain(raw)
  if (typeof value === 'object' && value !== null && 'alias' in value && !seen.has(value.alias)) {
    const next = await figma.variables.getVariableByIdAsync(value.alias)
    return next ? libraryValue(next, new Set([...seen, variable.id])) : undefined
  }
  return value
}

/** Everything the export needs from the open file. Reads only. */
export async function gather(): Promise<RawExport> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync()
  const variables = await figma.variables.getLocalVariablesAsync()
  const local = new Set(variables.map((v) => v.id))

  const raw: RawVariable[] = variables.map((v) => {
    const out: RawVariable = {
      id: v.id,
      name: v.name,
      collectionId: v.variableCollectionId,
      type: v.resolvedType,
      scopes: [...v.scopes],
      valuesByMode: Object.fromEntries(Object.entries(v.valuesByMode).map(([m, x]) => [m, plain(x)])),
    }
    if (v.description) out.description = v.description
    if (Object.keys(v.codeSyntax).length) out.codeSyntax = { ...v.codeSyntax }
    if (v.hiddenFromPublishing) out.hiddenFromPublishing = true
    return out
  })

  // Aliases to library variables: the value is written instead of a reference that would dangle.
  const external: Record<string, RawExternal> = {}
  const aliases = (x: RawValue): string[] =>
    typeof x !== 'object' || x === null
      ? []
      : 'alias' in x
        ? [x.alias]
        : 'composed' in x
          ? [x.composed.color, x.composed.opacity].flatMap((y) =>
              typeof y === 'object' && 'alias' in y ? [y.alias] : [],
            )
          : []
  for (const v of raw)
    for (const id of Object.values(v.valuesByMode).flatMap(aliases)) {
      if (local.has(id) || id in external) continue
      const lib = await figma.variables.getVariableByIdAsync(id)
      const value = lib ? await libraryValue(lib) : undefined
      if (lib && value !== undefined)
        external[id] = { name: lib.name, type: lib.resolvedType, scopes: [...lib.scopes], value }
    }

  const paintOf = (p: Paint): RawPaint => {
    const out: RawPaint = { type: p.type, opacity: p.opacity ?? 1 }
    if (p.type === 'SOLID') {
      out.color = { ...p.color, a: 1 }
      if (p.boundVariables?.color) out.variable = p.boundVariables.color.id
    } else if ('gradientStops' in p)
      out.stops = p.gradientStops.map((s) => ({
        position: s.position,
        color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a },
        ...(s.boundVariables?.color ? { variable: s.boundVariables.color.id } : {}),
      }))
    return out
  }

  const paint = (await figma.getLocalPaintStylesAsync()).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    paints: s.paints.filter((p) => p.visible !== false).map(paintOf),
  }))
  const text = (await figma.getLocalTextStylesAsync()).map((s) => {
    const bound: Record<string, string> = {}
    for (const [field, alias] of Object.entries(s.boundVariables ?? {}))
      if (alias && typeof alias === 'object' && 'id' in alias) bound[field] = alias.id
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      fontFamily: s.fontName.family,
      fontStyle: s.fontName.style,
      fontSize: s.fontSize,
      lineHeight:
        s.lineHeight.unit === 'AUTO'
          ? { unit: 'AUTO' as const }
          : { unit: s.lineHeight.unit, value: s.lineHeight.value },
      letterSpacing: { unit: s.letterSpacing.unit, value: s.letterSpacing.value },
      textCase: s.textCase,
      textDecoration: s.textDecoration,
      bound,
    }
  })
  const effect = (await figma.getLocalEffectStylesAsync()).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    effects: s.effects.map((e) =>
      e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW'
        ? {
            type: e.type,
            color: e.color,
            offset: e.offset,
            radius: e.radius,
            spread: e.spread ?? 0,
            visible: e.visible,
          }
        : { type: e.type, ...('radius' in e ? { radius: e.radius } : {}), visible: e.visible },
    ),
  }))

  return {
    file: { name: figma.root.name },
    collections: collections.map((c) => ({
      id: c.id,
      name: c.name,
      modes: c.modes.map((m) => ({ id: m.modeId, name: m.name })),
      defaultModeId: c.defaultModeId,
      ...(c.hiddenFromPublishing ? { hidden: true } : {}),
    })),
    variables: raw,
    external,
    styles: { paint, text, effect },
  }
}
