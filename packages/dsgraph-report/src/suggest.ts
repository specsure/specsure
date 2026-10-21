import { type ColorValue, type DsGraph, type Input, type Token, toOklab, valueDistance } from '@dsgraph/core'

/**
 * A name for a token the system does not have yet, built from its own scales: a new step of a color
 * ramp between the two steps it falls between in lightness, or a step of a size scale named the way
 * the scale names its steps. A suggestion for the design system's team, never a rule: nothing is
 * suggested when the system has no scale of that kind, or the value does not belong to one.
 */
export interface NameSuggestion {
  name: string
  /** The steps it is named after: the neighbours it falls between, or the ones whose names it follows. */
  between: string[]
  /** The scale it extends: `color.neutral`, `space`. */
  scale: string
}

interface Step {
  token: Token
  n: number
  value: unknown
}

/** `color.neutral.50` → `color.neutral` and 50; `space-12` → `space` and 12. */
function split(id: string): { scale: string; sep: string; n: number } | undefined {
  const m = /^(.*?)([.-])(\d+(?:\.\d+)?)$/.exec(id)
  return m ? { scale: m[1]!, sep: m[2]!, n: Number(m[3]) } : undefined
}

/** Scales of literal tokens of a type: groups whose steps are numbered, at least three of them. */
function scales(graph: DsGraph, type: string, input: Input): Map<string, { sep: string; steps: Step[] }> {
  const out = new Map<string, { sep: string; steps: Step[]; other: number }>()
  for (const token of graph.tokens({ type })) {
    if (token.deprecated || graph.chain(token.id, input).length > 1) continue
    const s = split(token.id)
    const scale = s?.scale ?? token.id.replace(/[.-][^.-]+$/, '')
    const entry = out.get(scale) ?? { sep: s?.sep ?? '.', steps: [], other: 0 }
    if (s) entry.steps.push({ token, n: s.n, value: graph.value(token.id, input) })
    else entry.other++
    out.set(scale, entry)
  }
  const kept = new Map<string, { sep: string; steps: Step[] }>()
  for (const [scale, e] of out)
    if (e.steps.length >= 3 && e.steps.length >= 4 * e.other)
      kept.set(scale, { sep: e.sep, steps: e.steps.sort((a, b) => a.n - b.n) })
  return kept
}

/** A step number between two others, as round as the scale's own numbers. */
function between(a: number, b: number, t: number, steps: number[]): number | undefined {
  const raw = a + (b - a) * t
  const unit = [100, 50, 25, 10, 5, 1].find((u) => steps.every((s) => s % u === 0)) ?? 1
  for (const u of [unit, unit / 2, unit / 5, unit / 10].filter((x) => x >= 1 && Number.isInteger(x))) {
    const fits = [Math.floor(raw / u) * u, Math.ceil(raw / u) * u].filter((n) => n > a && n < b)
    if (fits.length) return fits.sort((x, y) => Math.abs(x - raw) - Math.abs(y - raw))[0]
  }
  return undefined
}

const px = (v: unknown): number | undefined => {
  const d = v as { value?: number; unit?: string } | null
  if (!d || typeof d.value !== 'number') return undefined
  return d.unit === 'rem' ? d.value * 16 : d.unit === 'px' ? d.value : undefined
}

function colorName(graph: DsGraph, value: ColorValue, input: Input): NameSuggestion | undefined {
  const v = toOklab(value)
  // For every ramp, the two steps the value falls between in lightness and the color at that point
  // of the segment between them: the ramp whose segment passes closest to the value is the one it
  // extends. A light violet passes far from a grey ramp even where the lightness matches.
  let best:
    | { scale: string; sep: string; a: Step; b: Step; t: number; miss: number; steps: number[] }
    | undefined
  for (const [scale, ramp] of scales(graph, 'color', input)) {
    const lab = ramp.steps.map((x) => ({ step: x, lab: toOklab(x.value as ColorValue) }))
    for (let i = 1; i < lab.length; i++) {
      const A = lab[i - 1]!
      const B = lab[i]!
      if ((v[0] - A.lab[0]) * (v[0] - B.lab[0]) > 0 || A.lab[0] === B.lab[0]) continue
      const t = (A.lab[0] - v[0]) / (A.lab[0] - B.lab[0])
      const ma = A.lab[1] + (B.lab[1] - A.lab[1]) * t
      const mb = A.lab[2] + (B.lab[2] - A.lab[2]) * t
      // Two saturated colors of hues more than 20° apart are different families however close.
      if (Math.hypot(v[1], v[2]) > 0.02 && Math.hypot(ma, mb) > 0.02) {
        const turn = Math.abs(((Math.atan2(v[2], v[1]) - Math.atan2(mb, ma)) * 180) / Math.PI)
        if (Math.min(turn, 360 - turn) > 20) continue
      }
      const miss = Math.hypot(
        v[1] - (A.lab[1] + (B.lab[1] - A.lab[1]) * t),
        v[2] - (A.lab[2] + (B.lab[2] - A.lab[2]) * t),
      )
      if (!best || miss < best.miss)
        best = { scale, sep: ramp.sep, a: A.step, b: B.step, t, miss, steps: ramp.steps.map((x) => x.n) }
    }
  }
  // Farther than about ΔE 2 in hue and saturation from every ramp: a new ramp, not a new step.
  if (!best || best.miss > 0.02) return undefined
  const same = (s: Step) => (valueDistance('color', value, s.value) ?? 99) < 1
  if (same(best.a) || same(best.b)) return undefined
  const n = between(best.a.n, best.b.n, best.t, best.steps)
  if (n === undefined) return undefined
  return {
    name: `${best.scale}${best.sep}${n}`,
    between: [best.a.token.id, best.b.token.id],
    scale: best.scale,
  }
}

function sizeName(graph: DsGraph, value: number, input: Input, near?: string): NameSuggestion | undefined {
  const all = scales(graph, 'dimension', input)
  // The scale of the closest token, through its references: a spacing value belongs to the spacing scale.
  const primitive = near ? graph.chain(near, input).at(-1) : undefined
  const home = [...all].find(([, s]) => s.steps.some((x) => x.token.id === primitive))
  if (!home) return undefined
  const [scale, s] = home
  const sizes = s.steps.map((x) => ({ ...x, px: px(x.value) })).filter((x) => x.px !== undefined)
  if (sizes.length < 3 || sizes.some((x) => x.px === value)) return undefined
  const neighbours = (n: number) => {
    const below = sizes.filter((x) => x.px! < value).at(-1)
    const above = sizes.find((x) => x.px! > value)
    return {
      name: `${scale}${s.sep}${n}`,
      between: [below, above].filter(Boolean).map((x) => x!.token.id),
      scale,
    }
  }
  // Steps named by their size (`space.16` = 16px): the new one is named the same way.
  if (sizes.filter((x) => x.n === x.px).length >= 0.8 * sizes.length)
    return Number.isInteger(value) ? neighbours(value) : undefined
  // Steps numbered in proportion to their size (`space-4` = 16px, ×4): the same ratio.
  const k = sizes[0]!.px! / sizes[0]!.n
  if (k > 0 && sizes.every((x) => Math.abs(x.px! - x.n * k) < 0.01)) {
    const n = value / k
    return Number.isInteger(n) && !sizes.some((x) => x.n === n) ? neighbours(n) : undefined
  }
  return undefined
}

/**
 * A name for a new token holding `value`, from the system's scales; undefined when the system gives
 * no confident pattern. `near` is the closest existing token, which picks the size scale.
 */
export function suggestName(
  graph: DsGraph,
  parsed: { type: string; value: unknown },
  opts: { input?: Input; near?: string } = {},
): NameSuggestion | undefined {
  const input = opts.input ?? graph.defaultInput({})
  if (parsed.type === 'color') return colorName(graph, parsed.value as ColorValue, input)
  if (parsed.type === 'dimension') {
    const v = px(parsed.value)
    return v === undefined ? undefined : sizeName(graph, v, input, opts.near)
  }
  return undefined
}
