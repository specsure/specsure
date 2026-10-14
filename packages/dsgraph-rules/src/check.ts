import {
  type CodeIndex,
  type Config,
  canonicalize,
  type DsGraph,
  type Finding,
  type Severity,
  sha256Hex,
  VarMatcher,
  varNames,
} from '@dsgraph/core'
import { PRESETS } from './presets.js'
import { deprecatedUsage, hardcodedColor, offScale, unknownToken, unusedToken } from './rules/code.js'
import { aliasDepth, allowedSources } from './rules/layers.js'
import {
  contrastMatrix,
  deprecatedReference,
  duplicateStops,
  hexMismatch,
  nonMonotonicPalette,
  normalizedCollision,
  outOfGamut,
} from './rules/tokens.js'
import type { Rule, RuleContext } from './types.js'

export const RULES: readonly Rule[] = [
  deprecatedReference,
  normalizedCollision,
  hexMismatch,
  outOfGamut,
  nonMonotonicPalette,
  duplicateStops,
  contrastMatrix,
  aliasDepth,
  allowedSources,
  hardcodedColor,
  offScale,
  deprecatedUsage,
  unknownToken,
  unusedToken,
]

export interface Setting {
  severity: Severity | 'off'
  options: Record<string, unknown>
}

const RANK: Record<Severity, number> = { error: 3, warning: 2, info: 1 }

/** Rule defaults → presets from `extends` (in order) → `rules` from the config. */
export function resolveSettings(config: Config, rules: readonly Rule[] = RULES): Map<string, Setting> {
  const settings = new Map<string, Setting>()
  for (const r of rules) settings.set(r.id, { severity: r.defaultSeverity, options: {} })
  const apply = (entries: Record<string, unknown>) => {
    for (const [id, value] of Object.entries(entries)) {
      const prev = settings.get(id) ?? { severity: 'warning' as const, options: {} }
      if (Array.isArray(value))
        settings.set(id, {
          severity: value[0] as Setting['severity'],
          options: { ...prev.options, ...(value[1] as object) },
        })
      else settings.set(id, { ...prev, severity: value as Setting['severity'] })
    }
  }
  for (const name of config.extends ?? ['recommended']) {
    const preset = PRESETS[name]
    if (!preset) throw new Error(`Unknown preset "${name}". Available: ${Object.keys(PRESETS).join(', ')}`)
    apply(preset)
  }
  apply(config.rules ?? {})
  return settings
}

/**
 * Runs the rules over a graph. Parse diagnostics of the snapshot are reported as findings too;
 * their severity can be overridden (or turned off) by code in `rules`.
 */
export async function check(
  graph: DsGraph,
  config: Config = {},
  extraRules: readonly Rule[] = [],
  opts: { code?: CodeIndex } = {},
): Promise<Finding[]> {
  const rules = [...RULES, ...extraRules]
  const settings = resolveSettings(config, rules)
  const code = opts.code
  const vars = code ? new VarMatcher(graph, varNames(code), config.code?.prefix) : undefined
  const drafts: Array<Omit<Finding, 'id'>> = []

  const byOrigin = new Map<string, string>()
  for (const t of graph.tokens()) byOrigin.set(`${t.origin.file}#${t.origin.pointer}`, t.id)
  for (const d of graph.snapshot.diagnostics) {
    const severity = settings.get(d.code)?.severity ?? d.severity
    if (severity === 'off') continue
    const node = d.loc ? byOrigin.get(`${d.loc.file}#${d.loc.pointer}`) : undefined
    const f: Omit<Finding, 'id'> = { rule: d.code, severity, message: d.message, nodes: node ? [node] : [] }
    if (d.loc) f.loc = d.loc
    drafts.push(f)
  }

  for (const rule of rules) {
    const setting = settings.get(rule.id)!
    if (setting.severity === 'off') continue
    const ctx: RuleContext = {
      graph,
      options: setting.options,
      config,
      ...(code && vars ? { code, vars } : {}),
      report(r) {
        const f: Omit<Finding, 'id'> = {
          rule: rule.id,
          severity:
            r.severity && RANK[r.severity] < RANK[setting.severity as Severity]
              ? r.severity
              : (setting.severity as Severity),
          message: r.message,
          nodes: r.nodes,
        }
        if (r.evidence) f.evidence = r.evidence
        if (r.when) f.when = r.when
        if (r.loc) f.loc = r.loc
        else if (r.token) f.loc = r.token.origin
        drafts.push(f)
      },
    }
    rule.run(ctx)
  }

  const findings: Finding[] = []
  for (const d of drafts)
    findings.push({
      // Findings in code differ by position; findings on tokens keep the ids they had.
      id: `${d.rule}#${(await sha256Hex(canonicalize(d.loc?.line ? { n: d.nodes, w: d.when, m: d.message, l: d.loc } : { n: d.nodes, w: d.when, m: d.message }))).slice(0, 12)}`,
      ...d,
    })
  return findings.sort(
    (a, b) =>
      RANK[b.severity] - RANK[a.severity] ||
      a.rule.localeCompare(b.rule) ||
      a.message.localeCompare(b.message),
  )
}

export function countBySeverity(findings: readonly Finding[]): Record<Severity, number> {
  const out: Record<Severity, number> = { error: 0, warning: 0, info: 0 }
  for (const f of findings) out[f.severity]++
  return out
}
