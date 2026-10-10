import type { RuleSetting } from '@dsgraph/core'

/** Presets follow architecture patterns only — never specific design systems (neutrality principle). */
export const PRESETS: Record<string, Record<string, RuleSetting>> = {
  /** Sensible defaults; equal to the rules' default severities. */
  recommended: {
    'token/deprecated-reference': 'warning',
    'naming/normalized-collision': 'warning',
    'color/hex-mismatch': 'warning',
    'color/out-of-gamut': 'info',
    'palette/non-monotonic': 'warning',
    'palette/duplicate-stops': 'warning',
  },
  /** Only what DTCG 2025.10 requires: legacy syntax and non-standard values become errors. */
  'dtcg-strict': {
    'dtcg/legacy-syntax': 'error',
    'dtcg/invalid-unit': 'error',
    'dtcg/invalid-font-weight': 'error',
    'dtcg/unknown-type': 'error',
    'dtcg/typography-missing-field': 'error',
    'tokens/non-json': 'error',
  },
  /** Two layers: `core` holds raw values and aliases nothing; `semantic` references `core` directly. */
  'two-layer': {
    'layer/allowed-sources': ['warning', { allow: { core: [], semantic: ['core', 'semantic'] } }],
    'layer/alias-depth': ['warning', { layer: 'semantic', max: 0 }],
  },
}
