import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dependencyVersion, installedVersion } from '../src/upgrade.js'

const name = '@acme/tokens'

describe('dependencyVersion', () => {
  it('reads package-lock.json, v3 and v1', () => {
    expect(
      dependencyVersion(
        { lock: JSON.stringify({ packages: { 'node_modules/@acme/tokens': { version: '2.4.1' } } }) },
        name,
      ),
    ).toBe('2.4.1')
    expect(
      dependencyVersion({ lock: JSON.stringify({ dependencies: { [name]: { version: '1.0.3' } } }) }, name),
    ).toBe('1.0.3')
  })

  it('reads pnpm-lock.yaml, v6 and v9', () => {
    const v6 = 'lockfileVersion: 6.0\npackages:\n\n  /@acme/tokens@2.4.1:\n    resolution: {integrity: x}\n'
    const v9 =
      "lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      '@acme/tokens':\n        specifier: ^2.4.0\n        version: 2.4.1\npackages:\n\n  '@acme/tokens@2.4.1':\n    resolution: {integrity: x}\n"
    expect(dependencyVersion({ pnpmLock: v6 }, name)).toBe('2.4.1')
    expect(dependencyVersion({ pnpmLock: v9 }, name)).toBe('2.4.1')
  })

  it('reads yarn.lock, classic and berry', () => {
    const classic =
      '"@acme/other@^1.0.0":\n  version "1.0.0"\n\n"@acme/tokens@^2.4.0":\n  version "2.4.1"\n  resolved "https://x"\n'
    const berry = '"@acme/tokens@npm:^2.4.0":\n  version: 2.4.1\n  resolution: "@acme/tokens@npm:2.4.1"\n'
    expect(dependencyVersion({ yarnLock: classic }, name)).toBe('2.4.1')
    expect(dependencyVersion({ yarnLock: berry }, name)).toBe('2.4.1')
  })

  it('falls back to the range in package.json, but not to workspace or local links', () => {
    expect(dependencyVersion({ pkg: JSON.stringify({ devDependencies: { [name]: '^2.4.0' } }) }, name)).toBe(
      '^2.4.0',
    )
    expect(
      dependencyVersion({ pkg: JSON.stringify({ dependencies: { [name]: 'workspace:*' } }) }, name),
    ).toBeUndefined()
    expect(dependencyVersion({ pkg: JSON.stringify({ dependencies: {} }) }, name)).toBeUndefined()
  })
})

describe('installedVersion', () => {
  it('prefers node_modules, then the package files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsgraph-upgrade-'))
    await writeFile(join(dir, 'package.json'), JSON.stringify({ dependencies: { [name]: '^2.0.0' } }))
    expect(await installedVersion(dir, name)).toBe('^2.0.0')
    await mkdir(join(dir, 'node_modules/@acme/tokens'), { recursive: true })
    await writeFile(join(dir, 'node_modules/@acme/tokens/package.json'), JSON.stringify({ version: '2.3.0' }))
    expect(await installedVersion(dir, name)).toBe('2.3.0')
  })
})
