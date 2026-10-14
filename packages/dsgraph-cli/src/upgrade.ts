import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** A project's package files as text; any may be missing. */
export interface Manifests {
  /** package-lock.json or npm-shrinkwrap.json */
  lock?: string
  /** pnpm-lock.yaml */
  pnpmLock?: string
  /** yarn.lock */
  yarnLock?: string
  /** package.json */
  pkg?: string
}

export const MANIFEST_FILES: Record<keyof Manifests, string> = {
  lock: 'package-lock.json',
  pnpmLock: 'pnpm-lock.yaml',
  yarnLock: 'yarn.lock',
  pkg: 'package.json',
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
const VERSION = /^\d+\.\d+\.\d+(?:-[\w.]+)?/

function fromNpmLock(text: string, name: string): string | undefined {
  try {
    const lock = JSON.parse(text) as {
      packages?: Record<string, { version?: string }>
      dependencies?: Record<string, { version?: string }>
    }
    return lock.packages?.[`node_modules/${name}`]?.version ?? lock.dependencies?.[name]?.version
  } catch {
    return undefined
  }
}

/** pnpm 6–9: `/@acme/tokens@1.2.3:` or `'@acme/tokens@1.2.3':` under `packages:`. */
function fromPnpmLock(text: string, name: string): string | undefined {
  const m = new RegExp(`^\\s+['"]?/?${escapeRe(name)}@(\\d[^:'"(\\s]*)`, 'm').exec(text)
  return m?.[1]
}

/** yarn 1 (`version "1.2.3"`) and berry (`version: 1.2.3`), after the entry for the package. */
function fromYarnLock(text: string, name: string): string | undefined {
  const m = new RegExp(
    `^"?${escapeRe(name)}@[^\\n]*:\\n(?:[ \\t]+[^\\n]*\\n)*?[ \\t]+version:? "?([^"\\n]+)"?`,
    'm',
  ).exec(text)
  return m?.[1]?.trim()
}

/** The range in package.json; `workspace:` and aliases mean it is not an npm version. */
function fromPackageJson(text: string, name: string): string | undefined {
  try {
    const pkg = JSON.parse(text) as Record<string, Record<string, string> | undefined>
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const range = pkg[field]?.[name]
      if (range && !/^(workspace|file|link|npm|git|github|https?):/.test(range)) return range
    }
  } catch {
    // Not JSON: no version from here.
  }
  return undefined
}

/**
 * The version of a dependency a project uses: exact from a lockfile when there is one, otherwise
 * the range from package.json (an npm source resolves it). Undefined when the project does not use it.
 */
export function dependencyVersion(m: Manifests, name: string): string | undefined {
  const exact =
    (m.lock && fromNpmLock(m.lock, name)) ||
    (m.pnpmLock && fromPnpmLock(m.pnpmLock, name)) ||
    (m.yarnLock && fromYarnLock(m.yarnLock, name))
  if (exact && VERSION.test(exact)) return exact
  return m.pkg ? fromPackageJson(m.pkg, name) : undefined
}

/** Reads the package files of a folder. */
export async function readManifests(dir: string): Promise<Manifests> {
  const out: Manifests = {}
  await Promise.all(
    (Object.entries(MANIFEST_FILES) as Array<[keyof Manifests, string]>).map(async ([key, file]) => {
      const text = await readFile(join(dir, file), 'utf8').catch(() => undefined)
      if (text !== undefined) out[key] = text
    }),
  )
  return out
}

/** The installed version (node_modules), else what the package files say. */
export async function installedVersion(dir: string, name: string): Promise<string | undefined> {
  const installed = await readFile(join(dir, 'node_modules', name, 'package.json'), 'utf8')
    .then((t) => (JSON.parse(t) as { version?: string }).version)
    .catch(() => undefined)
  return installed ?? dependencyVersion(await readManifests(dir), name)
}
