import type { Finding, Token, When } from '@dsgraph/core'
import type { Description, FindResult } from '@dsgraph/report'
import type { SideInput, TokenGraph } from './types'

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

/** The page's own example: code written by hand with the open system's values, and the same on tokens. */
export interface DemoAnswer {
  input: string
  output: string
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
  | { id: number; ok: true; kind: 'health'; findings: Finding[] }
  | { id: number; ok: false; error: string; hint?: 'private' }
