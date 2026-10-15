import type { Changeset, Coverage, Finding, Impact } from '@dsgraph/core'

/** One side of a comparison. Files never leave the browser; npm and GitHub are read through CORS APIs. */
export type SideInput =
  | { kind: 'npm'; pkg: string; version: string }
  | { kind: 'github'; repo: string; root?: string; ref: string }
  | { kind: 'files'; files: DroppedFile[] }

export interface DroppedFile {
  path: string
  text: string
}

export interface SideInfo {
  label: string
  /** Files the tokens came from. */
  files: string[]
  tokens: number
  modifiers: Array<{ name: string; contexts: string[] }>
}

/** A token as drawn in the graph: its value per context, as a swatch or short text. */
export interface GraphNode {
  type: string | null
  values: Array<{ when: Record<string, string>; swatch?: string; text: string }>
}

/**
 * The references between tokens of one side: `[from, to]` means `from` uses `to`'s value.
 * Only tokens that take part in a reference are listed.
 */
export interface TokenGraph {
  refs: Array<[from: string, to: string, when?: Record<string, string>]>
  nodes: Record<string, GraphNode>
}

export interface RunRequest {
  id: number
  base: SideInput
  head: SideInput
  /** Glob(s) that pick token files, comma-separated; empty = auto-detect. */
  include: string
  /** For private GitHub repositories; kept in the tab, never put into links. */
  githubToken?: string
  /** The project that uses the tokens, read in the browser; never put into links. */
  code?: DroppedFile[]
}

/** What the comparison means for a project's code. Checked against the old version, which it uses today. */
export interface CodeReport {
  files: number
  skipped: Array<{ file: string; message: string }>
  /** Share of the code's design values on tokens of the old version. */
  coverage: Coverage
  /** Where each change reaches into the code. */
  impact: Impact
  /** Values written by hand, deprecated and unknown variables, against the old version. */
  findings: Finding[]
}

export type RunResponse =
  | {
      id: number
      ok: true
      changeset: Changeset
      types: Array<[string, string | null]>
      base: SideInfo
      head: SideInfo
      findings: Finding[]
      graph: { base: TokenGraph; head: TokenGraph }
      code?: CodeReport
      ms: number
    }
  | {
      id: number
      ok: false
      side?: 'base' | 'head'
      error: string
      /** GitHub refused without a token: the repository may be private. */
      hint?: 'private'
    }

/** Stage of a run; the page words it in its language. */
export type Stage = 'reading' | 'comparing' | 'code'
export type Progress = { id: number; progress: Stage }
