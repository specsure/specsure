import { readFileSync } from 'node:fs'
import { GENERATOR } from '@dsgraph/core'
import { describe, expect, it } from 'vitest'
import { VERSION } from '../src/main.js'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const version = (JSON.parse(read('../package.json')) as { version: string }).version

describe('versions', () => {
  it('match package.json everywhere they are written in code (npm run version:set keeps them so)', () => {
    expect(VERSION).toBe(version)
    expect(GENERATOR).toBe(`dsgraph@${version}`)
    expect(read('../../dsgraph-mcp/src/server.ts')).toContain(`opts.version ?? '${version}'`)
    for (const pkg of ['schema', 'core', 'sources', 'adapters', 'rules', 'report', 'mcp'])
      expect((JSON.parse(read(`../../dsgraph-${pkg}/package.json`)) as { version: string }).version).toBe(
        version,
      )
  })
})
