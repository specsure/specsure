import type { Origin } from '@dsgraph/schema'
import type { DiagnosticBag } from '../diagnostics.js'
import { isPlainObject, tokenId } from '../path.js'
import { toPointer } from '../pointer.js'

export interface GroupProps {
  type?: string
  description?: string
  deprecated?: boolean | string
  extends?: unknown
  extensions?: Record<string, unknown>
}

export interface RawToken {
  id: string
  path: string[]
  /** The token object as authored. An object with only `$ref` is normalized to `$value: { $ref }`. */
  node: Record<string, unknown>
  origin: Origin
  inheritedFrom: string | null
  flags: string[]
}

export interface RawGroup {
  id: string
  path: string[]
  props: GroupProps
  origin: Origin
}

export interface FlatDoc {
  tokens: Map<string, RawToken>
  groups: Map<string, RawGroup>
}

const GROUP_PROPS = new Set(['$type', '$description', '$deprecated', '$extends', '$extensions'])
/** `$`-prefixed keys commonly found at the root of token files; ignored without a diagnostic. */
const IGNORED_PROPS = new Set(['$schema', '$metadata', '$themes', '$defs'])
const TOKEN_PROPS = new Set(['$value', '$type', '$description', '$deprecated', '$extensions', '$ref'])

export const isTokenObject = (o: Record<string, unknown>): boolean =>
  Object.hasOwn(o, '$value') || typeof o.$ref === 'string'

/** Flattens one DTCG document into tokens and groups keyed by dot path. Does not resolve anything. */
export function flattenDocument(tree: unknown, file: string, diag: DiagnosticBag): FlatDoc {
  const doc: FlatDoc = { tokens: new Map(), groups: new Map() }
  if (!isPlainObject(tree)) {
    diag.error('dtcg/invalid-document', 'A design token document must be a JSON object', {
      file,
      pointer: '',
    })
    return doc
  }

  const readGroupProps = (obj: Record<string, unknown>, pointer: string): GroupProps => {
    const props: GroupProps = {}
    const loc = { file, pointer }
    if (obj.$type !== undefined) {
      if (typeof obj.$type === 'string') props.type = obj.$type
      else diag.error('dtcg/invalid-type-property', '$type must be a string', loc)
    }
    if (obj.$description !== undefined) {
      if (typeof obj.$description === 'string') props.description = obj.$description
      else diag.error('dtcg/invalid-description', '$description must be a string', loc)
    }
    if (obj.$deprecated !== undefined) {
      if (typeof obj.$deprecated === 'boolean' || typeof obj.$deprecated === 'string')
        props.deprecated = obj.$deprecated
      else diag.error('dtcg/invalid-deprecated', '$deprecated must be a boolean or a string', loc)
    }
    if (obj.$extends !== undefined) props.extends = obj.$extends
    if (obj.$extensions !== undefined) {
      if (isPlainObject(obj.$extensions)) props.extensions = obj.$extensions
      else diag.error('dtcg/invalid-extensions', '$extensions must be an object', loc)
    }
    return props
  }

  const addToken = (obj: Record<string, unknown>, path: string[], segs: string[]): void => {
    const pointer = toPointer(segs)
    const loc = { file, pointer }
    const flags: string[] = []
    let node = obj
    if (!Object.hasOwn(obj, '$value')) {
      node = { ...obj, $value: { $ref: obj.$ref } }
      delete node.$ref
      flags.push('ref-only')
    }
    for (const key of Object.keys(obj)) {
      if (key.startsWith('$')) {
        if (!TOKEN_PROPS.has(key)) diag.info('dtcg/unknown-property', `Unknown token property "${key}"`, loc)
      } else if (isPlainObject(obj[key])) {
        diag.error(
          'dtcg/token-with-children',
          `Object has both $value and child "${key}"; it cannot be a token and a group at once`,
          loc,
        )
      }
    }
    if (obj.$type !== undefined && typeof obj.$type !== 'string')
      diag.error('dtcg/invalid-type-property', '$type must be a string', loc)
    const id = tokenId(path)
    doc.tokens.set(id, { id, path, node, origin: { file, pointer }, inheritedFrom: null, flags })
  }

  const walk = (obj: Record<string, unknown>, path: string[], segs: string[]): void => {
    const pointer = toPointer(segs)
    doc.groups.set(tokenId(path), {
      id: tokenId(path),
      path,
      props: readGroupProps(obj, pointer),
      origin: { file, pointer },
    })
    for (const key of Object.keys(obj)) {
      const child = obj[key]
      const childSegs = [...segs, key]
      const loc = { file, pointer: toPointer(childSegs) }
      if (key.startsWith('$') && key !== '$root') {
        if (!GROUP_PROPS.has(key) && !IGNORED_PROPS.has(key))
          diag.info('dtcg/unknown-property', `Unknown group property "${key}"`, { file, pointer })
        continue
      }
      if (key !== '$root' && /[{}.]/.test(key)) {
        diag.error('dtcg/invalid-name', `Name "${key}" must not contain "{", "}" or "."`, loc)
        continue
      }
      if (!isPlainObject(child)) {
        diag.error('dtcg/invalid-node', `"${key}" is neither a token nor a group`, loc)
        continue
      }
      if (isTokenObject(child)) addToken(child, [...path, key], childSegs)
      else if (key === '$root') diag.error('dtcg/invalid-root-token', '$root must be a token', loc)
      else walk(child, [...path, key], childSegs)
    }
  }

  walk(tree, [], [])
  return doc
}
