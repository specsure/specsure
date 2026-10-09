import { canonicalize, type Diagnostic, type Loc, type Severity } from '@dsgraph/schema'

/** Collects diagnostics, deduplicating identical entries. */
export class DiagnosticBag {
  private readonly items = new Map<string, Diagnostic>()

  add(code: string, severity: Severity, message: string, loc?: Loc): void {
    const d: Diagnostic = loc ? { code, severity, message, loc } : { code, severity, message }
    const key = canonicalize(d)
    if (!this.items.has(key)) this.items.set(key, d)
  }

  error(code: string, message: string, loc?: Loc): void {
    this.add(code, 'error', message, loc)
  }

  warn(code: string, message: string, loc?: Loc): void {
    this.add(code, 'warning', message, loc)
  }

  info(code: string, message: string, loc?: Loc): void {
    this.add(code, 'info', message, loc)
  }

  merge(other: DiagnosticBag): void {
    for (const d of other.list()) this.add(d.code, d.severity, d.message, d.loc)
  }

  hasErrors(): boolean {
    for (const d of this.items.values()) if (d.severity === 'error') return true
    return false
  }

  /** Sorted by file, pointer, code, message for deterministic output. */
  list(): Diagnostic[] {
    return [...this.items.values()].sort(
      (a, b) =>
        (a.loc?.file ?? '').localeCompare(b.loc?.file ?? '') ||
        (a.loc?.pointer ?? '').localeCompare(b.loc?.pointer ?? '') ||
        a.code.localeCompare(b.code) ||
        a.message.localeCompare(b.message),
    )
  }
}
