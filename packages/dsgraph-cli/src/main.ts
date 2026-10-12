import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { type Config, diff, type Level, validateConfig } from '@dsgraph/core'
import { type Format, formatChangeset, formatFindings } from '@dsgraph/report'
import { check, countBySeverity } from '@dsgraph/rules'
import { loadGraph } from './sources.js'

export const VERSION = '0.1.0'

const HELP = `dsgraph ${VERSION} — design-token graph: scan, check and diff

Usage
  dsgraph scan  [source]          Print (or --out) a canonical snapshot
  dsgraph check [source]          Run rules; exit 1 on errors
  dsgraph diff  <base> <head>     Compare two versions; suggest a semver bump

Sources
  ./tokens                        folder (DTCG, a *.resolver.json, Tokens Studio, Style Dictionary or CSS)
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
      --max-warnings <n>          check: exit 1 when warnings exceed n
      --expand                    check: list every finding instead of collapsing repeated ones
  -h, --help                      show help
  -v, --version                   show version
`

export interface Io {
  stdout: (s: string) => void
  stderr: (s: string) => void
  cwd: string
}

const RANK: Record<Level, number> = { none: 0, patch: 1, minor: 2, major: 3 }

export { loadGraph } from './sources.js'

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

    if (command === 'scan') {
      const graph = await loadGraph(rest[0] ?? '.', config, io.cwd)
      await emit(`${JSON.stringify(graph.snapshot, null, 2)}\n`)
      const errors = graph.snapshot.diagnostics.filter((d) => d.severity === 'error').length
      if (errors) io.stderr(`${errors} error diagnostics; run \`dsgraph check\` for details\n`)
      return 0
    }

    if (command === 'check') {
      const graph = await loadGraph(rest[0] ?? '.', config, io.cwd)
      const findings = await check(
        graph,
        values.strict
          ? { ...config, extends: [...(config.extends ?? ['recommended']), 'dtcg-strict'] }
          : config,
      )
      await emit(formatFindings(findings, { format, group: !values.expand }))
      const counts = countBySeverity(findings)
      const max =
        values['max-warnings'] !== undefined ? Number(values['max-warnings']) : Number.POSITIVE_INFINITY
      return counts.error > 0 || counts.warning > max ? 1 : 0
    }

    if (command === 'diff') {
      if (rest.length !== 2) {
        io.stderr('diff needs <base> and <head>\n')
        return 2
      }
      const [base, head] = await Promise.all([
        loadGraph(rest[0]!, config, io.cwd),
        loadGraph(rest[1]!, config, io.cwd),
      ])
      const cs = await diff(base, head, diffOptions(config))
      const types = new Map([...base.tokens(), ...head.tokens()].map((t) => [t.id, t.type]))
      await emit(formatChangeset(cs, { format, types }))
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
