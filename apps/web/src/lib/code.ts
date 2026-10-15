import { scanCode } from '@dsgraph/adapters'
import {
  type Changeset,
  coverageOf,
  type DsGraph,
  impactOf,
  type Source,
  VarMatcher,
  varNames,
} from '@dsgraph/core'
import { check } from '@dsgraph/rules'
import { MemorySource, remoteSource } from '@dsgraph/sources'
import { refLabel } from './ref'
import type { CodeInput, CodeReport } from './types'

/** Most files read from a repository: enough for an app, not a whole monorepo download. */
export const MAX_REMOTE_FILES = 1500

/** A source for the code: the dropped files, or a repository through the GitHub API. */
export function codeSource(input: CodeInput, token?: string): Source {
  if (input.kind === 'files')
    return new MemorySource(Object.fromEntries(input.files.map((f) => [f.path, f.text])))
  const spec: Parameters<typeof remoteSource>[0] = {
    kind: 'github',
    repo: input.repo,
    ref: input.ref || 'HEAD',
  }
  if (input.root) spec.root = input.root
  return remoteSource(spec, token ? { token } : {})
}

/**
 * A project's code against a comparison. Loaded on demand: the parser for scripts is only fetched
 * when someone adds their code.
 */
export async function checkCode(
  input: CodeInput,
  base: DsGraph,
  head: DsGraph,
  changeset: Changeset,
  token?: string,
): Promise<CodeReport> {
  const source = codeSource(input, token)
  const code = await scanCode(source, input.kind === 'github' ? { maxFiles: MAX_REMOTE_FILES } : {})
  const findings = (await check(base, {}, [], { code })).filter((f) => /^(style|usage)\//.test(f.rule))
  const report: CodeReport = {
    files: code.files.length,
    skipped: code.skipped,
    coverage: coverageOf(code, new VarMatcher(base, varNames(code))),
    impact: impactOf(changeset, base, head, code),
    findings,
  }
  if (code.limited) report.limited = code.limited
  if (input.kind === 'github') {
    const meta = await source.meta()
    report.label = `${input.repo}${input.root ? `/${input.root}` : ''}@${refLabel(input.ref || undefined, meta.commit)}`
  }
  return report
}
