// Copies the built action into the public repository next to this one (../../../dsgraph-action):
// action.yml, dist/index.mjs, README.md and LICENSE. Commit and tag there.
import { cp, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = resolve(process.argv[2] ?? resolve(here, '../../../dsgraph-action'))
await mkdir(resolve(target, 'dist'), { recursive: true })
for (const f of ['action.yml', 'README.md', 'dist/index.mjs']) await cp(resolve(here, f), resolve(target, f))
await cp(resolve(here, '../../LICENSE'), resolve(target, 'LICENSE'))
console.log(`Synced to ${target}`)
