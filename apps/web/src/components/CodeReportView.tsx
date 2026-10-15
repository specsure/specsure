import type { Finding } from '@dsgraph/core'
import { colorSize } from '@dsgraph/report'
import type { ReactNode } from 'react'
import { useT } from '../i18n/react'
import type { CodeReport } from '../lib/types'

const asVar = (id: string) => (id.includes('.') ? id : `var(--${id})`)
/** Token names in a sentence do not break at their hyphens. */
const nb = (name: string) => name.replace(/-/g, '\u2011')
const LIMIT = 200
const SIZE_INDEX = { invisible: 0, barely: 1, noticeable: 2, clear: 3, different: 4 } as const

interface Row {
  key: string
  file: string
  line: number
  body: ReactNode
}

/** Rows under their file, files and lines in order: a path once, not on every line. */
function ByFile({ rows, more }: { rows: Row[]; more: (n: number) => string }) {
  const t = useT()
  const sorted = [...rows].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
  const shown = sorted.slice(0, LIMIT)
  const files = [...new Set(shown.map((r) => r.file))]
  return (
    <div className="code-report__files">
      {files.map((file) => (
        <div key={file} className="code-report__file">
          <div className="code-report__path" title={file}>
            {file}
          </div>
          <ul className="code-report__rows">
            {shown
              .filter((r) => r.file === file)
              .map((r) => (
                <li key={r.key} className="code-report__row">
                  <span className="code-report__line">{t.yourCode.line(r.line)}</span>
                  <span className="code-report__body">{r.body}</span>
                </li>
              ))}
          </ul>
        </div>
      ))}
      {sorted.length > LIMIT && <p className="code-report__more">{more(sorted.length - LIMIT)}</p>}
    </div>
  )
}

/**
 * The project's code against the comparison, most urgent first: what breaks after the update, what
 * looks different, how much is on tokens, values written by hand with their replacement, variables
 * to update.
 */
export function CodeReportView({ report }: { report: CodeReport; label: string }) {
  const t = useT()
  const y = t.yourCode
  const pct = report.coverage.share === null ? null : Math.round(report.coverage.share * 100)

  // What the comparison does to the code, from the impact: breaks first, then what looks different.
  // A place several changes reach is one row listing them all, as the counts above it say.
  const places = new Map<
    string,
    { file: string; line: number; written: string; breaks: boolean; notes: string[] }
  >()
  for (const ci of report.impact.changes)
    for (const s of ci.sites) {
      const written = s.text ?? `var(${s.name})`
      const key = `${s.file}:${s.line}:${s.column}:${written}`
      const place = places.get(key) ?? { file: s.file, line: s.line, written, breaks: false, notes: [] }
      place.breaks ||= ci.effect === 'breaks'
      place.notes.push(
        ci.effect === 'breaks'
          ? ci.kind === 'token.renamed'
            ? y.renamedTo(nb(ci.target))
            : y.tokenRemoved
          : y.changed(nb(ci.target), s.token === ci.target ? undefined : nb(s.token)),
      )
      places.set(key, place)
    }
  const rowOf = ([key, p]: [
    string,
    { file: string; line: number; written: string; breaks: boolean; notes: string[] },
  ]): Row => ({
    key,
    file: p.file,
    line: p.line,
    body: (
      <>
        <code className={`code-figure__was${p.breaks ? ' code-figure__was--broken' : ''}`}>{p.written}</code>
        <span className="code-figure__note">{p.notes.join('; ')}</span>
      </>
    ),
  })
  const breaks = [...places].filter(([, p]) => p.breaks).map(rowOf)
  const looks = [...places].filter(([, p]) => !p.breaks).map(rowOf)

  const hand: Row[] = report.findings
    .filter((f) => f.rule.startsWith('style/'))
    .map((f: Finding) => {
      const e = f.evidence as {
        source?: string
        value: string
        property: string
        token: string
        replacement: string
        exact: boolean
        deltaE?: number
        distance?: number
      }
      const isColor = f.rule === 'style/hardcoded-color'
      const off = e.exact
        ? ''
        : typeof e.deltaE === 'number'
          ? y.closestBy(t.change.deltaShort[SIZE_INDEX[colorSize(e.deltaE)]] ?? '')
          : typeof e.distance === 'number'
            ? y.closestBy(y.pxOff(e.distance))
            : y.closest
      return {
        key: f.id,
        file: f.loc?.file ?? '',
        line: f.loc?.line ?? 0,
        body: (
          <>
            {isColor && (
              <span className="code-report__swatch" style={{ background: e.value }} aria-hidden="true" />
            )}
            <code className="code-figure__was">{e.source ?? `${e.property}: ${e.value}`}</code>
            <span className="code-figure__arrow" aria-hidden="true">
              →
            </span>
            <code className="code-figure__use">{e.source ? e.replacement : asVar(e.token)}</code>
            {off && <span className="code-figure__note">{off}</span>}
          </>
        ),
      }
    })

  const usage: Row[] = report.findings
    .filter((f) => f.rule.startsWith('usage/'))
    .map((f) => {
      const e = f.evidence as { name?: string; replacement?: string }
      return {
        key: f.id,
        file: f.loc?.file ?? '',
        line: f.loc?.line ?? 0,
        body: (
          <>
            <code className="code-figure__was">{e.name ?? f.nodes[0] ?? ''}</code>
            <span className="code-figure__note">
              {f.rule === 'usage/deprecated' ? y.deprecated(e.replacement) : y.unknown}
            </span>
          </>
        ),
      }
    })

  return (
    <section className="window code-report" aria-label={y.title}>
      <header className="code-report__head">
        <div className="code-report__name">
          <h3 className="code-report__title">{y.title}</h3>
          <span className="code-report__source">
            {[report.label, report.limited ? y.limited(report.files, report.limited) : y.read(report.files)]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
        {pct !== null && (
          <div className="code-report__coverage">
            <span className="code-figure__label">{y.onTokens}</span>
            <span className="code-report__pct">{pct}%</span>
            <span className="code-figure__bar code-report__bar" aria-hidden="true">
              <span style={{ width: `${pct}%` }} />
            </span>
            <span className="code-report__split">
              {y.split(report.coverage.fromTokens, report.coverage.byHand)}
            </span>
          </div>
        )}
      </header>

      {breaks.length > 0 && (
        <section className="code-report__section">
          <div className="list__section list__section--breaks">
            {y.breaksTitle}
            <span className="count">{breaks.length}</span>
          </div>
          <ByFile rows={breaks} more={y.more} />
        </section>
      )}

      {looks.length > 0 && (
        <details className="code-report__section code-report__fold">
          <summary className="list__section">
            {y.looksTitle}
            <span className="count">{looks.length}</span>
          </summary>
          <ByFile rows={looks} more={y.more} />
        </details>
      )}

      {hand.length > 0 && (
        <section className="code-report__section">
          <div className="list__section">
            {y.handTitle}
            <span className="count">{hand.length}</span>
          </div>
          <p className="code-report__lead">{y.handLead}</p>
          <ByFile rows={hand} more={y.more} />
        </section>
      )}

      {usage.length > 0 && (
        <section className="code-report__section">
          <div className="list__section code-report__section--warn">
            {y.usageTitle}
            <span className="count">{usage.length}</span>
          </div>
          <ByFile rows={usage} more={y.more} />
        </section>
      )}

      {breaks.length === 0 && hand.length === 0 && usage.length === 0 && (
        <p className="code-report__clean">{y.clean}</p>
      )}
    </section>
  )
}
