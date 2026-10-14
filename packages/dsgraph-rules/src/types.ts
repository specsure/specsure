import type {
  CodeIndex,
  Config,
  DsGraph,
  Finding,
  Loc,
  Severity,
  Token,
  VarMatcher,
  When,
} from '@dsgraph/core'

export interface RuleContext {
  graph: DsGraph
  options: Record<string, unknown>
  config: Config
  /** The project's code, when checked with it (`--code`, `code` in the config). */
  code?: CodeIndex
  /** Custom property names in the code to tokens; present with `code`. */
  vars?: VarMatcher
  report(finding: {
    message: string
    nodes: string[]
    evidence?: Record<string, unknown>
    when?: When
    token?: Token
    /** Where in the code; takes precedence over the token's origin. */
    loc?: Loc
    severity?: Severity
  }): void
}

/** A rule is a pure function of the graph and its options (spec section 7.4). */
export interface Rule {
  id: string
  description: string
  defaultSeverity: Severity | 'off'
  run(ctx: RuleContext): void
}

export type { Finding }
