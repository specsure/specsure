import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DsGraph, scan } from '@dsgraph/core'
import { afterAll, describe, expect, it } from 'vitest'
import { MemorySource, NpmSource } from '../src/index.js'
import { NodeFsSource } from '../src/node.js'

describe('MemorySource', () => {
  it('lists by glob and reads objects as JSON', async () => {
    const s = new MemorySource({ './a/b.tokens.json': { n: { $type: 'number', $value: 1 } }, 'c.txt': 'x' })
    expect(await s.list('**/*.tokens.json')).toEqual(['a/b.tokens.json'])
    expect(DsGraph.from(await scan(s)).value('n')).toBe(1)
  })
})

describe('NodeFsSource', () => {
  let dir = ''
  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it('walks a directory, skipping node_modules', async () => {
    dir = await mkdtemp(join(tmpdir(), 'dsgraph-'))
    await mkdir(join(dir, 'tokens'), { recursive: true })
    await mkdir(join(dir, 'node_modules', 'x'), { recursive: true })
    await writeFile(
      join(dir, 'tokens', 'core.tokens.json'),
      JSON.stringify({ n: { $type: 'number', $value: 2 } }),
    )
    await writeFile(join(dir, 'node_modules', 'x', 'y.tokens.json'), '{}')
    const s = new NodeFsSource(dir)
    expect(await s.list('**/*.tokens.json')).toEqual(['tokens/core.tokens.json'])
    expect(DsGraph.from(await scan(s)).value('n')).toBe(2)
  })
})

describe.runIf(process.env.DSGRAPH_NETWORK_TESTS === '1')('NpmSource (network)', () => {
  it('resolves a version and reads files through jsDelivr', async () => {
    const s = new NpmSource('open-props', '^1')
    const version = await s.resolveVersion()
    expect(version).toMatch(/^1\./)
    const files = await s.list('**/*.css')
    expect(files.length).toBeGreaterThan(0)
    expect((await s.readText(files[0]!)).length).toBeGreaterThan(0)
    expect(await s.meta()).toEqual({ kind: 'npm', package: 'open-props', version })
  }, 30000)
})
