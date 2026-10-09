import type { Change, ChangeKind, Level } from '@dsgraph/schema'

export interface SemverPolicy {
  levels: Record<ChangeKind, Level>
  /** Value changes below these thresholds are `patch` instead of the `token.value-changed` level. */
  imperceptible: { deltaE: number; px: number }
}

export const DEFAULT_POLICY: SemverPolicy = {
  levels: {
    'token.added': 'minor',
    'token.removed': 'major',
    'token.renamed': 'major',
    'token.value-changed': 'minor',
    'token.notation-changed': 'none',
    'token.alias-retargeted': 'patch',
    'token.type-changed': 'major',
    'token.contexts-changed': 'minor',
    'token.missing-in-context': 'major',
    'token.deprecated': 'minor',
    'token.undeprecated': 'minor',
    'token.description-changed': 'patch',
    'token.extensions-changed': 'none',
    'group.extends-changed': 'patch',
    'context.added': 'minor',
    'context.removed': 'major',
    'modifier.added': 'minor',
    'modifier.removed': 'major',
  },
  imperceptible: { deltaE: 1, px: 0.5 },
}

export const LEVEL_RANK: Record<Level, number> = { none: 0, patch: 1, minor: 2, major: 3 }

export function maxLevel(levels: Iterable<Level>): Level {
  let best: Level = 'none'
  for (const l of levels) if (LEVEL_RANK[l] > LEVEL_RANK[best]) best = l
  return best
}

export function mergePolicy(p?: {
  levels?: Partial<Record<ChangeKind, Level>>
  imperceptible?: Partial<SemverPolicy['imperceptible']>
}): SemverPolicy {
  return {
    levels: { ...DEFAULT_POLICY.levels, ...p?.levels },
    imperceptible: { ...DEFAULT_POLICY.imperceptible, ...p?.imperceptible },
  }
}

/**
 * Level of one change from the point of view of consumers referencing tokens by name.
 * Tokens in non-public layers are capped at `patch`: their effect on consumers shows up
 * as propagated changes of public tokens.
 */
export function levelOf(
  change: Pick<Change, 'kind' | 'delta'>,
  policy: SemverPolicy,
  isPublic: boolean,
): Level {
  let level = policy.levels[change.kind]
  if (change.kind === 'token.value-changed' && change.delta) {
    const d = change.delta
    const dE = typeof d.deltaEOK === 'number' ? d.deltaEOK : undefined
    const px = typeof d.px === 'number' ? d.px : undefined
    const alphaOk = d.deltaAlpha === undefined || Math.abs(d.deltaAlpha as number) < 0.01
    if (
      (dE !== undefined && dE < policy.imperceptible.deltaE && alphaOk) ||
      (px !== undefined && Math.abs(px) < policy.imperceptible.px)
    )
      level = 'patch'
  }
  if (!isPublic && change.kind.startsWith('token.') && LEVEL_RANK[level] > LEVEL_RANK.patch) level = 'patch'
  return level
}
