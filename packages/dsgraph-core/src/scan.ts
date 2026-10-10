import type { Config, Snapshot } from '@dsgraph/schema'
import { DiagnosticBag } from './diagnostics.js'
import { parseJsonLenient } from './json.js'
import { matchGlob } from './path.js'
import {
  systemFromDocuments,
  systemFromResolver,
  type TokenDocument,
  type TokenSystem,
} from './resolver/system.js'
import { buildSnapshot } from './snapshot.js'
import type { Source } from './source.js'

/** The scan part of `dsgraph.config.json`. */
export type ScanConfig = Config

/**
 * An adapter that turns non-DTCG token sources (CSS custom properties, Tokens Studio…) into a
 * token system. Adapters never resolve references; the core does (spec section 4.2).
 */
export interface TokenAdapter {
  readonly name: string
  /** Files this adapter would read; empty when it does not apply. */
  detect(source: Source, config: ScanConfig): Promise<string[]>
  load(source: Source, files: string[], config: ScanConfig, diag: DiagnosticBag): Promise<TokenSystem>
}

export interface ScanOptions {
  adapters?: readonly TokenAdapter[]
}

const DEFAULT_INCLUDE = ['**/*.tokens.json', '**/*.tokens']
export const DEFAULT_EXCLUDE = ['**/node_modules/**', '**/dist/**', '**/.git/**']

/**
 * Loads a token system. Precedence: a resolver document, then DTCG token files, then adapters.
 * When only `css` is configured, adapters come before DTCG files.
 */
export async function loadSystem(
  source: Source,
  config: ScanConfig,
  diag: DiagnosticBag,
  opts: ScanOptions = {},
): Promise<TokenSystem> {
  const exclude = [...DEFAULT_EXCLUDE, ...(config.tokens?.exclude ?? [])]
  const notExcluded = (p: string) => !matchGlob(p, exclude)
  const readJson = async (path: string): Promise<unknown> => {
    const { value, lenient } = parseJsonLenient(await source.readText(path))
    if (lenient)
      diag.info('tokens/non-json', 'File uses JSONC syntax (comments or trailing commas)', { file: path })
    return value
  }
  const fromAdapters = async (): Promise<TokenSystem | undefined> => {
    for (const adapter of opts.adapters ?? []) {
      const files = await adapter.detect(source, config)
      if (files.length > 0) return adapter.load(source, files, config, diag)
    }
    return undefined
  }

  let resolverPath = config.tokens?.resolver
  if (!resolverPath) {
    const found = (await source.list('**/*.resolver.json')).filter(notExcluded).sort()
    if (found.length > 1)
      diag.warn('tokens/multiple-resolvers', `Found ${found.length} resolver documents; using "${found[0]}"`)
    resolverPath = found[0]
  }
  if (resolverPath) {
    let tree: unknown
    try {
      tree = await readJson(resolverPath)
    } catch (e) {
      diag.error('tokens/invalid-json', (e as Error).message, { file: resolverPath })
      return systemFromDocuments([])
    }
    return systemFromResolver(tree, resolverPath, readJson, diag)
  }

  if (config.css && !config.tokens) {
    const sys = await fromAdapters()
    if (sys) return sys
  }

  const files = (await source.list(config.tokens?.include ?? DEFAULT_INCLUDE)).filter(notExcluded)
  if (files.length === 0) {
    const sys = await fromAdapters()
    if (sys) return sys
    diag.warn('tokens/no-files', 'No token files found')
  }
  const order = config.tokens?.order ?? []
  const rank = (p: string) => {
    const i = order.findIndex((g) => matchGlob(p, g))
    return i < 0 ? order.length : i
  }
  files.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  const docs: TokenDocument[] = []
  for (const file of files) {
    try {
      docs.push({ file, tree: await readJson(file) })
    } catch (e) {
      diag.error('tokens/invalid-json', (e as Error).message, { file })
    }
  }
  return systemFromDocuments(docs)
}

/** Scans a source into a snapshot. */
export async function scan(
  source: Source,
  config: ScanConfig = {},
  opts: ScanOptions = {},
): Promise<Snapshot> {
  const diagnostics = new DiagnosticBag()
  const system = await loadSystem(source, config, diagnostics, opts)
  const build: Parameters<typeof buildSnapshot>[1] = {
    source: await source.meta(),
    strict: config.tokens?.strict ?? false,
    diagnostics,
  }
  if (config.layers) build.layers = config.layers
  if (config.contexts?.default) build.defaultInput = config.contexts.default
  if (config.contexts?.maxPermutations) build.maxPermutations = config.contexts.maxPermutations
  return buildSnapshot(system, build)
}
