import { DiagnosticBag } from '../diagnostics.js'
import { type FlatDoc, flattenDocument } from '../dtcg/flatten.js'
import { expandExtends, mergeDocs } from '../dtcg/merge.js'
import { type ResolvedDoc, resolveDoc } from '../dtcg/resolve.js'
import { type Input, selectDocuments, type TokenDocument, type TokenSystem } from './system.js'

export interface SystemResolver {
  /** Resolves the system for one input (already validated). */
  resolve(input: Input, diag: DiagnosticBag): ResolvedDoc
  /** Diagnostics produced while flattening documents (independent of input). */
  readonly parseDiagnostics: DiagnosticBag
}

/** Caches flattened documents across inputs. */
export function createResolver(system: TokenSystem, opts: { strict: boolean }): SystemResolver {
  const parseDiagnostics = new DiagnosticBag()
  const flat = new Map<TokenDocument, FlatDoc>()
  const flatten = (d: TokenDocument): FlatDoc => {
    let f = flat.get(d)
    if (!f) {
      f = flattenDocument(d.tree, d.file, parseDiagnostics)
      flat.set(d, f)
    }
    return f
  }
  return {
    parseDiagnostics,
    resolve(input, diag) {
      const merged = mergeDocs(selectDocuments(system, input).map(flatten), diag)
      expandExtends(merged, diag)
      return resolveDoc(merged, diag, opts)
    },
  }
}
