import type { Finding } from '@dsgraph/core'
import { useT } from '../i18n/react'
import type { CodeReport } from '../lib/types'

const where = (f: Finding) => `${f.loc?.file ?? ''}:${f.loc?.line ?? ''}`
const byPlace = (a: { file: string; line: number }, b: { file: string; line: number }) =>
  a.file.localeCompare(b.file) || a.line - b.line
const asVar = (id: string) => (id.includes('.') ? id : `var(--${id})`)
const LIMIT = 200

/** The project's code against the old version: share on tokens, values written by hand, variables to update. */
export function CodeReportView({ report, label }: { report: CodeReport; label: string }) {
  const t = useT()
  const y = t.yourCode
  const pct = report.coverage.share === null ? null : Math.round(report.coverage.share * 100)
  const hand = report.findings
    .filter((f) => f.rule.startsWith('style/'))
    .map((f) => {
      const e = f.evidence as {
        source?: string
        value: string
        property: string
        token: string
        replacement: string
        exact: boolean
      }
      return {
        id: f.id,
        where: where(f),
        file: f.loc?.file ?? '',
        line: f.loc?.line ?? 0,
        written: e.source ?? `${e.property}: ${e.value}`,
        use: e.source ? e.replacement : asVar(e.token),
        exact: e.exact,
      }
    })
    .sort(byPlace)
  const usage = report.findings
    .filter((f) => f.rule.startsWith('usage/'))
    .map((f) => {
      const e = f.evidence as { name?: string; replacement?: string }
      return {
        id: f.id,
        where: where(f),
        file: f.loc?.file ?? '',
        line: f.loc?.line ?? 0,
        written: e.name ?? f.nodes[0] ?? '',
        why: f.rule === 'usage/deprecated' ? y.deprecated(e.replacement) : y.unknown,
      }
    })
    .sort(byPlace)

  return (
    <section className="window code-figure__window code-report" aria-label={y.title}>
      <h3 className="code-report__title">{y.title}</h3>
      {pct !== null && (
        <div className="code-figure__meter">
          <span className="code-figure__label">{y.onTokens}</span>
          <span className="code-figure__pct">{pct}%</span>
          <span className="code-figure__bar" aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </span>
          <span className="code-figure__split">
            {y.split(report.coverage.fromTokens, report.coverage.byHand)} · {y.against(label)}
          </span>
        </div>
      )}

      {hand.length === 0 && usage.length === 0 && <p className="code-report__clean">{y.clean}</p>}

      {hand.length > 0 && (
        <>
          <div className="list__section">
            {y.handTitle}
            <span className="count">{hand.length}</span>
          </div>
          <ul className="code-figure__rows">
            {hand.slice(0, LIMIT).map((r) => (
              <li key={r.id} className="code-figure__row">
                <span className="code-figure__where" title={r.where}>
                  {r.where}
                </span>
                <span className="code-figure__fix">
                  <code className="code-figure__was">{r.written}</code>
                  <span className="code-figure__arrow" aria-hidden="true">
                    →
                  </span>
                  <code className="code-figure__use">{r.use}</code>
                  {!r.exact && <span className="code-figure__note">{y.closest}</span>}
                </span>
              </li>
            ))}
            {hand.length > LIMIT && <li className="code-figure__row muted">{y.more(hand.length - LIMIT)}</li>}
          </ul>
        </>
      )}

      {usage.length > 0 && (
        <>
          <div className="list__section code-report__section--warn">
            {y.usageTitle}
            <span className="count">{usage.length}</span>
          </div>
          <ul className="code-figure__rows">
            {usage.slice(0, LIMIT).map((r) => (
              <li key={r.id} className="code-figure__row">
                <span className="code-figure__where" title={r.where}>
                  {r.where}
                </span>
                <span className="code-figure__fix">
                  <code className="code-figure__was">{r.written}</code>
                  <span className="code-figure__note">{r.why}</span>
                </span>
              </li>
            ))}
            {usage.length > LIMIT && (
              <li className="code-figure__row muted">{y.more(usage.length - LIMIT)}</li>
            )}
          </ul>
        </>
      )}
    </section>
  )
}
