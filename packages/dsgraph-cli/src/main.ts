import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { scanCode } from '@dsgraph/adapters'
import {
  type CodeIndex,
  type Config,
  coverageOf,
  diff,
  formatCoverage,
  impactOf,
  type Level,
  VarMatcher,
  validateConfig,
  varNames,
} from '@dsgraph/core'
import { type Format, formatChangeset, formatFindings } from '@dsgraph/report'
import { check, countBySeverity } from '@dsgraph/rules'
import { NodeFsSource } from '@dsgraph/sources/node'
import { loadKnowledge } from './knowledge.js'
import { loadGraph } from './sources.js'
import { installedVersion } from './upgrade.js'

export const VERSION = '0.8.0'

const HELP = `dsgraph ${VERSION} — design-token graph: scan, check and diff

Usage
  dsgraph scan  [source]          Print (or --out) a canonical snapshot
  dsgraph check [source]          Run rules; exit 1 on errors
  dsgraph diff  <base> <head>     Compare two versions; suggest a semver bump
  dsgraph upgrade-check <package> What an upgrade of a token package changes in this project:
                                  the version in use (node_modules, lockfile, package.json)
                                  against --to (default latest), with the places in --code (default .)

Sources
  ./tokens                        folder (DTCG, a *.resolver.json, token JSON or CSS)
  ./tokens.json  ./theme.css      a single file
  npm:@acme/tokens@^2             an npm package (via jsDelivr)
  github:owner/repo/tokens@main   a GitHub repository path at a ref (GITHUB_TOKEN for private repos)
  ./snapshot.json                 a snapshot saved with \`scan --out\`

Options
  -c, --config <file>             config file (default: ./dsgraph.config.json if present)
  -f, --format text|markdown|json output format (default: text)
  -o, --out <file>                write output to a file
      --strict                    DTCG 2025.10 strict mode (legacy syntax is an error)
      --fail-on major|minor|patch diff: exit 1 when the suggested bump is at least this
      --to <version>              upgrade-check: the version to upgrade to (default latest)
      --max-warnings <n>          check: exit 1 when warnings exceed n
      --expand                    check: list every finding instead of collapsing repeated ones
      --code <dir>                your project: check its code against the tokens (check), or show
                                  where the changes reach into it (diff). CSS, SCSS, Sass, CSS modules,
                                  JS/TS/JSX/TSX (style objects, CSS-in-JS, Tailwind classes),
                                  Vue, Svelte, Astro, HTML
  -h, --help                      show help
  -v, --version                   show version

Knowledge
  check reads token names with @specsure/knowledge when it is installed. DSGRAPH_KNOWLEDGE=<file>
  uses another pack, DSGRAPH_KNOWLEDGE=off none.
`

export interface Io {
  stdout: (s: string) => void
  stderr: (s: string) => void
  cwd: string
}

const RANK: Record<Level, number> = { none: 0, patch: 1, minor: 2, major: 3 }

export { KNOWLEDGE_PACKAGE, loadKnowledge } from './knowledge.js'
export { loadGraph } from './sources.js'
export {
  dependencyVersion,
  installedVersion,
  MANIFEST_FILES,
  type Manifests,
  readManifests,
} from './upgrade.js'

/** Reads `dsgraph.config.json` (or the given file) from `cwd`; no file means an empty config. */
export async function loadConfig(path: string | undefined, cwd: string): Promise<Config> {
  const file = resolve(cwd, path ?? 'dsgraph.config.json')
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch {
    if (path) throw new Error(`Config not found: ${path}`)
    return {}
  }
  const config = JSON.parse(text) as unknown
  const v = validateConfig(config)
  if (!v.ok)
    throw new Error(`Invalid config ${file}: ${v.errors.map((e) => `${e.path} ${e.message}`).join('; ')}`)
  return config as Config
}

/** Diff options from the config: explicit renames, comparison thresholds, semver policy, layers. */
export function diffOptions(config: Config): NonNullable<Parameters<typeof diff>[2]> {
  const opts: NonNullable<Parameters<typeof diff>[2]> = {}
  if (config.renames) opts.renames = config.renames
  if (config.compare?.ignoreExtensions) opts.ignoreExtensions = config.compare.ignoreExtensions
  if (config.compare?.equalDeltaE !== undefined) opts.compare = { equalDeltaE: config.compare.equalDeltaE }
  if (config.semver) opts.semver = config.semver as never
  if (config.layers) opts.layers = config.layers
  return opts
}

/** Runs the CLI and returns the exit code (0 ok, 1 failed check, 2 usage or runtime error). */
export async function main(argv: string[], io: Io): Promise<number> {
  let args: ReturnType<typeof parse>
  const parse = (a: string[]) =>
    parseArgs({
      args: a,
      allowPositionals: true,
      options: {
        config: { type: 'string', short: 'c' },
        format: { type: 'string', short: 'f' },
        out: { type: 'string', short: 'o' },
        strict: { type: 'boolean' },
        expand: { type: 'boolean' },
        code: { type: 'string' },
        to: { type: 'string' },
        'fail-on': { type: 'string' },
        'max-warnings': { type: 'string' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    })
  try {
    args = parse(argv)
  } catch (e) {
    io.stderr(`${(e as Error).message}\n\n${HELP}`)
    return 2
  }
  const { values, positionals } = args
  if (values.version) {
    io.stdout(`${VERSION}\n`)
    return 0
  }
  const [command, ...rest] = positionals
  if (values.help || !command) {
    io.stdout(HELP)
    return values.help ? 0 : 2
  }
  const format = (values.format ?? 'text') as Format
  if (!['text', 'markdown', 'json'].includes(format)) {
    io.stderr(`Unknown format "${format}"\n`)
    return 2
  }
  const emit = async (text: string) => {
    if (values.out) await writeFile(resolve(io.cwd, values.out), text)
    else io.stdout(text)
  }

  try {
    const config = await loadConfig(values.config, io.cwd)
    if (values.strict) config.tokens = { ...config.tokens, strict: true }
    // `--code <dir>`, or the project in the working folder when the config has a `code` section.
    const codeDir = values.code ?? (config.code ? '.' : undefined)
    const readCode = async (fallback?: string): Promise<CodeIndex | undefined> => {
      const dir = codeDir ?? fallback
      if (!dir) return undefined
      const opts: Parameters<typeof scanCode>[1] = {}
      if (config.code?.include) opts.include = config.code.include
      if (config.code?.exclude) opts.exclude = config.code.exclude
      const code = await scanCode(new NodeFsSource(resolve(io.cwd, dir)), opts)
      for (const s of code.skipped) io.stderr(`dsgraph: skipped ${s.file}: ${s.message}\n`)
      return code
    }

    if (command === 'scan') {
      const graph = await loadGraph(rest[0] ?? '.', config, io.cwd)
      await emit(`${JSON.stringify(graph.snapshot, null, 2)}\n`)
      const errors = graph.snapshot.diagnostics.filter((d) => d.severity === 'error').length
      if (errors) io.stderr(`${errors} error diagnostics; run \`dsgraph check\` for details\n`)
      return 0
    }

    if (command === 'check') {
      const [graph, code, knowledge] = await Promise.all([
        loadGraph(rest[0] ?? '.', config, io.cwd),
        readCode(),
        loadKnowledge(io.cwd),
      ])
      const findings = await check(
        graph,
        values.strict
          ? { ...config, extends: [...(config.extends ?? ['recommended']), 'dtcg-strict'] }
          : config,
        [],
        { ...(code ? { code } : {}), ...(knowledge ? { knowledge } : {}) },
      )
      let report = formatFindings(findings, { format, group: !values.expand })
      if (code && format !== 'json')
        report += `\n${formatCoverage(coverageOf(code, new VarMatcher(graph, varNames(code), config.code?.prefix)))}\n`
      await emit(report)
      const counts = countBySeverity(findings)
      const max =
        values['max-warnings'] !== undefined ? Number(values['max-warnings']) : Number.POSITIVE_INFINITY
      return counts.error > 0 || counts.warning > max ? 1 : 0
    }

    if (command === 'diff' || command === 'upgrade-check') {
      let specs: [string, string]
      let code: CodeIndex | undefined
      if (command === 'upgrade-check') {
        const pkg = rest[0]
        if (!pkg || rest.length !== 1) {
          io.stderr('upgrade-check needs the token package, e.g. @acme/tokens\n')
          return 2
        }
        const current = await installedVersion(io.cwd, pkg)
        if (!current) {
          io.stderr(
            `${pkg} is not a dependency of this project (no node_modules, lockfile or package.json entry)\n`,
          )
          return 2
        }
        specs = [`npm:${pkg}@${current}`, `npm:${pkg}@${values.to ?? 'latest'}`]
        // The project is the code to check, unless told otherwise.
        code = await readCode('.')
      } else {
        if (rest.length !== 2) {
          io.stderr('diff needs <base> and <head>\n')
          return 2
        }
        specs = [rest[0]!, rest[1]!]
        code = await readCode()
      }
      const [base, head] = await Promise.all([
        loadGraph(specs[0], config, io.cwd),
        loadGraph(specs[1], config, io.cwd),
      ])
      if (command === 'upgrade-check' && base.snapshot.source.version === head.snapshot.source.version) {
        io.stdout(`${rest[0]} ${base.snapshot.source.version} is already the version you asked for.\n`)
        return 0
      }
      const cs = await diff(base, head, diffOptions(config))
      const types = new Map([...base.tokens(), ...head.tokens()].map((t) => [t.id, t.type]))
      const impact = code
        ? impactOf(cs, base, head, code, config.code?.prefix ? { prefix: config.code.prefix } : {})
        : undefined
      await emit(
        formatChangeset(cs, {
          format,
          types,
          ...(impact ? { impact } : {}),
          // Upgrading: what happens to this project, not the whole release.
          focusOnCode: command === 'upgrade-check',
        }),
      )
      const failOn = values['fail-on'] as Level | undefined
      if (failOn && !(failOn in RANK)) {
        io.stderr(`--fail-on must be major, minor, patch or none\n`)
        return 2
      }
      return failOn && cs.changes.length > 0 && RANK[cs.summary.level] >= RANK[failOn] ? 1 : 0
    }

    io.stderr(`Unknown command "${command}"\n\n${HELP}`)
    return 2
  } catch (e) {
    io.stderr(`dsgraph: ${(e as Error).message}\n`)
    return 2
  }
}
