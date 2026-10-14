import { canonicalize, type Token } from '@dsgraph/schema'
import type { DsGraph } from './graph.js'
import { normalizeName } from './path.js'
import type { Input } from './resolver/system.js'
import { type ColorValue, deltaEOK } from './values/color.js'
import { toPx } from './values/dimension.js'

/**
 * What a project's code does with the design system: where it reads tokens (`var(--…)`) and where
 * it writes values by hand. Built by a code scanner (`scanStyles` in `@dsgraph/adapters`) and kept
 * apart from the token snapshot: the same code is checked against several versions of the tokens.
 */
export interface CodeIndex {
  /** Files that were read, relative to the project root. */
  files: string[]
  uses: TokenUse[]
  literals: StyleLiteral[]
  /** Files that could not be read or parsed. */
  skipped: Array<{ file: string; message: string }>
}

export interface CodeLoc {
  file: string
  line: number
  column: number
}

/** One use of a token in code: `var(--name)` in a style, or a utility class such as `bg-primary`. */
export interface TokenUse extends CodeLoc {
  /** The custom property, `--color-accent`; for a class, its first candidate. */
  name: string
  /** Other custom properties a class may stand for (`bg-primary` → `--color-primary`, `--primary`). */
  candidates?: string[]
  /** As written in the code when it is not `var()`: the class `bg-primary`. */
  text?: string
  /** CSS property it is used in (`color`, `padding`, or a custom property it defines). */
  property: string
  selector?: string
  /** Fallback written after the name, `var(--x, #fff)`. */
  fallback?: string
}

/** A value written by hand where a token could be used. */
export interface StyleLiteral extends CodeLoc {
  property: string
  selector?: string
  /** The value as written, `#3366ff`, `12px`. */
  text: string
  /** Where it was written when that is not a declaration: the class `bg-[#3366ff]`. */
  source?: string
  type: 'color' | 'dimension'
  /** Canonical DTCG value. */
  value: unknown
}

/**
 * Matches custom property names from code to tokens. Ids of CSS tokens match as written; DTCG paths
 * match by normalized name (`--color-blue-500` ↔ `color.blue.500`). A prefix (`--ds-`) is taken from
 * `prefix`, or learned: a leading segment that several names share and that, removed, names tokens.
 */
export class VarMatcher {
  private readonly prefixes: string[]
  private suffixes?: Map<string, Token[]>

  constructor(
    private readonly graph: DsGraph,
    names: Iterable<string> = [],
    prefix?: string,
  ) {
    this.prefixes = prefix
      ? [normalizeName(prefix.replace(/^--/, ''))]
      : learnPrefixes(graph, names, (n) => this.byName(n))
  }

  /** The token a custom property names, or undefined. */
  token(name: string): Token | undefined {
    const bare = name.replace(/^--/, '')
    const exact = this.graph.token(bare)
    if (exact) return exact
    const n = normalizeName(bare)
    const direct = this.byName(n)
    if (direct) return direct
    for (const p of this.prefixes) if (n.startsWith(`${p}.`)) return this.byName(n.slice(p.length + 1))
    return undefined
  }

  /** The token a use reads: its name, or else the first of its candidates that names a token. */
  tokenOfUse(u: Pick<TokenUse, 'name' | 'candidates'>): Token | undefined {
    const direct = this.token(u.name)
    if (direct || !u.candidates) return direct
    for (const c of u.candidates) {
      const t = this.token(c)
      if (t) return t
    }
    return undefined
  }

  /** Whether a custom property is meant to be a design-system variable (carries a known prefix). */
  isSystemName(name: string): boolean {
    const n = normalizeName(name.replace(/^--/, ''))
    return this.prefixes.some((p) => n.startsWith(`${p}.`))
  }

  get prefix(): string | undefined {
    return this.prefixes[0]
  }

  /**
   * A token by normalized name: the whole path, or else the end of exactly one path. Exports that
   * group variables by category (`colors.--gray-9`, `spacing.space.4`) match their names in code.
   */
  private byName(n: string): Token | undefined {
    const hits = this.graph.byCssVar(`--${n}`)
    if (hits.length) return hits.length === 1 ? hits[0] : undefined
    if (!this.suffixes) {
      this.suffixes = new Map()
      for (const t of this.graph.tokens()) {
        const segs = normalizeName(t.id).split('.')
        for (let i = 1; i < segs.length; i++) {
          const key = segs.slice(i).join('.')
          this.suffixes.set(key, [...(this.suffixes.get(key) ?? []), t])
        }
      }
    }
    const tail = this.suffixes.get(n)
    return tail?.length === 1 ? tail[0] : undefined
  }
}

/** Leading segments that, removed, turn most names that carry them into token names. */
function learnPrefixes(
  graph: DsGraph,
  names: Iterable<string>,
  byName: (n: string) => Token | undefined,
): string[] {
  const stats = new Map<string, { total: number; hits: number }>()
  for (const name of new Set(names)) {
    const n = normalizeName(name.replace(/^--/, ''))
    if (graph.token(name.replace(/^--/, '')) || byName(n)) continue
    const dot = n.indexOf('.')
    if (dot < 0) continue
    const head = n.slice(0, dot)
    const s = stats.get(head) ?? { total: 0, hits: 0 }
    s.total++
    if (byName(n.slice(dot + 1))) s.hits++
    stats.set(head, s)
  }
  return [...stats]
    .filter(([, s]) => s.hits >= 2 && s.hits / s.total >= 0.5)
    .sort((a, b) => b[1].hits - a[1].hits || a[0].localeCompare(b[0]))
    .map(([p]) => p)
}

/** Names to learn a prefix from: `var()` uses as written, not the guesses behind a class. */
export const varNames = (code: CodeIndex): string[] => code.uses.filter((u) => !u.text).map((u) => u.name)

export interface Coverage {
  /** Uses of tokens: `var()` and classes that name one. */
  fromTokens: number
  /** Colors and scale values written by hand. */
  byHand: number
  /** fromTokens / (fromTokens + byHand); null when the code has neither. */
  share: number | null
}

/** How much of the code's design values come from tokens. */
export function coverageOf(code: CodeIndex, vars: VarMatcher): Coverage {
  const fromTokens = code.uses.filter((u) => vars.tokenOfUse(u)).length
  const byHand = code.literals.length
  const total = fromTokens + byHand
  return { fromTokens, byHand, share: total ? fromTokens / total : null }
}

/** `On tokens: 92% of the design values in the code (120 from tokens, 10 written by hand).` */
export function formatCoverage(c: Coverage): string {
  if (c.share === null) return 'On tokens: no colors or sizes in the code.'
  return `On tokens: ${Math.round(c.share * 100)}% of the design values in the code (${c.fromTokens} from tokens, ${c.byHand} written by hand).`
}

const REM = 16

/** How far apart two values of a type are, in the unit people think in; undefined when not comparable. */
export function valueDistance(type: string, a: unknown, b: unknown, remBase = REM): number | undefined {
  if (type === 'color') return deltaEOK(a as ColorValue, b as ColorValue)
  if (type === 'dimension') {
    const pa = toPx(a as { value: number; unit: string }, remBase)
    const pb = toPx(b as { value: number; unit: string }, remBase)
    return pa !== undefined && pb !== undefined ? Math.abs(pa - pb) : undefined
  }
  if (type === 'duration') {
    const ms = (d: { value: number; unit: string }) => (d.unit === 's' ? d.value * 1000 : d.value)
    return Math.abs(ms(a as never) - ms(b as never))
  }
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b)
  // Font families, cubic béziers and the like are either the same or not comparable.
  return canonicalize(a) === canonicalize(b) ? 0 : undefined
}

/** Types a value can stand for: a bare number may be a font weight. */
const COMPATIBLE: Record<string, string[]> = {
  number: ['number', 'fontWeight'],
  fontWeight: ['fontWeight', 'number'],
}

export interface NearestToken {
  token: Token
  value: unknown
  /** ΔE for colors, px for dimensions, ms for durations. */
  distance: number
  /** Within what people cannot tell apart: ΔE < 1, < 0.5px; equal otherwise. */
  exact: boolean
}

/**
 * Tokens nearest to a value in one context. Deprecated ones go last; among equally close tokens,
 * the ones that reference another token (semantic tokens, which follow themes) come before the
 * primitives that hold the value.
 */
export function nearestTokens(
  graph: DsGraph,
  parsed: { type: string; value: unknown },
  input: Input,
  limit: number,
): NearestToken[] {
  const types = COMPATIBLE[parsed.type] ?? [parsed.type]
  const out: NearestToken[] = []
  const depth = new Map<NearestToken, number>()
  for (const token of graph.tokens({ type: types })) {
    const value = graph.value(token.id, input)
    if (value === undefined || value === null) continue
    const d = valueDistance(token.type === parsed.type ? parsed.type : token.type!, parsed.value, value)
    if (d === undefined) continue
    const exact = parsed.type === 'color' ? d < 1 : parsed.type === 'dimension' ? d < 0.5 : d === 0
    const m: NearestToken = { token, value, distance: Math.round(d * 100) / 100, exact }
    out.push(m)
    depth.set(m, graph.chain(token.id, input).length)
  }
  return out
    .sort(
      (a, b) =>
        Number(a.token.deprecated !== null) - Number(b.token.deprecated !== null) ||
        a.distance - b.distance ||
        depth.get(b)! - depth.get(a)! ||
        a.token.id.localeCompare(b.token.id),
    )
    .slice(0, limit)
}
