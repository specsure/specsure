import type { SourceMeta } from '@dsgraph/schema'

/** Virtual file system every adapter reads through (spec section 4.1). Paths are posix, relative to the root. */
export interface Source {
  readonly id: string
  list(patterns: string | readonly string[]): Promise<string[]>
  readText(path: string): Promise<string>
  meta(): Promise<SourceMeta>
}
