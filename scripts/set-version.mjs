// Sets the version of every published dsgraph package, their dependencies on each other, the site's
// dependencies and the version constants in code (CLI --version, MCP server, snapshot generator).
// The GitHub Action keeps its own version (its tags, v1.x). Usage: npm run version:set -- 0.3.0
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const version = process.argv[2]
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version ?? '')) {
  console.error('Usage: npm run version:set -- <x.y.z>')
  process.exit(1)
}
const root = new URL('..', import.meta.url).pathname
const manifests = [
  ...(await readdir(join(root, 'packages'), { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => join(root, 'packages', d.name, 'package.json')),
  join(root, 'apps/web/package.json'),
]
const ours = (name) => name === 'dsgraph' || name.startsWith('@dsgraph/')

for (const file of manifests) {
  const pkg = JSON.parse(await readFile(file, 'utf8'))
  if (!pkg.private) pkg.version = version
  for (const field of ['dependencies', 'devDependencies'])
    for (const name of Object.keys(pkg[field] ?? {})) if (ours(name)) pkg[field][name] = version
  await writeFile(file, `${JSON.stringify(pkg, null, 2)}\n`)
}

const constants = [
  [
    'packages/dsgraph-cli/src/main.ts',
    /export const VERSION = '[^']*'/,
    `export const VERSION = '${version}'`,
  ],
  [
    'packages/dsgraph-core/src/snapshot.ts',
    /export const GENERATOR = 'dsgraph@[^']*'/,
    `export const GENERATOR = 'dsgraph@${version}'`,
  ],
  [
    'packages/dsgraph-mcp/src/server.ts',
    /version: opts\.version \?\? '[^']*'/,
    `version: opts.version ?? '${version}'`,
  ],
]
for (const [file, re, text] of constants) {
  const path = join(root, file)
  const src = await readFile(path, 'utf8')
  if (!re.test(src)) throw new Error(`No version constant in ${file}`)
  await writeFile(path, src.replace(re, text))
}
console.log(`dsgraph ${version}: run npm install to refresh the lockfile`)
