// Copies the built action into the public repository next to this one (../../../dsgraph-action):
// action.yml, dist/index.mjs, README.md, LICENSE and the knowledge pack's license, LICENSE-knowledge
// (the pack is built into dist/index.mjs). Commit and tag there.
import { cp, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = resolve(process.argv[2] ?? resolve(here, '../../../dsgraph-action'))
await mkdir(resolve(target, 'dist'), { recursive: true })
for (const f of ['action.yml', 'README.md', 'dist/index.mjs']) await cp(resolve(here, f), resolve(target, f))
await cp(resolve(here, '../../LICENSE'), resolve(target, 'LICENSE'))
const require = createRequire(import.meta.url)
await cp(
  resolve(dirname(require.resolve('@specsure/knowledge/package.json')), 'LICENSE'),
  resolve(target, 'LICENSE-knowledge'),
)
console.log(`Synced to ${target}`)
