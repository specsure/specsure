import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { main } from '../src/main.js'

let dir = ''
const run = async (...argv: string[]) => {
  let out = ''
  let err = ''
  const code = await main(argv, { stdout: (s) => (out += s), stderr: (s) => (err += s), cwd: dir })
  return { code, out, err }
}
const srgb = (r: number, g: number, b: number) => ({ colorSpace: 'srgb', components: [r, g, b] })

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dsgraph-cli-'))
  await mkdir(join(dir, 'v1'))
  await mkdir(join(dir, 'v2'))
  const tokens = (brand: number[], extra: Record<string, unknown> = {}) => ({
    color: { $type: 'color', brand: { $value: srgb(brand[0]!, brand[1]!, brand[2]!) }, ...extra },
    action: { $type: 'color', bg: { $value: '{color.brand}' } },
  })
  await writeFile(
    join(dir, 'v1', 'base.tokens.json'),
    JSON.stringify(tokens([0.18, 0.36, 1], { old: { $value: srgb(1, 1, 1) } })),
  )
  await writeFile(join(dir, 'v2', 'base.tokens.json'), JSON.stringify(tokens([0.2, 0.4, 1])))
  await mkdir(join(dir, 'app'))
  await writeFile(
    join(dir, 'app', 'button.css'),
    '.button {\n  background: var(--action-bg);\n  border-color: var(--color-old);\n  color: #ffffff;\n}\n',
  )
  await writeFile(
    join(dir, 'theme.css'),
    ':root { --ink: #1c1c1a; --text: var(--ink); --broken: var(--nope) }',
  )
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('dsgraph CLI', () => {
  it('prints help and version', async () => {
    expect((await run('--help')).out).toContain('dsgraph scan')
    expect((await run('--version')).out).toMatch(/^\d+\.\d+\.\d+/)
    expect((await run()).code).toBe(2)
  })

  it('diff: text output, suggested bump and --fail-on exit code', async () => {
    const r = await run('diff', 'v1', 'v2')
    expect(r.code).toBe(0)
    expect(r.out).toContain('dsgraph diff — Breaking release')
    expect(r.out).toContain('suggested version: major')
    expect(r.out).toContain('Removed color.old, it was #ffffff.')
    expect(r.out).toContain('also changes action.bg')
    expect((await run('diff', 'v1', 'v2', '--fail-on', 'major')).code).toBe(1)
    expect((await run('diff', 'v1', 'v1', '--fail-on', 'patch')).code).toBe(0)
  })

  it('scan --out writes a snapshot that diff accepts as a source', async () => {
    expect((await run('scan', 'v1', '--out', 'v1.snapshot.json')).code).toBe(0)
    const snap = JSON.parse(await readFile(join(dir, 'v1.snapshot.json'), 'utf8'))
    expect(snap.schema).toBe('dsgraph/snapshot@1')
    const r = await run('diff', 'v1.snapshot.json', 'v2', '--format', 'json')
    expect(JSON.parse(r.out).summary.level).toBe('major')
  })

  it('check: CSS file, errors exit 1, rules overridable by config', async () => {
    const r = await run('check', 'theme.css')
    expect(r.code).toBe(1)
    expect(r.out).toContain('dtcg/unknown-reference')
    await writeFile(
      join(dir, 'quiet.json'),
      JSON.stringify({ rules: { 'dtcg/unknown-reference': 'off', 'dtcg/untyped': 'off' } }),
    )
    expect((await run('check', 'theme.css', '--config', 'quiet.json')).code).toBe(0)
  })

  it('rejects invalid config and unknown sources with exit 2', async () => {
    await writeFile(join(dir, 'bad.json'), JSON.stringify({ rules: { x: 'loud' } }))
    expect((await run('check', 'v1', '--config', 'bad.json')).code).toBe(2)
    const r = await run('diff', 'v1', 'missing')
    expect(r.code).toBe(2)
    expect(r.err).toContain('Source not found: missing')
  })

  it('shows where a diff reaches into the code with --code', async () => {
    const r = await run('diff', 'v1', 'v2', '--code', 'app')
    expect(r.out).toContain('In your code\n\n1 place breaks, 1 place looks different (1 file).')
    expect(r.out).toMatch(/button\.css:3\s+--color-old\s+breaks: color\.old was removed/)
    expect(r.out).toMatch(
      /button\.css:2\s+--action-bg\s+looks different: color\.brand changed \(used through action\.bg\)/,
    )
  })

  it('checks the styles of a project with --code', async () => {
    const r = await run('check', 'v1', '--code', 'app')
    expect(r.out).toContain('Color "#ffffff" in color is written by hand; use "color.old"  (button.css:4)')
  })
})

describe.runIf(process.env.DSGRAPH_NETWORK_TESTS === '1')('dsgraph CLI (network)', () => {
  it('diffs two versions of an npm package', async () => {
    const r = await run('diff', 'npm:open-props@1.6.0', 'npm:open-props@1.7.0', '--format', 'json')
    expect(r.code).toBe(0)
    expect(JSON.parse(r.out).schema).toBe('dsgraph/changeset@1')
  }, 60000)
})
