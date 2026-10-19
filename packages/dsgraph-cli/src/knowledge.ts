import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { type Knowledge, readKnowledge } from '@dsgraph/core'

/** The npm package that carries Specsure's knowledge pack, installed next to the CLI or MCP server. */
export const KNOWLEDGE_PACKAGE = '@specsure/knowledge'

/**
 * The knowledge pack to read names with: the file named by `DSGRAPH_KNOWLEDGE` (`off` for none),
 * else `@specsure/knowledge` when it is installed (next to dsgraph or in the project), else none.
 */
export async function loadKnowledge(cwd: string, env = process.env): Promise<Knowledge | undefined> {
  const path = env.DSGRAPH_KNOWLEDGE?.trim()
  if (path === 'off') return undefined
  if (path) return parse(await readFile(resolve(cwd, path), 'utf8'), path)
  for (const from of [import.meta.url, resolve(cwd, 'package.json')]) {
    let file: string
    try {
      file = createRequire(from).resolve(`${KNOWLEDGE_PACKAGE}/knowledge.json`)
    } catch {
      continue
    }
    return parse(await readFile(file, 'utf8'), file)
  }
  return undefined
}

function parse(text: string, file: string): Knowledge {
  try {
    return readKnowledge(JSON.parse(text))
  } catch (e) {
    throw new Error(`Knowledge pack ${file}: ${(e as Error).message}`)
  }
}
