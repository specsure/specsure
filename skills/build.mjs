// Copies each pack's shared CLI reference into its skills and packs one ZIP per pack for
// marketplaces that take an upload (Agensi): README.md, shared/ and skills/<name>/ at the top.
// node skills/build.mjs
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('.', import.meta.url).pathname
const dist = join(root, 'dist')
rmSync(dist, { recursive: true, force: true })
mkdirSync(dist)
for (const pack of readdirSync(root, { withFileTypes: true })) {
  if (!pack.isDirectory() || pack.name === 'dist') continue
  const dir = join(root, pack.name)
  const shared = join(dir, 'shared')
  for (const skill of readdirSync(join(dir, 'skills'))) {
    const refs = join(dir, 'skills', skill, 'references')
    mkdirSync(refs, { recursive: true })
    for (const f of readdirSync(shared)) copyFileSync(join(shared, f), join(refs, f))
  }
  execFileSync('zip', ['-qr', join(dist, `${pack.name}.zip`), 'README.md', 'shared', 'skills', '-x', '*.DS_Store'], { cwd: dir })
  console.log(`packed ${pack.name}`)
}
