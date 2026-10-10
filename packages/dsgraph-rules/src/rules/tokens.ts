import {
  type ColorValue,
  colorToHex,
  compareValues,
  isInSrgbGamut,
  matchPath,
  normalizeName,
  toOklab,
} from '@dsgraph/core'
import { contrastRatio } from '../color.js'
import type { Rule } from '../types.js'

const asArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

export const deprecatedReference: Rule = {
  id: 'token/deprecated-reference',
  description: 'A token references a deprecated token.',
  defaultSeverity: 'warning',
  run({ graph, report }) {
    for (const [, from, to] of graph.edges('aliases')) {
      const source = graph.token(from)
      const target = graph.token(to)
      if (!source || !target?.deprecated || source.deprecated) continue
      const replacement = target.deprecated.replacement
      report({
        message: `"${from}" references deprecated "${to}"${replacement ? `; use "${replacement}"` : ''}`,
        nodes: [from, to],
        evidence: { reason: target.deprecated.reason, replacement },
        token: source,
      })
    }
  },
}

export const normalizedCollision: Rule = {
  id: 'naming/normalized-collision',
  description: 'Different tokens map to the same name in code (CSS, Figma) after normalization.',
  defaultSeverity: 'warning',
  run({ graph, report }) {
    const byName = new Map<string, string[]>()
    for (const t of graph.tokens()) {
      const n = normalizeName(t.id)
      byName.set(n, [...(byName.get(n) ?? []), t.id])
    }
    for (const [name, ids] of byName)
      if (ids.length > 1)
        report({
          message: `${ids.map((i) => `"${i}"`).join(', ')} all normalize to "${name}"`,
          nodes: ids,
          evidence: { name },
        })
  },
}

export const hexMismatch: Rule = {
  id: 'color/hex-mismatch',
  description: 'The hex fallback of a color does not match its components.',
  defaultSeverity: 'warning',
  run({ graph, report }) {
    for (const t of graph.tokens({ type: 'color' })) {
      for (const v of t.values) {
        const c = v.value as ColorValue | null
        if (!c?.hex) continue
        const actual = colorToHex(c)
        const diff = [1, 3, 5].some(
          (i) =>
            Math.abs(
              Number.parseInt(actual.slice(i, i + 2), 16) - Number.parseInt(c.hex!.slice(i, i + 2), 16),
            ) > 1,
        )
        if (diff)
          report({
            message: `"${t.id}": hex ${c.hex} does not match the color (${actual})`,
            nodes: [t.id],
            evidence: { hex: c.hex, computed: actual },
            when: v.when,
            token: t,
          })
      }
    }
  },
}

export const outOfGamut: Rule = {
  id: 'color/out-of-gamut',
  description: 'A wide-gamut color is outside sRGB and has no hex fallback.',
  defaultSeverity: 'info',
  run({ graph, report }) {
    for (const t of graph.tokens({ type: 'color' }))
      for (const v of t.values) {
        const c = v.value as ColorValue | null
        if (c && !c.hex && !isInSrgbGamut(c))
          report({
            message: `"${t.id}" is outside sRGB; add a hex fallback for sRGB targets`,
            nodes: [t.id],
            evidence: { space: c.space },
            when: v.when,
            token: t,
          })
      }
  },
}

/** Color ramps: siblings whose last name segment is a number (`blue.100`, `blue-500`), at least 3 stops. */
function ramps(graph: Parameters<Rule['run']>[0]['graph']) {
  const groups = new Map<string, Array<{ id: string; step: number }>>()
  for (const t of graph.tokens({ type: 'color' })) {
    const segs = normalizeName(t.id).split('.')
    const step = Number(segs.at(-1))
    if (segs.length < 2 || !/^\d+$/.test(segs.at(-1)!) || !Number.isFinite(step)) continue
    const key = segs.slice(0, -1).join('.')
    groups.set(key, [...(groups.get(key) ?? []), { id: t.id, step }])
  }
  return [...groups]
    .filter(([, stops]) => stops.length >= 3)
    .map(([name, stops]) => ({ name, stops: stops.sort((a, b) => a.step - b.step) }))
}

export const nonMonotonicPalette: Rule = {
  id: 'palette/non-monotonic',
  description: 'Lightness of a numeric color ramp does not change in one direction.',
  defaultSeverity: 'warning',
  run({ graph, report }) {
    for (const { name, stops } of ramps(graph)) {
      const l = stops.map((s) => {
        const v = graph.value(s.id) as ColorValue | null
        return v ? toOklab(v)[0] : Number.NaN
      })
      const dir = Math.sign(l.at(-1)! - l[0]!)
      for (let i = 1; i < stops.length; i++) {
        const step = l[i]! - l[i - 1]!
        if (Number.isNaN(step) || Math.abs(step) < 1e-4) continue
        if (Math.sign(step) !== dir)
          report({
            message: `Ramp "${name}": lightness goes the wrong way from ${stops[i - 1]!.step} to ${stops[i]!.step}`,
            nodes: [stops[i - 1]!.id, stops[i]!.id],
            evidence: {
              ramp: name,
              from: Math.round(l[i - 1]! * 1000) / 1000,
              to: Math.round(l[i]! * 1000) / 1000,
            },
          })
      }
    }
  },
}

export const duplicateStops: Rule = {
  id: 'palette/duplicate-stops',
  description: 'Two steps of a numeric color ramp have the same color.',
  defaultSeverity: 'warning',
  run({ graph, report }) {
    for (const { name, stops } of ramps(graph))
      for (let i = 1; i < stops.length; i++) {
        const a = graph.value(stops[i - 1]!.id)
        const b = graph.value(stops[i]!.id)
        if (a && b && compareValues('color', a, b).result !== 'changed')
          report({
            message: `Ramp "${name}": steps ${stops[i - 1]!.step} and ${stops[i]!.step} are the same color`,
            nodes: [stops[i - 1]!.id, stops[i]!.id],
            evidence: { ramp: name },
          })
      }
  },
}

export const contrastMatrix: Rule = {
  id: 'a11y/contrast-matrix',
  description: 'Every text role over every surface role meets the minimum WCAG contrast in every context.',
  defaultSeverity: 'off',
  run({ graph, options, report }) {
    const text = asArray(options.text)
    const surfaces = asArray(options.surfaces)
    const min = typeof options.min === 'number' ? options.min : 4.5
    const acknowledged = new Set(asArray(options.acknowledged))
    if (text.length === 0 || surfaces.length === 0) return
    const textTokens = graph.tokens({ type: 'color' }).filter((t) => text.some((p) => matchPath(t.id, p)))
    const surfaceTokens = graph
      .tokens({ type: 'color' })
      .filter((t) => surfaces.some((p) => matchPath(t.id, p)))
    const inputs = graph.inputs().slice(0, 64)
    for (const fg of textTokens)
      for (const bg of surfaceTokens) {
        if (fg.id === bg.id) continue
        const failing = new Map<string, { when: Record<string, string>; ratio: number }>()
        for (const input of inputs) {
          const f = graph.value(fg.id, input) as ColorValue | null
          const b = graph.value(bg.id, input) as ColorValue | null
          if (!f || !b) continue
          const ratio = Math.round(contrastRatio(f, b) * 100) / 100
          if (ratio < min) failing.set(JSON.stringify(input), { when: input, ratio })
        }
        if (failing.size === 0) continue
        const pair = `${fg.id} × ${bg.id}`
        const worst = [...failing.values()].sort((a, b) => a.ratio - b.ratio)[0]!
        const all = failing.size === inputs.length
        const finding = {
          message: `${pair}: contrast ${worst.ratio} is below ${min}${all ? '' : ` in ${failing.size} of ${inputs.length} contexts`}`,
          nodes: [fg.id, bg.id],
          evidence: { ratio: worst.ratio, min, contexts: [...failing.values()].map((f) => f.when) },
          ...(all ? {} : { when: worst.when }),
        }
        report(
          acknowledged.has(pair)
            ? { ...finding, severity: 'info', message: `${finding.message} (acknowledged)` }
            : finding,
        )
      }
  },
}
