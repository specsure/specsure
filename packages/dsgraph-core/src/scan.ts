import type { Snapshot } from '@dsgraph/schema'
import { DiagnosticBag } from './diagnostics.js'
import { parseJsonLenient } from './json.js'
import { matchGlob } from './path.js'
import {
  type Input,
  systemFromDocuments,
  systemFromResolver,
  type TokenDocument,
  type TokenSystem,
} from './resolver/system.js'
import { buildSnapshot, type LayerConfig } from './snapshot.js'
import type { Source } from './source.js'

export interface ScanConfig {
  tokens?: {
    include?: string[]
    exclude?: string[]
    /** Path to a `*.resolver.json`; auto-detected when omitted. */
    resolver?: string
    /** Glob order for plain token files (later wins on conflicts). */
    order?: string[]
    strict?: boolean
  }
  layers?: Record<string, LayerConfig>
  contexts?: { default?: Input; maxPermutations?: number }
}

const DEFAULT_INCLUDE = ['**/*.tokens.json', '**/*.tokens']
const DEFAULT_EXCLUDE = ['**/node_modules/**', '**/dist/**', '**/.git/**']

/** Loads a token system from a source: a resolver document if present, otherwise token files. */
export async function loadSystem(
  source: Source,
  config: ScanConfig,
  diag: DiagnosticBag,
): Promise<TokenSystem> {
  const exclude = [...DEFAULT_EXCLUDE, ...(config.tokens?.exclude ?? [])]
  const notExcluded = (p: string) => !matchGlob(p, exclude)
  const readJson = async (path: string): Promise<unknown> => {
    const { value, lenient } = parseJsonLenient(await source.readText(path))
    if (lenient)
      diag.info('tokens/non-json', 'File uses JSONC syntax (comments or trailing commas)', { file: path })
    return value
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

  const files = (await source.list(config.tokens?.include ?? DEFAULT_INCLUDE)).filter(notExcluded)
  const order = config.tokens?.order ?? []
  const rank = (p: string) => {
    const i = order.findIndex((g) => matchGlob(p, g))
    return i < 0 ? order.length : i
  }
  files.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  if (files.length === 0) diag.warn('tokens/no-files', 'No token files found')
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
export async function scan(source: Source, config: ScanConfig = {}): Promise<Snapshot> {
  const diagnostics = new DiagnosticBag()
  const system = await loadSystem(source, config, diagnostics)
  const opts: Parameters<typeof buildSnapshot>[1] = {
    source: await source.meta(),
    strict: config.tokens?.strict ?? false,
    diagnostics,
  }
  if (config.layers) opts.layers = config.layers
  if (config.contexts?.default) opts.defaultInput = config.contexts.default
  if (config.contexts?.maxPermutations) opts.maxPermutations = config.contexts.maxPermutations
  return buildSnapshot(system, opts)
}
