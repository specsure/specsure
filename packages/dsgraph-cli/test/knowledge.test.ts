import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadKnowledge } from '../src/main.js'

describe('loadKnowledge', () => {
  it('reads the file named by DSGRAPH_KNOWLEDGE, relative to the project', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsgraph-knowledge-'))
    const pack = { schema: 'dsgraph/knowledge@1', version: '1.0.0', vocabulary: { rest: ['idle'] } }
    await writeFile(join(dir, 'pack.json'), JSON.stringify(pack))
    expect(await loadKnowledge(dir, { DSGRAPH_KNOWLEDGE: 'pack.json' })).toEqual(pack)
    await writeFile(join(dir, 'bad.json'), '{"schema":"x"}')
    await expect(loadKnowledge(dir, { DSGRAPH_KNOWLEDGE: 'bad.json' })).rejects.toThrow(/bad\.json/)
  })

  it('is none when turned off or when no pack is installed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsgraph-knowledge-'))
    expect(await loadKnowledge(dir, { DSGRAPH_KNOWLEDGE: 'off' })).toBeUndefined()
    expect(await loadKnowledge(dir, {})).toBeUndefined()
  })
})
