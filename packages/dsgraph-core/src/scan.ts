import type { Config, Snapshot } from '@dsgraph/schema'
import { DiagnosticBag } from './diagnostics.js'
import { parseJsonLenient } from './json.js'
import { matchGlob } from './path.js'
import { expandModes, systemFromModeFiles } from './resolver/modes.js'
import {
  systemFromDocuments,
  systemFromResolver,
  type TokenDocument,
  type TokenSystem,
} from './resolver/system.js'
import { buildSnapshot } from './snapshot.js'
import { prefetch, type Source } from './source.js'

/** The scan part of `dsgraph.config.json`. */
export type ScanConfig = Config

/**
 * An adapter that turns non-DTCG token sources (CSS custom properties, token-set JSON…) into a
 * token system. Adapters never resolve references; the core does (spec section 4.2).
 */
export interface TokenAdapter {
  readonly name: string
  /**
   * `first`: tried before DTCG token files, for formats with their own markers (token sets with
   * themes, value/type JSON). `fallback` (default): tried only when no token files are found.
   */
  readonly priority?: 'first' | 'fallback'
  /** Files this adapter would read; empty when it does not apply. */
  detect(source: Source, config: ScanConfig): Promise<string[]>
  load(source: Source, files: string[], config: ScanConfig, diag: DiagnosticBag): Promise<TokenSystem>
}

export interface ScanOptions {
  adapters?: readonly TokenAdapter[]
}

const DEFAULT_INCLUDE = ['**/*.tokens.json', '**/*.tokens']
const ALWAYS_EXCLUDE = ['**/node_modules/**', '**/.git/**']
const BUILD_OUTPUT = ['**/dist/**']
export const DEFAULT_EXCLUDE = [...ALWAYS_EXCLUDE, ...BUILD_OUTPUT]

/** Scan config plus the fallback flag: read build output (`dist/`) when nothing else has tokens. */
type LoadConfig = ScanConfig & { includeBuild?: boolean }

/**
 * Paths a section (`tokens` or `css`) skips. Build output is skipped only when looking on our
 * own: files named in `include` are read wherever they are.
 */
export function excludeFor(config: ScanConfig, section: 'tokens' | 'css'): string[] {
  const own = config[section]
  const skipBuild = !own?.include && !(config as LoadConfig).includeBuild
  return [...ALWAYS_EXCLUDE, ...(skipBuild ? BUILD_OUTPUT : []), ...(own?.exclude ?? [])]
}

/** JSON files that are never token files, skipped when looking through all `*.json`. */
export const NOT_TOKENS =
  /(^|\/)(package(-lock)?|tsconfig[\w.-]*|jsconfig|composer|lerna|nx|project|turbo|vercel|biome|renovate|manifest|\.?[\w-]*rc|[\w.-]*\.schema|[\w.-]*\.resolver|dsgraph\.config)\.json$/i

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
  const exclude = excludeFor(config, 'tokens')
  const notExcluded = (p: string) => !matchGlob(p, exclude)
  const readJson = async (path: string): Promise<unknown> => {
    const { value, lenient } = parseJsonLenient(await source.readText(path))
    if (lenient) diag.info('tokens/non-json', 'File uses JSONC or JSON5 syntax', { file: path })
    return value
  }
  const fromAdapters = async (priority: 'first' | 'fallback'): Promise<TokenSystem | undefined> => {
    for (const adapter of opts.adapters ?? []) {
      if ((adapter.priority ?? 'fallback') !== priority) continue
      const files = await adapter.detect(source, config)
      if (files.length > 0) return expandModes(await adapter.load(source, files, config, diag), diag)
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
    const sys = await fromAdapters('fallback')
    if (sys) return sys
  }
  const first = await fromAdapters('first')
  if (first) return first

  let files = (await source.list(config.tokens?.include ?? DEFAULT_INCLUDE)).filter(notExcluded)
  if (files.length === 0 && !config.tokens?.include) {
    // DTCG documents are often plain `tokens.json`; look for `$value` in any JSON file.
    const json = (await source.list(['**/*.json', '**/*.json5'])).filter(
      (p) => notExcluded(p) && !NOT_TOKENS.test(p),
    )
    files = []
    await prefetch(source, json.slice(0, 2000))
    for (const p of json.slice(0, 2000))
      if (/["']?\$value["']?\s*:/.test(await source.readText(p))) files.push(p)
  }
  if (files.length === 0) {
    const sys = await fromAdapters('fallback')
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
  await prefetch(source, files)
  for (const file of files) {
    try {
      docs.push({ file, tree: await readJson(file) })
    } catch (e) {
      diag.error('tokens/invalid-json', (e as Error).message, { file })
    }
  }
  return expandModes(systemFromModeFiles(docs, diag) ?? systemFromDocuments(docs), diag)
}

const isEmpty = (s: TokenSystem): boolean =>
  [...s.sets.values()].every((d) => d.length === 0) &&
  [...s.modifiers.values()].every((m) => [...m.contexts.values()].every((d) => d.length === 0))

/** Scans a source into a snapshot. */
export async function scan(
  source: Source,
  config: ScanConfig = {},
  opts: ScanOptions = {},
): Promise<Snapshot> {
  let diagnostics = new DiagnosticBag()
  let system = await loadSystem(source, config, diagnostics, opts)
  // Published packages often keep tokens only in their build output: look there before giving up.
  const explicit = config.tokens?.include || config.tokens?.resolver || config.css?.include
  if (!explicit && isEmpty(system)) {
    const retry = new DiagnosticBag()
    const built = await loadSystem(source, { ...config, includeBuild: true } as LoadConfig, retry, opts)
    if (!isEmpty(built)) {
      retry.info('tokens/build-output', 'No token sources outside dist/; read the build output')
      system = built
      diagnostics = retry
    }
  }
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
