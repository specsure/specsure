import { stat } from 'node:fs/promises'
import { basename, dirname, join, posix, relative, resolve } from 'node:path'
import { CODE_INCLUDE, scanCode } from '@dsgraph/adapters'
import {
  dependencyVersion,
  diffOptions,
  loadConfig,
  loadGraph,
  MANIFEST_FILES,
  type Manifests,
  readManifests,
} from '@dsgraph/cli'
import {
  type CodeIndex,
  type Config,
  coverageOf,
  diff,
  type Finding,
  formatCoverage,
  impactOf,
  type Level,
  readKnowledge,
  VarMatcher,
  varNames,
} from '@dsgraph/core'
import { formatChangeset, formatFindings } from '@dsgraph/report'
import { check } from '@dsgraph/rules'
import { NodeFsSource } from '@dsgraph/sources/node'
import pack from '@specsure/knowledge/knowledge.json' with { type: 'json' }

/** Where the action reads its inputs and writes its results; `process.env` and the file system in production. */
export interface Runtime {
  env: Record<string, string | undefined>
  readText(path: string): Promise<string>
  appendText(path: string, text: string): Promise<void>
  fetch: typeof fetch
  log(line: string): void
}

const RANK: Record<Level, number> = { none: 0, patch: 1, minor: 2, major: 3 }
/** Specsure's knowledge pack, built into the action (its own license, LICENSE-knowledge). */
const knowledge = readKnowledge(pack)
export const MARKER = '<!-- dsgraph-action -->'

const input = (rt: Runtime, name: string, fallback = ''): string =>
  (rt.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] ?? '').trim() || fallback

interface PullRequest {
  number: number
  base: { sha: string; ref: string }
  head: { sha: string; repo?: { full_name?: string } }
}

/** Escapes a message for a workflow command (`::error::…`). */
const command = (kind: 'error' | 'warning' | 'notice', message: string) =>
  `::${kind}::${message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`

/**
 * Compares the design tokens of a pull request with its base (or any dsgraph source), writes the
 * report to the job summary and a pull request comment, and fails when the change is at least
 * `fail-on`. Returns the exit code.
 */
export async function run(rt: Runtime): Promise<number> {
  const workspace = rt.env.GITHUB_WORKSPACE ?? process.cwd()
  const repo = rt.env.GITHUB_REPOSITORY ?? ''
  const token = input(rt, 'github-token')
  const path = input(rt, 'path', '.')
  const failOn = input(rt, 'fail-on') as Level | ''
  if (failOn && !(failOn in RANK)) {
    rt.log(command('error', '`fail-on` must be major, minor, patch or none'))
    return 2
  }

  let pr: PullRequest | undefined
  if (rt.env.GITHUB_EVENT_PATH) {
    try {
      const event = JSON.parse(await rt.readText(rt.env.GITHUB_EVENT_PATH)) as { pull_request?: PullRequest }
      pr = event.pull_request
    } catch {
      // Not every event carries a payload the action needs.
    }
  }

  try {
    let config: Config = await loadConfig(input(rt, 'config') || undefined, workspace)

    // The head is the checkout; the base is the same path at the pull request's base commit.
    const headPath = resolve(workspace, path)
    const isFile = (await stat(headPath).catch(() => undefined))?.isFile() ?? false
    const folder = relative(workspace, isFile ? dirname(headPath) : headPath)
      .split('\\')
      .join('/')
    if (isFile) {
      const name = basename(headPath)
      config = /\.css$/i.test(name)
        ? { ...config, css: { ...config.css, include: [name] } }
        : { ...config, tokens: { ...config.tokens, include: [name] } }
    }
    // `package`: this repository uses a token package; compare the versions before and after the pull request.
    const pkg = input(rt, 'package')
    let headSpec: string | undefined
    let baseSpec = input(rt, 'base')
    if (pkg) {
      if (!pr || !token) {
        rt.log(command('error', '`package` needs a pull_request event and `github-token`'))
        return 2
      }
      const dirs = [...new Set(['.', input(rt, 'code') || '.'])]
      const v = await packageVersions(rt, { repo, ref: pr.base.sha, token, workspace, dirs }, pkg)
      if (!v.head) {
        rt.log(
          command(
            'error',
            `${pkg} is not a dependency of this repository (no lockfile or package.json entry)`,
          ),
        )
        return 2
      }
      if (!v.base || v.base === v.head) {
        rt.log(`dsgraph: ${pkg} ${v.base ? `stays at ${v.head}` : `is new (${v.head})`}; nothing to compare`)
        if (rt.env.GITHUB_OUTPUT)
          await rt.appendText(rt.env.GITHUB_OUTPUT, 'level=none\nchanges=0\nbreaking=0\ncode-breaks=0\n')
        return 0
      }
      baseSpec = `npm:${pkg}@${v.base}`
      headSpec = `npm:${pkg}@${v.head}`
    }
    if (!baseSpec) {
      if (!pr) {
        rt.log(command('error', 'Set `base`, or run the action on pull_request'))
        return 2
      }
      const root = folder && folder !== '.' ? `/${posix.normalize(folder)}` : ''
      baseSpec = `github:${repo}${root}@${pr.base.sha}`
    }

    const [base, head] = await Promise.all([
      loadGraph(baseSpec, config, workspace),
      headSpec
        ? loadGraph(headSpec, config, workspace)
        : isFile
          ? loadGraph(folder || '.', config, workspace)
          : loadGraph(headPath, config, workspace),
    ])
    const cs = await diff(base, head, diffOptions(config))
    const types = new Map([...base.tokens(), ...head.tokens()].map((t) => [t.id, t.type]))
    const level = cs.changes.length ? cs.summary.level : 'none'

    // The code that uses the tokens, in this repository: where the changes reach, and its styles.
    const codePath = input(rt, 'code') || (config.code || pkg ? '.' : '')
    let code: CodeIndex | undefined
    if (codePath) {
      const root = posix.normalize(codePath.split('\\').join('/')).replace(/^\.\/?|\/$/g, '')
      const within = (globs: string[]) => globs.map((g) => (root ? `${root}/${g}` : g))
      const scanOpts: Parameters<typeof scanCode>[1] = {
        include: config.code?.include ?? within(CODE_INCLUDE),
      }
      if (config.code?.exclude) scanOpts.exclude = config.code.exclude
      code = await scanCode(new NodeFsSource(workspace), scanOpts)
    }
    const impact = code
      ? impactOf(cs, base, head, code, config.code?.prefix ? { prefix: config.code.prefix } : {})
      : undefined

    // The checkout's absolute path means nothing to readers of the pull request.
    const here = path === '.' ? 'this branch' : path
    let body = formatChangeset(cs, {
      format: 'markdown',
      types,
      ...(impact ? { impact } : {}),
      // Upgrading a dependency: what happens to this repository, not the whole release.
      focusOnCode: !!pkg,
    })
      .split(headPath)
      .join(here)
      .split(`${workspace}/`)
      .join('')
    if (code && pr && token) {
      const changed = await changedFiles(rt, { repo, pr: pr.number, token })
      const styles = changed
        ? (await check(head, config, [], { code, knowledge })).filter(
            (f) => /^(style|usage)\//.test(f.rule) && f.loc?.file && changed.has(f.loc.file),
          )
        : []
      if (styles.length) body += stylesSection(styles)
    }
    if (code) {
      const vars = new VarMatcher(head, varNames(code), config.code?.prefix)
      body += `\n${formatCoverage(coverageOf(code, vars))}\n`
    }
    // Checks on someone else's package are theirs to fix; with `package` they are off unless asked for.
    if (input(rt, 'checks', pkg ? 'false' : 'true') !== 'false') {
      const findings = await check(head, config, [], { knowledge })
      if (findings.length)
        body += `\n<details><summary>Checks on the new version (${findings.length})</summary>\n\n${formatFindings(findings, { format: 'markdown' })}\n</details>\n`
    }
    body +=
      '\n<sub>[dsgraph](https://github.com/specsure/specsure) · design tokens compared as a graph</sub>\n'

    if (rt.env.GITHUB_STEP_SUMMARY) await rt.appendText(rt.env.GITHUB_STEP_SUMMARY, `${body}\n`)
    if (rt.env.GITHUB_OUTPUT)
      await rt.appendText(
        rt.env.GITHUB_OUTPUT,
        `level=${level}\nchanges=${cs.changes.filter((c) => c.origin === 'direct').length}\nbreaking=${cs.changes.filter((c) => c.level === 'major').length}\ncode-breaks=${impact?.breaks ?? 0}\n`,
      )
    rt.log(
      `dsgraph: ${level === 'none' ? 'no impact' : `${level} release`} (${baseSpec} → ${headSpec ?? path})`,
    )

    if (pr && token && input(rt, 'comment', 'true') !== 'false')
      await comment(rt, {
        repo,
        pr: pr.number,
        token,
        body: `${MARKER}\n${fit(body)}`,
        empty: cs.changes.length === 0,
      })

    if (failOn && cs.changes.length && RANK[level] >= RANK[failOn]) {
      rt.log(command('error', `Design tokens: ${level} change, fail-on is ${failOn}`))
      return 1
    }
    return 0
  } catch (e) {
    rt.log(command('error', `dsgraph: ${(e as Error).message}`))
    return 2
  }
}

/** The versions of a dependency before (base commit, read through the API) and after (the checkout). */
async function packageVersions(
  rt: Runtime,
  o: { repo: string; ref: string; token: string; workspace: string; dirs: string[] },
  name: string,
): Promise<{ base?: string; head?: string }> {
  const api = rt.env.GITHUB_API_URL ?? 'https://api.github.com'
  const atBase = async (dir: string): Promise<Manifests> => {
    const out: Manifests = {}
    for (const [key, file] of Object.entries(MANIFEST_FILES) as Array<[keyof Manifests, string]>) {
      const path = posix.join(dir, file)
      const res = await rt
        .fetch(`${api}/repos/${o.repo}/contents/${path}?ref=${o.ref}`, {
          headers: { Accept: 'application/vnd.github.raw', Authorization: `Bearer ${o.token}` },
        })
        .catch(() => undefined)
      if (res?.ok) out[key] = await res.text()
    }
    return out
  }
  const first = async (read: (dir: string) => Promise<Manifests>) => {
    for (const dir of o.dirs) {
      const v = dependencyVersion(await read(dir), name)
      if (v) return v
    }
    return undefined
  }
  const [base, head] = await Promise.all([
    first(atBase),
    first((dir) => readManifests(join(o.workspace, dir))),
  ])
  const out: { base?: string; head?: string } = {}
  if (base) out.base = base
  if (head) out.head = head
  return out
}

/** Style findings in the files this pull request touches: the ones its author can fix now. */
function stylesSection(findings: Finding[]): string {
  return `\n### Styles in this pull request (${findings.length})\n\n${formatFindings(findings, { format: 'markdown', heading: false })}\n`
}

/** Paths changed by the pull request, or undefined when GitHub does not say. */
async function changedFiles(
  rt: Runtime,
  o: { repo: string; pr: number; token: string },
): Promise<Set<string> | undefined> {
  const api = rt.env.GITHUB_API_URL ?? 'https://api.github.com'
  const files = new Set<string>()
  try {
    for (let page = 1; page <= 30; page++) {
      const res = await rt.fetch(`${api}/repos/${o.repo}/pulls/${o.pr}/files?per_page=100&page=${page}`, {
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${o.token}` },
      })
      if (!res.ok) return undefined
      const list = (await res.json()) as Array<{ filename: string; status: string }>
      for (const f of list) if (f.status !== 'removed') files.add(f.filename)
      if (list.length < 100) break
    }
  } catch {
    return undefined
  }
  return files
}

/** GitHub refuses comments over 65 536 characters; a long report is cut at a line, the summary keeps all of it. */
export function fit(body: string, limit = 60_000): string {
  if (body.length <= limit) return body
  const cut = body.slice(0, limit)
  const kept = cut.slice(0, cut.lastIndexOf('\n'))
  // A cut inside a collapsed block would leave it open.
  const open = (kept.match(/<details>/g) ?? []).length - (kept.match(/<\/details>/g) ?? []).length
  return `${kept}\n${'</details>\n'.repeat(Math.max(0, open))}\n…and more. The full report is in the job summary.\n`
}

/**
 * One comment per pull request, updated on every push. Nothing is posted while there are no
 * changes; a comment that exists already says so. Without permission (pull requests from forks)
 * it warns and goes on: the report is in the job summary.
 */
async function comment(
  rt: Runtime,
  o: { repo: string; pr: number; token: string; body: string; empty: boolean },
): Promise<void> {
  const api = rt.env.GITHUB_API_URL ?? 'https://api.github.com'
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${o.token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }
  try {
    let existing: number | undefined
    for (let page = 1; page <= 10 && existing === undefined; page++) {
      const res = await rt.fetch(`${api}/repos/${o.repo}/issues/${o.pr}/comments?per_page=100&page=${page}`, {
        headers,
      })
      if (!res.ok) throw new Error(`${res.status} listing comments`)
      const list = (await res.json()) as Array<{ id: number; body?: string }>
      existing = list.find((c) => c.body?.startsWith(MARKER))?.id
      if (list.length < 100) break
    }
    if (existing === undefined && o.empty) return
    const res = existing
      ? await rt.fetch(`${api}/repos/${o.repo}/issues/comments/${existing}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ body: o.body }),
        })
      : await rt.fetch(`${api}/repos/${o.repo}/issues/${o.pr}/comments`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ body: o.body }),
        })
    if (!res.ok) throw new Error(`${res.status} writing the comment`)
  } catch (e) {
    rt.log(
      command(
        'warning',
        `Could not comment on the pull request (${(e as Error).message}). Give the job \`pull-requests: write\`; the report is in the job summary.`,
      ),
    )
  }
}
