import type { Finding, Token, When } from '@dsgraph/core'
import type { Description, FindResult } from '@dsgraph/report'
import type { CodeInput, SideInput, TokenGraph } from './types'

/** A token as the page lists it: everything the catalog and name search need, without the graph. */
export interface IndexRow {
  id: string
  type: string | null
  deprecated: boolean
  /** Takes its value from another token. */
  alias: boolean
  /** The first part of the name, for grouping. */
  group: string
  /** Its custom property in CSS, `--color-accent`. */
  css: string
  values: Array<{ when: When; text: string; swatch?: string }>
}

export interface LookupSummary {
  label: string
  files: string[]
  description: Description
}

/** A token in full, for the card. */
export interface TokenCard {
  token: Token
  values: Array<{ when: When; text: string; swatch?: string; via: string[] }>
  users: string[]
  allUsers: number
  sameValue: string[]
}

/** A value search: what was asked, read as a value, and the tokens for it; null when it is not a value. */
export interface ValueAnswer {
  /** With no exact token: a name for a new one from the system's own scale. */
  suggestion?: { name: string; between: string[]; scale: string }
  property?: string
  /** The property was written in the search (`background: #fff`), not picked. */
  fromQuery?: boolean
  result: FindResult & { groups: Array<FindResult['groups'][number] & { swatch?: string }> }
}

/** One value written by hand in a pasted snippet, and the token for it. */
export interface SnippetEdit {
  line: number
  from: string
  to: string
  token: string
  exact: boolean
  /** Replaced in the output; a value with no exact token is only suggested. */
  applied: boolean
  deltaE?: number
  distance?: number
}

export interface SnippetAnswer {
  output: string
  edits: SnippetEdit[]
  language: 'css' | 'tsx'
}

export type Use = 'text' | 'background' | 'border' | 'shadow'

export interface OverviewToken {
  id: string
  text: string
  swatch?: string
}

/** A value held by tokens for different uses, and the token the search picks for each. */
export interface Trap {
  value: string
  swatch?: string
  /** How many tokens hold it. */
  count: number
  picks: Array<{ use: Exclude<Use, 'shadow'>; state?: string; token: string }>
}

/** How the system is meant to be used, read from its names and references. */
export interface Overview {
  uses: Array<{ use: Use; tokens: OverviewToken[]; total: number }>
  states: Array<{ state: string; tokens: OverviewToken[]; total: number }>
  space: Array<OverviewToken & { px: number }>
  radius: Array<OverviewToken & { px: number }>
  traps: Trap[]
  /** Values with such a choice among the ones checked. */
  trapCount: number
  /** Shared values checked: the most shared ones. */
  checked: number
}

/** The page's own example: code written by hand with the open system's values, and the same on tokens. */
export interface DemoAnswer {
  input: string
  output: string
}

export interface CodeSite {
  file: string
  line: number
  text: string
}

/** One value written by hand in the project, with the token for it or the closest one. */
export interface HandGroup {
  value: string
  type: 'color' | 'dimension'
  swatch?: string
  /** Places in the code, and in how many files. */
  count: number
  files: number
  token: string
  /** What to write instead: `var(--…)`, or the class for a utility class. */
  replacement: string
  exact: boolean
  deltaE?: number
  distance?: number
  /** For a value with no exact token: the group of the closest one, where a new token would go. */
  group?: string
  /** A name for that new token from the system's own scale, with the steps it falls between. */
  suggestion?: { name: string; between: string[]; scale: string }
  sites: CodeSite[]
}

/** A variable in the code that is not a token (misspelled, removed) or is deprecated. */
export interface VarGroup {
  name: string
  kind: 'unknown' | 'deprecated'
  count: number
  replacement?: string
  /** For an unknown one: the token name it is closest to. */
  suggestion?: string
  sites: CodeSite[]
}

export interface ProjectAnswer {
  label?: string
  files: number
  limited?: number
  skipped: number
  coverage: {
    fromTokens: number
    byHand: number
    share: number | null
    color: { fromTokens: number; byHand: number }
    size: { fromTokens: number; byHand: number }
  }
  replace: HandGroup[]
  missing: HandGroup[]
  variables: VarGroup[]
}

export type LookupRequest =
  | { id: number; kind: 'open'; source: SideInput; include: string; githubToken?: string }
  | {
      id: number
      kind: 'find'
      text: string
      property?: string
      state?: string
      context: Record<string, string>
    }
  | { id: number; kind: 'token'; token: string }
  | { id: number; kind: 'snippet'; text: string }
  | { id: number; kind: 'demo' }
  | { id: number; kind: 'overview' }
  | { id: number; kind: 'project'; input: CodeInput; githubToken?: string }
  | { id: number; kind: 'health' }

export type LookupResponse =
  | {
      id: number
      ok: true
      kind: 'open'
      summary: LookupSummary
      index: IndexRow[]
      graph: TokenGraph
      ms: number
    }
  | { id: number; ok: true; kind: 'find'; answer: ValueAnswer | null }
  | { id: number; ok: true; kind: 'token'; card: TokenCard | null }
  | { id: number; ok: true; kind: 'snippet'; snippet: SnippetAnswer }
  | { id: number; ok: true; kind: 'demo'; demo: DemoAnswer | null }
  | { id: number; ok: true; kind: 'overview'; overview: Overview }
  | { id: number; ok: true; kind: 'project'; project: ProjectAnswer }
  | { id: number; ok: true; kind: 'health'; findings: Finding[] }
  | { id: number; ok: false; error: string; hint?: 'private' | 'reload' }
