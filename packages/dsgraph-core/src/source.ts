import type { SourceMeta } from '@dsgraph/schema'

/** Virtual file system every adapter reads through (spec section 4.1). Paths are posix, relative to the root. */
export interface Source {
  readonly id: string
  list(patterns: string | readonly string[]): Promise<string[]>
  readText(path: string): Promise<string>
  meta(): Promise<SourceMeta>
}

/**
 * Starts reading files several at a time, so the sequential reads that follow hit a source's
 * cache instead of waiting on the network one file after another. Errors surface on the later read.
 */
export async function prefetch(source: Source, paths: readonly string[], concurrency = 16): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < paths.length) {
      const path = paths[next++]!
      await source.readText(path).catch(() => undefined)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, paths.length) }, worker))
}
