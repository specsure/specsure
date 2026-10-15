import { scanCode } from '@dsgraph/adapters'
import { type Changeset, coverageOf, type DsGraph, impactOf, VarMatcher, varNames } from '@dsgraph/core'
import { check } from '@dsgraph/rules'
import { MemorySource } from '@dsgraph/sources'
import type { CodeReport, DroppedFile } from './types'

/**
 * A project's code against a comparison. Loaded on demand: the parser for scripts is only fetched
 * when someone adds their code.
 */
export async function checkCode(
  files: DroppedFile[],
  base: DsGraph,
  head: DsGraph,
  changeset: Changeset,
): Promise<CodeReport> {
  const code = await scanCode(new MemorySource(Object.fromEntries(files.map((f) => [f.path, f.text]))))
  const findings = (await check(base, {}, [], { code })).filter((f) => /^(style|usage)\//.test(f.rule))
  return {
    files: code.files.length,
    skipped: code.skipped,
    coverage: coverageOf(code, new VarMatcher(base, varNames(code))),
    impact: impactOf(changeset, base, head, code),
    findings,
  }
}
