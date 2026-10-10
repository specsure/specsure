import type { Config, DsGraph, Finding, Severity, Token, When } from '@dsgraph/core'

export interface RuleContext {
  graph: DsGraph
  options: Record<string, unknown>
  config: Config
  report(finding: {
    message: string
    nodes: string[]
    evidence?: Record<string, unknown>
    when?: When
    token?: Token
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
