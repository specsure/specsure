import type { Changeset, Finding, Level } from '@dsgraph/core'
import { formatChangeset, formatSource, groupFindings } from '@dsgraph/report'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CardData } from '../lib/card'
import type { SideInfo } from '../lib/types'
import { colorPairs, contextAxes, LEVEL_TITLE, LEVELS, typeOfChange, view } from '../lib/view'
import { CardDialog } from './CardDialog'
import { ChangeDetail, ChangeRow } from './ChangeList'

export interface Result {
  changeset: Changeset
  types: Map<string, string | null>
  base: SideInfo
  head: SideInfo
  findings: Finding[]
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
}

const COUNT_LABELS: Array<[key: string, label: string]> = [
  ['removed', 'removed'],
  ['renamed', 'renamed'],
  ['changed', 'changed'],
  ['added', 'added'],
  ['deprecated', 'deprecated'],
]

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

export function Results({ result, context, onContext, share, shareNote, shortcuts = true }: Props) {
  const cs = result.changeset
  const [level, setLevel] = useState<Level | ''>('')
  const [type, setType] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [actions, setActions] = useState(false)
  const [card, setCard] = useState(false)
  const search = useRef<HTMLInputElement>(null)

  const axes = useMemo(() => contextAxes(cs), [cs])
  const v = useMemo(
    () =>
      view(cs, result.types, {
        context,
        levels: level ? [level] : LEVELS,
        types: type ? [type] : [],
        query,
      }),
    [cs, result.types, context, level, type, query],
  )
  // Rows in display order: by impact, breaking first.
  const rows = useMemo(() => LEVELS.flatMap((l) => v.byLevel[l]), [v])
  const current = rows.find((c) => c.id === selected) ?? rows[0]
  const affectedOf = (id: string) => [...new Set((v.propagatedBy.get(id) ?? []).map((p) => p.target))]

  const flash = (s: string) => {
    setStatus(s)
    setTimeout(() => setStatus((x) => (x === s ? null : x)), 1800)
  }
  const markdown = () => formatChangeset(cs, { format: 'markdown', types: result.types })
  const fileBase = `${result.base.label}--${result.head.label}`.replace(/[^\w.@-]+/g, '_')
  const copyMarkdown = async () => {
    await navigator.clipboard.writeText(markdown())
    flash('Markdown copied')
  }
  const copyLink = async () => {
    if (!share) return
    await share()
    flash('Link copied')
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
    title: titleOf(cs),
    from: from === to ? 'before' : from,
    to: from === to ? 'after' : to,
    level: cs.summary.level,
    counts: COUNT_LABELS.map(([k, label]) => [label, counts[k] ?? 0]),
    colors: colorPairs(cs),
    empty,
  }

  const actionList: Array<{
    label: string
    keys?: string[]
    run: () => void
    disabled?: boolean
    title?: string
  }> = [
    { label: 'Copy Markdown', keys: [MOD, '⇧', 'C'], run: copyMarkdown },
    { label: 'Card for a post', run: () => setCard(true) },
    { label: 'Copy link', run: copyLink, disabled: !share, ...(shareNote ? { title: shareNote } : {}) },
    { label: 'Download Markdown', run: () => download(`${fileBase}.md`, markdown(), 'text/markdown') },
    {
      label: 'Download changeset JSON',
      run: () =>
        download(`${fileBase}.changeset.json`, `${JSON.stringify(cs, null, 2)}\n`, 'application/json'),
    },
  ]

  return (
    <div className="results">
      <Verdict result={result} />

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
              placeholder="Filter by token name"
              aria-label="Filter changes"
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
                <option value="">Every {axis.name}</option>
                {axis.values.map((x) => (
                  <option key={x} value={x}>
                    {axis.name}: {x}
                  </option>
                ))}
              </select>
            ))}
            <select
              className="accessory"
              aria-label="Impact"
              value={level}
              onChange={(e) => setLevel(e.target.value as Level | '')}
            >
              <option value="">Any impact</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {LEVEL_TITLE[l]}
                </option>
              ))}
            </select>
            {v.types.length > 1 && (
              <select
                className="accessory"
                aria-label="Type"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="">Any type</option>
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
          <div className="empty">Both versions resolve to the same tokens in every context.</div>
        ) : rows.length === 0 ? (
          <div className="empty">Nothing matches these filters.</div>
        ) : (
          <div className="split">
            <div className="list" role="listbox" aria-label="Changes" tabIndex={0}>
              {LEVELS.map((l) =>
                v.byLevel[l].length ? (
                  // biome-ignore lint/a11y/useSemanticElements: a group of options inside a listbox, not a form fieldset
                  <div key={l} role="group" aria-label={LEVEL_TITLE[l]}>
                    <div className={`list__section list__section--${l}`}>
                      {LEVEL_TITLE[l]}
                      <span className="count">{v.byLevel[l].length}</span>
                    </div>
                    {v.byLevel[l].map((c) => (
                      <ChangeRow
                        key={c.id}
                        change={c}
                        type={typeOfChange(c, result.types)}
                        affected={affectedOf(c.id).length}
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
                />
              )}
            </aside>
          </div>
        )}

        <footer className="actionbar">
          <span className="actionbar__status">
            {status ??
              `${rows.length} ${rows.length === 1 ? 'change' : 'changes'} · ${result.ms} ms${
                cs.contexts.partial ? ' · some context combinations were skipped' : ''
              }`}
          </span>
          <button type="button" className="ghost" onClick={copyMarkdown}>
            Copy Markdown <Keys keys={[MOD, '⇧', 'C']} />
          </button>
          <span className="actionbar__sep" />
          <div className="actions-menu">
            <button
              type="button"
              className="ghost"
              aria-expanded={actions}
              onClick={() => setActions(!actions)}
            >
              Actions <Keys keys={[MOD, 'K']} />
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

      <Findings findings={result.findings} label={result.head.label} />

      {card && <CardDialog data={cardData} fileName={`${fileBase}.png`} onClose={() => setCard(false)} />}
    </div>
  )
}

/** The verdict above the list: sources, release level and counts. */
export function Verdict({ result }: { result: Result }) {
  const cs = result.changeset
  const counts = cs.summary.counts
  const empty = cs.changes.length === 0
  return (
    <header className="verdict">
      <p className="verdict__sources">
        <code>{result.base.label}</code>
        <span className="muted"> → </span>
        <code>{result.head.label}</code>
      </p>
      <h2 className={`verdict__title verdict__title--${empty ? 'none' : cs.summary.level}`}>
        {empty
          ? 'No changes'
          : cs.summary.level === 'none'
            ? 'No impact on consumers'
            : `${LEVEL_TITLE[cs.summary.level]} release`}
      </h2>
      {!empty && (
        <p className="verdict__counts">
          {COUNT_LABELS.filter(([k]) => counts[k]).map(([k, label]) => (
            <span key={k}>
              <strong>{counts[k]}</strong> {label}
            </span>
          ))}
          {counts.propagated ? (
            <span className="muted">
              <strong>{counts.propagated}</strong> through aliases
            </span>
          ) : null}
        </p>
      )}
    </header>
  )
}

export function Findings({ findings, label, open }: { findings: Finding[]; label: string; open?: boolean }) {
  const groups = useMemo(() => groupFindings(findings), [findings])
  if (findings.length === 0) return null
  const n = { error: 0, warning: 0, info: 0 }
  for (const f of findings) n[f.severity]++
  return (
    <details className="window findings" open={open}>
      <summary className="findings__head">
        <span>
          Checks on <code>{label}</code>
        </span>
        <span className="row__acc">
          {n.error > 0 && <span className="tag tag--danger">{n.error} errors</span>}
          {n.warning > 0 && <span className="tag tag--warning">{n.warning} warnings</span>}
          {n.info > 0 && <span className="tag">{n.info} info</span>}
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
              <span className="row__title row__title--text">{g.pattern}</span>
              <span className="row__acc">
                <span className="acc-text">{g.rule}</span>
                <span className="tag">{g.findings.length}</span>
              </span>
            </summary>
            <ul className="finding__items">
              {g.findings.slice(0, 200).map((f) => (
                <li key={f.id}>
                  {f.nodes[0] && <code>{f.nodes[0]}</code>}
                  <span>{f.message}</span>
                </li>
              ))}
              {g.findings.length > 200 && <li className="muted">and {g.findings.length - 200} more</li>}
            </ul>
          </details>
        ))}
      </div>
    </details>
  )
}

/** Package or repository name for the card; a file label otherwise. */
function titleOf(cs: Changeset): string {
  const b = cs.base.source
  const h = cs.head.source
  if (b.kind === 'npm' && h.kind === 'npm' && b.package === h.package) return b.package ?? 'Tokens'
  if (b.kind === 'github' && h.kind === 'github' && b.repo === h.repo) return b.repo ?? 'Tokens'
  if (h.kind === 'npm' && h.package) return h.package
  if (h.kind === 'github' && h.repo) return h.repo
  return 'Design tokens'
}

function versionOf(s: Changeset['base']['source'], label: string): string {
  if (s.kind === 'npm' && s.version) return s.version
  if (s.kind === 'github' && s.ref) return s.ref
  return label || formatSource(s)
}
