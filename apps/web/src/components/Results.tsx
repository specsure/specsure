import type { ChangeImpact, Changeset, Finding, Level } from '@dsgraph/core'
import { formatChangeset, formatSource, groupFindings } from '@dsgraph/report'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import type { Messages } from '../i18n/messages'
import { useT } from '../i18n/react'
import type { CardData } from '../lib/card'
import { publishedNote, verdictReason } from '../lib/explain'
import type { CodeReport, SideInfo, TokenGraph } from '../lib/types'
import {
  type ChangeGroup,
  colorPairs,
  contextAxes,
  GROUPS,
  inContext,
  LEVELS,
  typeOfChange,
  view,
} from '../lib/view'
import { CardDialog } from './CardDialog'
import { ChangeDetail, ChangeRow } from './ChangeList'
import { CodeReportView } from './CodeReportView'

export interface Result {
  changeset: Changeset
  types: Map<string, string | null>
  base: SideInfo
  head: SideInfo
  findings: Finding[]
  /** References of each side, for the graph in the detail pane. */
  graph?: { base: TokenGraph; head: TokenGraph }
  /** The user's code against this comparison, when they added it. */
  code?: CodeReport | undefined
  ms: number
}

interface Props {
  result: Result
  context: Record<string, string>
  onContext: (c: Record<string, string>) => void
  /** Copies a link to this comparison; undefined when the inputs cannot go into a link. */
  share?: (() => Promise<void>) | undefined
  shareNote?: string | undefined
  /** Page-wide shortcuts (⌘K, ⌘⇧C, /). Off where the results are an illustration. */
  shortcuts?: boolean
  /** What to do next, shown under the verdict: Token Diff points to Token Fix. */
  next?: ReactNode
}

const QUIET_LIMIT = 20

const COUNTED = ['removed', 'renamed', 'changed', 'added', 'deprecated'] as const

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
export const MOD = isMac ? '⌘' : 'Ctrl'

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const Keys = ({ keys }: { keys: string[] }) => (
  <span className="keys">
    {keys.map((k) => (
      <kbd key={k}>{k}</kbd>
    ))}
  </span>
)

export function Results({ result, context, onContext, share, shareNote, shortcuts = true, next }: Props) {
  const t = useT()
  const r = t.results
  const cs = result.changeset
  const [group, setGroup] = useState<ChangeGroup | ''>('')
  const [type, setType] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [actions, setActions] = useState(false)
  const [card, setCard] = useState(false)
  const [quiet, setQuiet] = useState(false)
  const search = useRef<HTMLInputElement>(null)

  const axes = useMemo(() => contextAxes(cs), [cs])
  const v = useMemo(
    () =>
      view(cs, result.types, {
        context,
        levels: LEVELS,
        groups: group ? [group] : [],
        types: type ? [type] : [],
        query,
      }),
    [cs, result.types, context, group, type, query],
  )
  // Many changes nobody sees (metadata, notation) hide the ones that matter: folded until asked.
  const folded = !group && !query && !quiet && v.byGroup.quiet.length > QUIET_LIMIT
  // Rows in display order: by impact, breaking first.
  const rows = useMemo(
    () => GROUPS.flatMap((g) => (g === 'quiet' && folded ? [] : v.byGroup[g])),
    [v, folded],
  )
  const current = rows.find((c) => c.id === selected) ?? rows[0]
  const affectedOf = (id: string) => [...new Set((v.propagatedBy.get(id) ?? []).map((p) => p.target))]
  const sitesBy = useMemo(
    () => new Map<string, ChangeImpact>((result.code?.impact.changes ?? []).map((c) => [c.change, c])),
    [result.code],
  )
  // Impact per token in the selected context, to mark changed tokens in the graph.
  const changed = useMemo(() => {
    const m = new Map<string, Level>()
    for (const c of cs.changes) {
      if (!inContext(c.when, context)) continue
      const prev = m.get(c.target)
      if (!prev || LEVELS.indexOf(c.level) < LEVELS.indexOf(prev)) m.set(c.target, c.level)
    }
    return m
  }, [cs, context])
  const pick = (target: string) => {
    const c =
      rows.find((r) => r.target === target) ??
      cs.changes.find((r) => r.target === target && r.origin === 'direct' && inContext(r.when, context))
    if (c) setSelected(c.id)
  }

  const flash = (s: string) => {
    setStatus(s)
    setTimeout(() => setStatus((x) => (x === s ? null : x)), 1800)
  }
  const markdown = () =>
    formatChangeset(cs, {
      format: 'markdown',
      types: result.types,
      ...(result.code ? { impact: result.code.impact } : {}),
    })
  const fileBase = `${result.base.label}--${result.head.label}`.replace(/[^\w.@-]+/g, '_')
  const copyMarkdown = async () => {
    await navigator.clipboard.writeText(markdown())
    flash(r.copied)
  }
  const copyLink = async () => {
    if (!share) return
    await share()
    flash(r.linkCopied)
  }

  const move = (delta: number) => {
    if (!rows.length) return
    const i = Math.max(
      0,
      rows.findIndex((c) => c.id === current?.id),
    )
    const next = rows[Math.min(rows.length - 1, Math.max(0, i + delta))]!
    setSelected(next.id)
    document.getElementById(`change-${next.id}`)?.scrollIntoView({ block: 'nearest' })
  }

  // Page-wide keys: / searches, ⌘K actions, ⌘⇧C copies Markdown. ↑ ↓ work inside the window only.
  useEffect(() => {
    if (!shortcuts) return
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setActions((a) => !a)
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        copyMarkdown()
      } else if (e.key === 'Escape') setActions(false)
      else if (!typing && e.key === '/') {
        e.preventDefault()
        search.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const counts = cs.summary.counts
  const empty = cs.changes.length === 0
  const from = versionOf(cs.base.source, result.base.label)
  const to = versionOf(cs.head.source, result.head.label)
  const cardData: CardData = {
    title: titleOf(cs, t),
    from: from === to ? t.card.before : from,
    to: from === to ? t.card.after : to,
    level: cs.summary.level,
    counts: COUNTED.map((k) => [t.card.counts[k](counts[k] ?? 0), counts[k] ?? 0]),
    colors: colorPairs(cs),
    empty,
    labels: { badge: t.card.badge, noChanges: t.card.noChanges, colors: t.card.colors },
  }

  const actionList: Array<{
    label: string
    keys?: string[]
    run: () => void
    disabled?: boolean
    title?: string
  }> = [
    {
      label: r.copyMarkdown,
      keys: [MOD, '⇧', 'C'],
      run: copyMarkdown,
      ...(r.markdownNote ? { title: r.markdownNote } : {}),
    },
    { label: r.card, run: () => setCard(true) },
    { label: r.copyLink, run: copyLink, disabled: !share, ...(shareNote ? { title: shareNote } : {}) },
    {
      label: r.downloadMarkdown,
      run: () => download(`${fileBase}.md`, markdown(), 'text/markdown'),
      ...(r.markdownNote ? { title: r.markdownNote } : {}),
    },
    {
      label: r.downloadJson,
      run: () =>
        download(`${fileBase}.changeset.json`, `${JSON.stringify(cs, null, 2)}\n`, 'application/json'),
    },
  ]

  return (
    <div className="results">
      <Verdict result={result} />
      {next}

      {/* biome-ignore lint/a11y/noStaticElementInteractions: arrow keys for the listbox and the search field inside */}
      <div
        className="window"
        onKeyDown={(e) => {
          const target = e.target as HTMLElement
          if (target.tagName === 'SELECT' || (target.tagName === 'INPUT' && target !== search.current)) return
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            move(e.key === 'ArrowDown' ? 1 : -1)
          }
        }}
      >
        {!empty && (
          <div className="searchbar">
            <input
              ref={search}
              type="search"
              value={query}
              placeholder={r.searchPlaceholder}
              aria-label={r.searchAria}
              spellCheck={false}
              onChange={(e) => setQuery(e.target.value)}
            />
            {axes.map((axis) => (
              <select
                key={axis.name}
                className="accessory"
                aria-label={axis.name}
                value={context[axis.name] ?? ''}
                onChange={(e) => {
                  const next = { ...context }
                  if (e.target.value) next[axis.name] = e.target.value
                  else delete next[axis.name]
                  onContext(next)
                }}
              >
                <option value="">{r.every(axis.name)}</option>
                {axis.values.map((x) => (
                  <option key={x} value={x}>
                    {axis.name}: {x}
                  </option>
                ))}
              </select>
            ))}
            <select
              className="accessory"
              aria-label={r.impactAria}
              value={group}
              onChange={(e) => setGroup(e.target.value as ChangeGroup | '')}
            >
              <option value="">{r.anyImpact}</option>
              {GROUPS.filter((g) => v.byGroup[g].length || g === group).map((g) => (
                <option key={g} value={g}>
                  {t.groups[g]}
                </option>
              ))}
            </select>
            {v.types.length > 1 && (
              <select
                className="accessory"
                aria-label={r.typeAria}
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="">{r.anyType}</option>
                {v.types.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {empty ? (
          <div className="empty">{r.same}</div>
        ) : rows.length === 0 ? (
          <div className="empty">{r.noMatch}</div>
        ) : (
          <div className="split">
            <div className="list" role="listbox" aria-label={r.listAria} tabIndex={0}>
              {GROUPS.map((g) =>
                v.byGroup[g].length ? (
                  // biome-ignore lint/a11y/useSemanticElements: a group of options inside a listbox, not a form fieldset
                  <div key={g} role="group" aria-label={t.groups[g]}>
                    <div className={`list__section list__section--${g}`}>
                      {t.groups[g]}
                      <span className="count">{v.byGroup[g].length}</span>
                    </div>
                    {g === 'quiet' && folded ? (
                      <button type="button" className="list__more" onClick={() => setQuiet(true)}>
                        {r.showQuiet(v.byGroup.quiet.length)}
                      </button>
                    ) : null}
                    {(g === 'quiet' && folded ? [] : v.byGroup[g]).map((c) => (
                      <ChangeRow
                        key={c.id}
                        change={c}
                        type={typeOfChange(c, result.types)}
                        affected={affectedOf(c.id).length}
                        sites={sitesBy.get(c.id)}
                        selected={c.id === current?.id}
                        onSelect={() => setSelected(c.id)}
                      />
                    ))}
                  </div>
                ) : null,
              )}
            </div>
            <aside className="detail" aria-live="polite">
              {current && (
                <ChangeDetail
                  change={current}
                  type={typeOfChange(current, result.types)}
                  affected={affectedOf(current.id)}
                  graph={result.graph}
                  axes={axes.map((a) => a.name)}
                  context={context}
                  changed={changed}
                  onPick={pick}
                  sites={sitesBy.get(current.id)}
                />
              )}
            </aside>
          </div>
        )}

        <footer className="actionbar">
          <span className="actionbar__status">
            {status ?? r.status(rows.length, result.ms, cs.contexts.partial)}
          </span>
          <button type="button" className="ghost" onClick={copyMarkdown} title={r.markdownNote || undefined}>
            {r.copyMarkdown} <Keys keys={[MOD, '⇧', 'C']} />
          </button>
          <span className="actionbar__sep" />
          <div className="actions-menu">
            <button
              type="button"
              className="ghost"
              aria-expanded={actions}
              onClick={() => setActions(!actions)}
            >
              {r.actions} <Keys keys={[MOD, 'K']} />
            </button>
            {actions && (
              <div className="popover" role="menu">
                {actionList.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    role="menuitem"
                    disabled={a.disabled}
                    title={a.title}
                    onClick={() => {
                      setActions(false)
                      a.run()
                    }}
                  >
                    <span>{a.label}</span>
                    {a.keys && <Keys keys={a.keys} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </footer>
      </div>

      {result.code && <CodeReportView report={result.code} label={result.base.label} />}

      <Findings findings={result.findings} label={result.head.label} />

      {card && <CardDialog data={cardData} fileName={`${fileBase}.png`} onClose={() => setCard(false)} />}
    </div>
  )
}

/** The verdict above the list: sources, release level and counts. */
export function Verdict({ result }: { result: Result }) {
  const t = useT()
  const cs = result.changeset
  const counts = cs.summary.counts
  const empty = cs.changes.length === 0
  const note = publishedNote(cs, t)
  // Direct changes the counts above leave out: retargeted references, metadata, notation.
  const counted = new Set([
    'token.added',
    'token.removed',
    'token.renamed',
    'token.value-changed',
    'token.deprecated',
  ])
  const rest = cs.changes.filter((c) => c.origin === 'direct' && !counted.has(c.kind))
  const unseen = rest.filter((c) => c.level === 'none').length
  const other = rest.length - unseen
  return (
    <header className="verdict">
      <p className="verdict__sources">
        <code>{result.base.label}</code>
        <span className="muted"> → </span>
        <code>{result.head.label}</code>
      </p>
      <h2 className={`verdict__title verdict__title--${empty ? 'none' : cs.summary.level}`}>
        {empty ? t.verdict.noChanges : t.verdict.release[cs.summary.level]}
      </h2>
      {!empty && (
        <p className="verdict__counts">
          {COUNTED.filter((k) => counts[k]).map((k) => (
            <Count key={k} text={t.verdict.counts[k](counts[k]!)} />
          ))}
          {counts.propagated ? <Count muted text={t.verdict.counts.propagated(counts.propagated)} /> : null}
          {other ? <Count muted text={t.verdict.counts.other(other)} /> : null}
          {unseen ? <Count muted text={t.verdict.counts.unseen(unseen)} /> : null}
        </p>
      )}
      {!empty && <p className="verdict__reason">{verdictReason(cs, t)}</p>}
      {result.code && (
        <p className={`verdict__code${result.code.impact.breaks ? ' verdict__code--breaks' : ''}`}>
          {t.yourCode.summary(
            result.code.impact.breaks,
            result.code.impact.looksDifferent,
            result.code.impact.files.length,
          )}
        </p>
      )}
      {note && <p className={`verdict__note verdict__note--${note.tone}`}>{note.text}</p>}
    </header>
  )
}

/** A count with its number in bold, wherever the number stands in the phrase («ещё 3 изменились»). */
export function Count({ text, muted }: { text: string; muted?: boolean }) {
  const parts = text.split(/(\d+(?:[\u00a0\u202f\s,.]\d+)*)/)
  return (
    <span className={muted ? 'muted' : undefined}>
      {parts.map((p, i) => (i % 2 ? <strong key={p + String(i)}>{p}</strong> : p))}
    </span>
  )
}

export function Findings({ findings, label, open }: { findings: Finding[]; label: string; open?: boolean }) {
  const t = useT()
  const groups = useMemo(() => groupFindings(findings), [findings])
  if (findings.length === 0) return null
  const n = { error: 0, warning: 0, info: 0 }
  for (const f of findings) n[f.severity]++
  return (
    <details className="window findings" open={open}>
      <summary className="findings__head">
        <span>
          {t.checks.on} <code>{label}</code>
        </span>
        <span className="row__acc">
          {n.error > 0 && <span className="tag tag--danger">{t.checks.errors(n.error)}</span>}
          {n.warning > 0 && <span className="tag tag--warning">{t.checks.warnings(n.warning)}</span>}
          {n.info > 0 && <span className="tag">{t.checks.info(n.info)}</span>}
        </span>
      </summary>
      <div className="findings__list">
        {groups.map((g) => (
          <details key={`${g.severity}${g.rule}${g.pattern}`} className="finding">
            <summary className="row">
              <span
                className={`icon icon--${g.severity === 'error' ? 'danger' : g.severity}`}
                aria-hidden="true"
              >
                {g.severity === 'error' ? '×' : g.severity === 'warning' ? '!' : 'i'}
              </span>
              <span className="row__title row__title--text">{t.checks.titles[g.rule] ?? g.pattern}</span>
              <span className="row__acc">
                <span className="acc-text">{g.rule}</span>
                <span className="tag">{g.findings.length}</span>
              </span>
            </summary>
            {t.checks.help[g.rule] && <p className="finding__hint">{t.checks.help[g.rule]}</p>}
            {t.checks.titles[g.rule] && <p className="finding__pattern">{g.pattern}</p>}
            <ul className="finding__items">
              {g.findings.slice(0, 200).map((f) => (
                <li key={f.id}>
                  {/* A finding about a whole file names the file; the group's title already says what. */}
                  {(f.nodes[0] ?? f.loc?.file) && <code>{f.nodes[0] ?? f.loc?.file}</code>}
                  {(f.message !== g.pattern || !(f.nodes[0] ?? f.loc?.file)) && <span>{f.message}</span>}
                </li>
              ))}
              {g.findings.length > 200 && (
                <li className="muted">{t.checks.andMore(g.findings.length - 200)}</li>
              )}
            </ul>
          </details>
        ))}
      </div>
    </details>
  )
}

/** Package or repository name for the card; a file label otherwise. */
function titleOf(cs: Changeset, t: Messages): string {
  const b = cs.base.source
  const h = cs.head.source
  if (b.kind === 'npm' && h.kind === 'npm' && b.package === h.package) return b.package ?? 'Tokens'
  if (b.kind === 'github' && h.kind === 'github' && b.repo === h.repo) return b.repo ?? 'Tokens'
  if (h.kind === 'npm' && h.package) return h.package
  if (h.kind === 'github' && h.repo) return h.repo
  return t.card.designTokens
}

function versionOf(s: Changeset['base']['source'], label: string): string {
  if (s.kind === 'npm' && s.version) return s.version
  if (s.kind === 'github' && s.ref) return s.ref
  return label || formatSource(s)
}
