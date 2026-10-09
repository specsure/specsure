import type { Loc } from '@dsgraph/schema'
import type { DiagnosticBag } from '../diagnostics.js'

/** Context passed to value canonicalizers. */
export interface ValueContext {
  strict: boolean
  diag: DiagnosticBag
  loc?: Loc
  flags: Set<string>
}

/** Reports a non-standard input: an error in strict mode, a warning plus a flag otherwise. */
export function lenient(ctx: ValueContext, code: string, message: string, flag = 'legacy-syntax'): boolean {
  if (ctx.strict) {
    ctx.diag.error(code, message, ctx.loc)
    return false
  }
  ctx.diag.warn(code, message, ctx.loc)
  ctx.flags.add(flag)
  return true
}

export function invalid(ctx: ValueContext, code: string, message: string): undefined {
  ctx.diag.error(code, message, ctx.loc)
  ctx.flags.add('invalid')
  return undefined
}
