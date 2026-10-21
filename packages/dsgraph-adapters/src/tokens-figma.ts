import {
  type DiagnosticBag,
  excludeFor,
  matchGlob,
  NOT_TOKENS,
  parseJsonLenient,
  prefetch,
  type ScanConfig,
  type Source,
  type TokenAdapter,
  type TokenDocument,
  type TokenSystem,
} from '@dsgraph/core'
import { figmaTokens, fromFigmaRest } from './figma.js'

/** A response of Figma's REST API for variables names its collections; nothing else does. */
const MARKER = /"variableCollections"\s*:/

async function responses(
  source: Source,
  config: ScanConfig,
): Promise<Array<{ file: string; tree: unknown }>> {
  const exclude = excludeFor(config, 'tokens')
  const files = (await source.list(config.tokens?.include ?? ['**/*.json']))
    .filter((p) => /\.json$/i.test(p) && !matchGlob(p, exclude) && !NOT_TOKENS.test(p))
    .sort()
    .slice(0, 2000)
  await prefetch(source, files)
  const out: Array<{ file: string; tree: unknown }> = []
  for (const file of files) {
    const text = await source.readText(file)
    if (!MARKER.test(text)) continue
    try {
      const tree = parseJsonLenient(text).value
      if (fromFigmaRest(tree)) out.push({ file, tree })
    } catch {
      // Not JSON: another adapter's business.
    }
  }
  return out
}

/**
 * Figma variables as Figma's REST API returns them (`GET /v1/files/:key/variables/local`, saved as
 * a `.json` file): each collection with one mode a set, each with several a modifier, its default
 * mode the default; references and library values as `figmaTokens` writes them.
 */
export const figmaVariables: TokenAdapter = {
  name: 'figma-variables',
  priority: 'first',

  async detect(source, config) {
    return (await responses(source, config)).map((r) => r.file)
  },

  async load(source, files, config, diag: DiagnosticBag): Promise<TokenSystem> {
    const wanted = new Set(files)
    // The collections and modes are the system's own structure, as a resolver would declare it.
    const system: TokenSystem = {
      sets: new Map(),
      modifiers: new Map(),
      order: [],
      synthetic: false,
      kind: 'dtcg',
    }
    for (const { file, tree } of await responses(source, config)) {
      if (!wanted.has(file)) continue
      const out = figmaTokens(fromFigmaRest(tree, file)!)
      const doc = (f: string): TokenDocument[] => [{ file: `${file}#${f}`, tree: out.files[f] }]
      for (const part of out.layout) {
        if (part.kind === 'set') {
          system.sets.set(part.name, doc(part.file))
          system.order.push({ kind: 'set', name: part.name })
        } else {
          system.modifiers.set(part.name, {
            contexts: new Map(part.contexts.map((c) => [c.name, doc(c.file)])),
            default: part.default,
          })
          system.order.push({ kind: 'modifier', name: part.name })
        }
      }
      for (const n of out.notes) diag.info('figma/left-out', `${n.name}: ${n.message}`, { file })
    }
    return system
  },
}
