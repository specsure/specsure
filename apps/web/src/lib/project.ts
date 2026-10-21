import { scanCode } from '@dsgraph/adapters'
import { type DsGraph, type Finding, VarMatcher, varNames } from '@dsgraph/core'
import { check } from '@dsgraph/rules'
import { codeSource, MAX_REMOTE_FILES } from './code'
import { cssName } from './css-name'
import type { HandGroup, ProjectAnswer, VarGroup } from './lookup-types'
import { refLabel } from './ref'
import type { CodeInput } from './types'
import { cssColor, isColor } from './view'

const SITES = 30

/** Edit distance, for "did you mean" on misspelled variables. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j]!
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = cur
    }
  }
  return row[b.length]!
}

/** The group a token sits in: `color.surface` for `color.surface.sunken`, `space` for `space-md`. */
const groupOf = (id: string): string => id.replace(/[.-][^.-]+$/, '')

const site = (f: Finding, text: string) => ({ file: f.loc?.file ?? '', line: f.loc?.line ?? 0, text })

/**
 * A project's code against one design system: how much of it is on tokens, which values written by
 * hand have a token (and which one, for the property, state and component), which have none (the
 * tokens the system is missing), and variables that are misspelled or deprecated.
 */
export async function checkProject(g: DsGraph, input: CodeInput, token?: string): Promise<ProjectAnswer> {
  const source = codeSource(input, token)
  const code = await scanCode(source, input.kind === 'github' ? { maxFiles: MAX_REMOTE_FILES } : {})
  const findings = await check(g, {}, [], { code })
  const vars = new VarMatcher(g, varNames(code))
  const input0 = g.defaultInput({})

  const share = (type: 'color' | 'dimension') => {
    const fromTokens = code.uses.filter((u) => vars.tokenOfUse(u)?.type === type).length
    const byHand = code.literals.filter((l) => l.type === type).length
    return { fromTokens, byHand }
  }
  const fromTokens = code.uses.filter((u) => vars.tokenOfUse(u)).length
  const byHand = code.literals.length

  const groups = new Map<string, HandGroup & { fileSet: Set<string> }>()
  for (const f of findings) {
    if (f.rule !== 'style/hardcoded-color' && f.rule !== 'style/off-scale') continue
    const e = f.evidence as {
      value: string
      source?: string
      token: string
      replacement: string
      exact: boolean
      deltaE?: number
      distance?: number
    }
    const t = g.token(e.token)
    // One row per value and what replaces it: a class and a declaration are different edits.
    const key = `${e.exact ? 'x' : 'n'}\u0000${e.value.toLowerCase()}\u0000${e.exact ? `${e.token}\u0000${e.source ? e.replacement : ''}` : ''}`
    let grp = groups.get(key)
    if (!grp) {
      const v = t ? g.value(t.id, input0) : undefined
      grp = {
        value: e.value,
        type: f.rule === 'style/hardcoded-color' ? 'color' : 'dimension',
        count: 0,
        files: 0,
        token: e.token,
        replacement: e.source ? e.replacement : t ? `var(${cssName(t)})` : e.token,
        exact: e.exact,
        sites: [],
        fileSet: new Set(),
      }
      if (!e.exact) {
        if (e.deltaE !== undefined) grp.deltaE = e.deltaE
        if (e.distance !== undefined) grp.distance = e.distance
        grp.group = groupOf(e.token)
      }
      if (isColor(v) && grp.type === 'color' && e.exact) grp.swatch = cssColor(v)
      groups.set(key, grp)
    }
    grp.count++
    if (f.loc?.file) grp.fileSet.add(f.loc.file)
    if (grp.sites.length < SITES) grp.sites.push(site(f, e.source ?? e.value))
  }
  const all = [...groups.values()].map(({ fileSet, ...g }) => ({ ...g, files: fileSet.size }))
  const byCount = (a: HandGroup, b: HandGroup) => b.count - a.count || a.value.localeCompare(b.value)

  // Variables: misspelled ones get the nearest token's name, deprecated ones their replacement.
  const names = g.tokens().map((t) => cssName(t))
  const varGroups = new Map<string, VarGroup>()
  for (const f of findings) {
    if (f.rule !== 'usage/unknown-token' && f.rule !== 'usage/deprecated') continue
    const e = f.evidence as { name: string; replacement?: string }
    const kind = f.rule === 'usage/unknown-token' ? 'unknown' : 'deprecated'
    let v = varGroups.get(`${kind}\u0000${e.name}`)
    if (!v) {
      v = { name: e.name, kind, count: 0, sites: [] }
      if (kind === 'deprecated' && e.replacement) v.replacement = e.replacement
      if (kind === 'unknown' && e.name.startsWith('--')) {
        const near = names
          .map((n) => ({ n, d: distance(n, e.name) }))
          .sort((a, b) => a.d - b.d || a.n.localeCompare(b.n))[0]
        if (near && near.d <= Math.max(2, Math.floor(e.name.length / 8))) v.suggestion = near.n
      }
      varGroups.set(`${kind}\u0000${e.name}`, v)
    }
    v.count++
    if (v.sites.length < SITES) v.sites.push(site(f, e.name))
  }

  // Without a prefix the rules cannot tell a system variable from the app's own; a name a letter or
  // two away from a token's is a misspelling either way.
  const known = new Set(names)
  for (const u of code.uses) {
    if (!u.name.startsWith('--') || known.has(u.name) || vars.tokenOfUse(u)) continue
    const key = `unknown\u0000${u.name}`
    let v = varGroups.get(key)
    if (!v) {
      const near = names
        .map((n) => ({ n, d: distance(n, u.name) }))
        .sort((a, b) => a.d - b.d || a.n.localeCompare(b.n))[0]
      if (!near || near.d === 0 || near.d > Math.max(2, Math.floor(u.name.length / 8))) continue
      v = { name: u.name, kind: 'unknown', count: 0, sites: [], suggestion: near.n }
      varGroups.set(key, v)
    } else if (v.sites.some((x) => x.file === u.file && x.line === u.line)) continue
    v.count++
    if (v.sites.length < SITES) v.sites.push({ file: u.file, line: u.line, text: u.name })
  }

  const answer: ProjectAnswer = {
    files: code.files.length,
    skipped: code.skipped.length,
    coverage: {
      fromTokens,
      byHand,
      share: fromTokens + byHand ? fromTokens / (fromTokens + byHand) : null,
      color: share('color'),
      size: share('dimension'),
    },
    replace: all.filter((x) => x.exact).sort(byCount),
    missing: all.filter((x) => !x.exact).sort(byCount),
    variables: [...varGroups.values()].sort((a, b) => b.count - a.count),
  }
  if (code.limited) answer.limited = code.limited
  if (input.kind === 'github') {
    const meta = await source.meta()
    answer.label = `${input.repo}${input.root ? `/${input.root}` : ''}@${refLabel(input.ref || undefined, meta.commit)}`
  }
  return answer
}
