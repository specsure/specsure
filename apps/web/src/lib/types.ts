import type { Changeset, Finding } from '@dsgraph/core'

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

export interface RunRequest {
  id: number
  base: SideInput
  head: SideInput
  /** Glob(s) that pick token files, comma-separated; empty = auto-detect. */
  include: string
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
      ms: number
    }
  | { id: number; ok: false; side?: 'base' | 'head'; error: string }

export type Progress = { id: number; progress: string }
