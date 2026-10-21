import type { Finding, When } from '@dsgraph/core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Lang } from '../i18n'
import { localePath } from '../i18n'
import { LangProvider, useLang, useT } from '../i18n/react'
import { looksLikeCode } from '../lib/code-text'
import { EXAMPLE } from '../lib/example'
import { deltaWords } from '../lib/explain'
import type {
  DemoAnswer,
  IndexRow,
  LookupRequest,
  LookupResponse,
  LookupSummary,
  SnippetAnswer,
  TokenCard,
  ValueAnswer,
} from '../lib/lookup-types'
import { readLookupUrl, writeLookupUrl } from '../lib/lookup-url'
import type { SideInput, TokenGraph } from '../lib/types'
import { MAX_FRAGMENT, packFiles, unpackFiles } from '../lib/url'
import { GraphView } from './GraphView'
import { Count, Findings, Keys, MOD } from './Results'
import { SidePicker } from './SidePicker'

const emptyNpm: SideInput = { kind: 'npm', pkg: '', version: '' }

const ready = (s: SideInput): boolean =>
  s.kind === 'npm' ? !!s.pkg && !!s.version : s.kind === 'github' ? !!s.repo : s.files.length > 0
const normalize = (s: SideInput): SideInput => (s.kind === 'github' && !s.ref ? { ...s, ref: 'HEAD' } : s)

/** Rows a section shows before "Show all": thousands of rows make the page slow and the list unreadable. */
const SECTION_LIMIT = 120
const NO_CHANGES = new Map()
/** Units of a distance between values, by type. */
const UNIT: Record<string, string> = { dimension: 'px', duration: 'ms' }

interface Loaded {
  source: SideInput
  include: string
  summary: LookupSummary
  index: IndexRow[]
  graph: TokenGraph
  ms: number
}

type Modes = LookupSummary['description']['modes']

/** A name with case and separators dropped: `accent.emphasis` finds `bgColor-accent-emphasis`. */
const loose = (name: string) =>
  name
    .replace(/^--/, '')
    .replace(/[\s._/-]+/g, '')
    .toLowerCase()

/** Each mode at the selected context, or its default. */
const effective = (modes: Modes, context: Record<string, string>): Record<string, string> =>
  Object.fromEntries(modes.map((m) => [m.name, context[m.name] ?? m.default]))

/** A token's value in a context: the most specific value that applies. */
function valueIn<V extends { when: When }>(values: V[], at: Record<string, string>): V | undefined {
  let best: V | undefined
  let score = -1
  for (const v of values) {
    const keys = Object.entries(v.when ?? {})
    if (!keys.every(([k, x]) => at[k] === undefined || at[k] === x)) continue
    if (keys.length > score) {
      best = v
      score = keys.length
    }
  }
  return best ?? values[0]
}

export default function TokenLookup({ lang = 'en' }: { lang?: Lang }) {
  return (
    <LangProvider lang={lang}>
      <App />
    </LangProvider>
  )
}

/** Talks to the lookup worker: one answer per question, matched by id. */
function useLookup() {
  const worker = useRef<Worker | null>(null)
  const waiting = useRef(new Map<number, (r: LookupResponse) => void>())
  const next = useRef(0)
  useEffect(() => {
    const w = new Worker(new URL('../lib/lookup-worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<LookupResponse>) => {
      const done = waiting.current.get(e.data.id)
      waiting.current.delete(e.data.id)
      done?.(e.data)
    }
    worker.current = w
    return () => w.terminate()
  }, [])
  // biome-ignore lint/suspicious/noExplicitAny: each request kind is sent with its own fields; the union is spread back
  return useCallback((req: any): Promise<LookupResponse> => {
    const id = ++next.current
    return new Promise((resolve) => {
      waiting.current.set(id, resolve)
      worker.current?.postMessage({ ...req, id } as LookupRequest)
    })
  }, [])
}

function App() {
  const t = useT()
  const ask = useLookup()
  const [source, setSource] = useState<SideInput>(emptyNpm)
  const [include, setInclude] = useState('')
  const [githubToken, setGithubToken] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [findings, setFindings] = useState<Finding[] | null>(null)
  const [context, setContext] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')
  const [token, setToken] = useState<string | undefined>()
  const [fragment, setFragment] = useState<string | null>(null)
  const initial = useRef<{ query: string; token?: string } | null>(null)
  const [tick, setTick] = useState(0)
  const autoOpen = useRef(false)

  const open = useCallback(
    async (s = source, inc = include) => {
      if (!ready(s)) return
      const src = normalize(s)
      setRunning(true)
      setError(null)
      const r = await ask({
        kind: 'open',
        source: src,
        include: inc,
        ...(githubToken ? { githubToken } : {}),
      })
      setRunning(false)
      if (!r.ok) {
        setError(r.hint === 'private' ? `${r.error}. ${t.inputs.privateHint}` : r.error)
        return
      }
      if (r.kind !== 'open') return
      setLoaded({ source: src, include: inc, summary: r.summary, index: r.index, graph: r.graph, ms: r.ms })
      setFindings(null)
      const keep = initial.current
      initial.current = null
      setQuery(keep?.query ?? '')
      setToken(keep?.token)
      const h = await ask({ kind: 'health' })
      if (h.ok && h.kind === 'health') setFindings(h.findings)
    },
    [ask, source, include, githubToken, t],
  )

  // State from the address: the source, the theme, the search and the open token.
  useEffect(() => {
    const url = new URL(location.href)
    const s = readLookupUrl(url)
    setInclude(s.include)
    setContext(s.context)
    initial.current = { query: s.query, ...(s.token ? { token: s.token } : {}) }
    if (url.searchParams.has('example')) {
      setSource({ kind: 'files', files: EXAMPLE.head })
      autoOpen.current = true
      setTick((x) => x + 1)
      return
    }
    if (s.source) setSource(s.source)
    unpackFiles(url.hash)
      .then((packed) => {
        if (packed?.head) setSource({ kind: 'files', files: packed.head })
        if (s.source || packed?.head) autoOpen.current = true
      })
      .catch(() => {
        if (s.source) autoOpen.current = true
      })
      .finally(() => setTick((x) => x + 1))
  }, [])

  useEffect(() => {
    if (tick && autoOpen.current) {
      autoOpen.current = false
      open()
    }
  }, [tick, open])

  // ⌘↵ opens from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        open()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // The address follows what is on screen, so it can be shared or reloaded.
  useEffect(() => {
    if (!loaded) return
    let live = true
    const state = {
      source: loaded.source,
      include: loaded.include,
      context,
      // Pasted code stays out of the address: the query goes to the server with the page request.
      query: looksLikeCode(query) ? '' : query,
      ...(token ? { token } : {}),
    }
    const write = (files: string) => {
      if (!live) return
      history.replaceState(null, '', writeLookupUrl(location.pathname, state, files))
      setFragment(files)
    }
    if (loaded.source.kind === 'files')
      packFiles({ head: loaded.source.files }).then(
        (f) => write(f.length <= MAX_FRAGMENT ? f : ''),
        () => write(''),
      )
    else write('')
    return () => {
      live = false
    }
  }, [loaded, context, query, token])

  const example = () => {
    const s: SideInput = { kind: 'files', files: EXAMPLE.head }
    setSource(s)
    setInclude('')
    open(s, '')
  }
  const canShare = !!loaded && (loaded.source.kind !== 'files' || !!fragment)

  return (
    <div className="token-diff lookup">
      <form
        className={`window inputs${running ? ' is-loading' : ''}`}
        onSubmit={(e) => {
          e.preventDefault()
          open()
        }}
      >
        <SidePicker
          side="head"
          label={t.lookup.source}
          value={source}
          onChange={setSource}
          error={error ?? undefined}
          info={
            loaded
              ? {
                  label: loaded.summary.label,
                  files: loaded.summary.files,
                  tokens: loaded.index.length,
                  modifiers: loaded.summary.description.modes.map((m) => ({
                    name: m.name,
                    contexts: m.contexts,
                  })),
                }
              : undefined
          }
          githubToken={githubToken}
          onGithubToken={setGithubToken}
        />
        <div className="source source--glob">
          <div className="source__row">
            <span className="source__label">{t.inputs.filesLabel}</span>
            <input
              className="source__input source__input--small"
              aria-label={t.inputs.filesAria}
              value={include}
              placeholder={t.inputs.filesPlaceholder}
              spellCheck={false}
              onChange={(e) => setInclude(e.target.value)}
              title={t.inputs.filesTitle}
            />
          </div>
        </div>
        <footer className="actionbar">
          <span className="actionbar__status">{running ? t.lookup.progress : null}</span>
          <button type="button" className="ghost" onClick={example}>
            {t.lookup.example}
          </button>
          <span className="actionbar__sep" />
          <button type="submit" className="ghost ghost--strong" disabled={!ready(source) || running}>
            {t.lookup.open} <Keys keys={[MOD, '↵']} />
          </button>
        </footer>
      </form>

      {loaded && (
        <Browser
          loaded={loaded}
          ask={ask}
          context={context}
          onContext={setContext}
          query={query}
          onQuery={setQuery}
          token={token}
          onToken={setToken}
          share={canShare ? () => navigator.clipboard.writeText(location.href) : undefined}
        />
      )}
      {loaded && findings && <Findings findings={findings} label={loaded.summary.label} />}
    </div>
  )
}

interface BrowserProps {
  loaded: Loaded
  ask: ReturnType<typeof useLookup>
  context: Record<string, string>
  onContext: (c: Record<string, string>) => void
  query: string
  onQuery: (q: string) => void
  token: string | undefined
  onToken: (id: string | undefined) => void
  share: (() => Promise<void>) | undefined
}

/** One shown row: a token, and for a value search, how close it is. */
interface Shown {
  row: IndexRow
  note?: string
}

function Browser({ loaded, ask, context, onContext, query, onQuery, token, onToken, share }: BrowserProps) {
  const t = useT()
  const l = t.lookup
  const { summary, index } = loaded
  const d = summary.description
  const [type, setType] = useState('')
  const [property, setProperty] = useState('')
  const [state, setState] = useState('')
  const [answer, setAnswer] = useState<ValueAnswer | null>(null)
  const [snippet, setSnippet] = useState<SnippetAnswer | null>(null)
  const [demo, setDemo] = useState<DemoAnswer | null>(null)
  // The example is built once per system, from its own values.
  useEffect(() => {
    let live = true
    setDemo(null)
    if (!index.length) return
    ask({ kind: 'demo' }).then((r) => {
      if (live && r.ok && r.kind === 'demo') setDemo(r.demo)
    })
    return () => {
      live = false
    }
  }, [ask, index])
  const isCode = looksLikeCode(query)
  const [all, setAll] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState<string | null>(null)
  const search = useRef<HTMLTextAreaElement>(null)
  const byId = useMemo(() => new Map(index.map((r) => [r.id, r])), [index])
  const at = useMemo(() => effective(d.modes, context), [d.modes, context])

  // A value in the search (`#0969da`, `background: #fff`) is answered by the worker; stale answers are dropped.
  const latest = useRef(0)
  useEffect(() => {
    const text = query.trim()
    if (!text) {
      setAnswer(null)
      setSnippet(null)
      return
    }
    const mine = ++latest.current
    const timer = setTimeout(async () => {
      if (looksLikeCode(text)) {
        const r = await ask({ kind: 'snippet', text: query })
        if (mine === latest.current && r.ok && r.kind === 'snippet') {
          setSnippet(r.snippet)
          setAnswer(null)
        }
        return
      }
      setSnippet(null)
      const r = await ask({
        kind: 'find',
        text,
        context,
        ...(property ? { property } : {}),
        ...(state ? { state } : {}),
      })
      if (mine === latest.current && r.ok && r.kind === 'find') setAnswer(r.answer)
    }, 160)
    return () => clearTimeout(timer)
  }, [ask, query, context, property, state])

  const types = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of index) m.set(r.type ?? 'untyped', (m.get(r.type ?? 'untyped') ?? 0) + 1)
    return [...m].sort((a, b) => b[1] - a[1]).map(([k]) => k)
  }, [index])

  // Sections of the list: the tokens for a value first, then names that match, or the catalog by type.
  const sections = useMemo(() => {
    const out: Array<{ key: string; title: string; rows: Shown[] }> = []
    const q = query.trim().toLowerCase()
    if (answer) {
      const rows: Shown[] = []
      // With an exact match, far values are noise: only the ones people could mistake for it stay.
      const exact = answer.result.groups.some((g) => g.exact)
      const near = (g: (typeof answer.result.groups)[number]) =>
        g.exact || !exact || g.distance < (answer.result.type === 'color' ? 5 : 2)
      for (const g of answer.result.groups.filter(near))
        for (const tok of g.tokens) {
          const row = byId.get(tok.id)
          if (!row) continue
          const note = g.exact
            ? l.exact
            : answer.result.type === 'color'
              ? `${deltaWords(g.distance, t)} · ΔE ${g.distance}`
              : l.pxOff(g.distance, UNIT[answer.result.type])
          rows.push({ row, note })
        }
      out.push({
        key: 'value',
        title: l.forValue(answer.result.value, answer.property),
        rows,
      })
    }
    const nq = loose(q.replace(/^var\(|\)$/g, ''))
    const match = (r: IndexRow) => !q || r.id.toLowerCase().includes(q) || loose(r.id).includes(nq)
    const typed = (r: IndexRow) => !type || (r.type ?? 'untyped') === type
    if (q && !answer)
      out.push({
        key: 'name',
        title: l.byName,
        rows: index.filter((r) => match(r) && typed(r)).map((row) => ({ row })),
      })
    else if (!q)
      for (const ty of types) {
        if (type && ty !== type) continue
        const rows = index.filter((r) => (r.type ?? 'untyped') === ty).map((row) => ({ row }))
        if (rows.length) out.push({ key: ty, title: l.types[ty] ?? ty, rows })
      }
    return out
  }, [answer, query, type, types, index, byId, l, t])

  const shown = sections.flatMap((s) => (all.has(s.key) ? s.rows : s.rows.slice(0, SECTION_LIMIT)))
  const current = (token && byId.get(token)) || shown[0]?.row

  const move = (delta: number) => {
    if (!shown.length) return
    const i = Math.max(
      0,
      shown.findIndex((s) => s.row.id === current?.id),
    )
    const next = shown[Math.min(shown.length - 1, Math.max(0, i + delta))]!
    onToken(next.row.id)
    document.getElementById(`token-${next.row.id}`)?.scrollIntoView({ block: 'nearest' })
  }

  // / and ⌘K jump to the search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)
      if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') || (!typing && e.key === '/')) {
        e.preventDefault()
        search.current?.focus()
        search.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const flash = (s: string) => {
    setStatus(s)
    setTimeout(() => setStatus((x) => (x === s ? null : x)), 1800)
  }
  const count = sections.reduce((n, s) => n + s.rows.length, 0)

  return (
    <div className="results">
      <header className="verdict">
        <p className="verdict__sources">
          <code>{summary.label}</code>
        </p>
        <h2 className="verdict__title verdict__title--none">{l.summary(d.tokens, d.files.length)}</h2>
        <p className="verdict__counts">
          {d.types.slice(0, 6).map(([ty, n]) => (
            <Count key={ty} text={`${l.types[ty] ?? ty} ${n}`} />
          ))}
        </p>
        <p className="verdict__reason">
          {l.layers(d.values, d.aliases)}.{' '}
          {d.modes.length ? d.modes.map((m) => l.modes(m.name, m.contexts)).join(' · ') : l.noModes}
          {d.errors ? ` · ${l.errors(d.errors)}` : ''}
        </p>
      </header>

      {/* biome-ignore lint/a11y/noStaticElementInteractions: arrow keys for the listbox and the search field inside */}
      <div
        className="window"
        onKeyDown={(e) => {
          const target = e.target as HTMLElement
          if (target.tagName === 'SELECT' || target.tagName === 'INPUT') return
          // In code pasted into the search, the arrows move the caret.
          if (target === search.current && query.includes('\n')) return
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            move(e.key === 'ArrowDown' ? 1 : -1)
          }
        }}
      >
        <div className="searchbar searchbar--lookup">
          <svg className="searchbar__icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="7" cy="7" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="m10.25 10.25 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <textarea
            ref={search}
            className="searchbar__field"
            rows={Math.min(12, query.split('\n').length)}
            value={query}
            placeholder={l.searchPlaceholder}
            aria-label={l.searchAria}
            spellCheck={false}
            autoCapitalize="off"
            onChange={(e) => {
              onQuery(e.target.value)
              onToken(undefined)
            }}
          />
          {query && (
            <button
              type="button"
              className="ghost searchbar__clear"
              aria-label={l.clearSearch}
              onClick={() => {
                onQuery('')
                search.current?.focus()
              }}
            >
              ×
            </button>
          )}
          {d.modes.map((m) => (
            <select
              key={m.name}
              className="accessory"
              aria-label={m.name}
              value={context[m.name] ?? ''}
              onChange={(e) => {
                const next = { ...context }
                if (e.target.value) next[m.name] = e.target.value
                else delete next[m.name]
                onContext(next)
              }}
            >
              <option value="">{l.every(m.name)}</option>
              {m.contexts.map((x) => (
                <option key={x} value={x}>
                  {m.name}: {x}
                </option>
              ))}
            </select>
          ))}
          {isCode ? null : answer ? (
            <>
              {!answer.fromQuery && (
                <select
                  className="accessory"
                  aria-label={l.propertyAria}
                  value={property}
                  onChange={(e) => setProperty(e.target.value)}
                >
                  {Object.entries(l.properties).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              )}
              <select
                className="accessory"
                aria-label={l.stateAria}
                value={state}
                onChange={(e) => setState(e.target.value)}
              >
                {Object.entries(l.states).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </>
          ) : (
            types.length > 1 && (
              <select
                className="accessory"
                aria-label={l.typeAria}
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="">{l.anyType}</option>
                {types.map((ty) => (
                  <option key={ty} value={ty}>
                    {l.types[ty] ?? ty}
                  </option>
                ))}
              </select>
            )
          )}
        </div>

        {!query.trim() && demo && (
          <DemoView
            demo={demo}
            onUse={() => {
              onQuery(demo.input)
              search.current?.focus()
            }}
          />
        )}
        {isCode ? (
          snippet && (
            <SnippetView
              snippet={snippet}
              onCopied={() => flash(l.snippet.copied)}
              onPick={(id) => {
                onQuery('')
                onToken(id)
              }}
            />
          )
        ) : count === 0 ? (
          <div className="empty">{answer ? l.noneOfType : l.noMatch}</div>
        ) : (
          <div className="split">
            <div className="list" role="listbox" aria-label={l.searchAria} tabIndex={0}>
              {sections.map((s) => (
                // biome-ignore lint/a11y/useSemanticElements: a group of options inside a listbox, not a form fieldset
                <div key={s.key} role="group" aria-label={s.title}>
                  <div className="list__section">
                    {s.title}
                    <span className="count">{s.rows.length}</span>
                  </div>
                  {(all.has(s.key) ? s.rows : s.rows.slice(0, SECTION_LIMIT)).map((x) => (
                    <TokenRowView
                      key={x.row.id}
                      row={x.row}
                      at={at}
                      note={x.note}
                      selected={x.row.id === current?.id}
                      onSelect={() => onToken(x.row.id)}
                    />
                  ))}
                  {!all.has(s.key) && s.rows.length > SECTION_LIMIT && (
                    <button
                      type="button"
                      className="list__more"
                      onClick={() => setAll(new Set([...all, s.key]))}
                    >
                      {l.showAll(s.rows.length)}
                    </button>
                  )}
                </div>
              ))}
            </div>
            <aside className="detail" aria-live="polite">
              {current && (
                <TokenCardView
                  id={current.id}
                  row={current}
                  ask={ask}
                  graph={loaded.graph}
                  at={at}
                  defaults={effective(d.modes, {})}
                  source={loaded.source}
                  onPick={(id) => byId.has(id) && onToken(id)}
                  onCopied={() => flash(l.card.copied)}
                />
              )}
            </aside>
          </div>
        )}

        <footer className="actionbar">
          <span className="actionbar__status">
            {status ??
              (isCode
                ? snippet
                  ? l.snippet.replaced(snippet.edits.filter((e) => e.applied).length)
                  : ''
                : l.status(count, loaded.ms))}
          </span>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              search.current?.focus()
              search.current?.select()
            }}
          >
            {l.find} <Keys keys={[MOD, 'K']} />
          </button>
          <span className="actionbar__sep" />
          <button
            type="button"
            className="ghost"
            disabled={!share}
            title={share ? undefined : l.shareTooBig}
            onClick={async () => {
              if (!share) return
              await share()
              flash(l.linkCopied)
            }}
          >
            {l.copyLink}
          </button>
        </footer>
      </div>
    </div>
  )
}

function DemoView({ demo, onUse }: { demo: DemoAnswer; onUse: () => void }) {
  const l = useT().lookup.demo
  return (
    <section className="lookup__demo" aria-label={l.title}>
      <div className="lookup__demo-head">
        <div>
          <h3>{l.title}</h3>
          <p className="muted">{l.lead}</p>
        </div>
        <button type="button" className="ghost ghost--strong" onClick={onUse}>
          {l.use}
        </button>
      </div>
      <div className="lookup__demo-pair">
        <figure>
          <figcaption>{l.before}</figcaption>
          <pre className="lookup__code">
            <code>{demo.input}</code>
          </pre>
        </figure>
        <figure>
          <figcaption>{l.after}</figcaption>
          <pre className="lookup__code">
            <code>{demo.output}</code>
          </pre>
        </figure>
      </div>
    </section>
  )
}

function SnippetView({
  snippet,
  onCopied,
  onPick,
}: {
  snippet: SnippetAnswer
  onCopied: () => void
  onPick: (id: string) => void
}) {
  const t = useT()
  const l = t.lookup.snippet
  const suggested = snippet.edits.filter((e) => !e.exact)
  if (!snippet.edits.length) return <div className="empty">{l.clean}</div>
  return (
    <div className="lookup__snippet">
      <div className="list__section">
        {l.title}
        <button
          type="button"
          className="ghost lookup__snippet-copy"
          onClick={async () => {
            await navigator.clipboard.writeText(snippet.output)
            onCopied()
          }}
        >
          {l.copy}
        </button>
      </div>
      <pre className="lookup__code">
        <code>{snippet.output}</code>
      </pre>
      <ul className="lookup__edits">
        {[...snippet.edits]
          .sort((a, b) => a.line - b.line)
          .map((e) => (
            <li key={`${e.line}${e.from}${e.token}`} className="row">
              <span className={`icon icon--${e.applied ? 'success' : 'warning'}`} aria-hidden="true">
                {e.applied ? '✓' : '≈'}
              </span>
              <span className="row__title">
                <span className="muted">{e.from} → </span>
                {e.to}
              </span>
              <span className="row__acc">
                {e.exact && !e.applied && <span className="acc-text">{l.manual}</span>}
                {!e.exact && (
                  <span className="acc-text">
                    {l.closest(
                      e.deltaE !== undefined
                        ? `${deltaWords(e.deltaE, t)} · ΔE ${e.deltaE}`
                        : t.lookup.pxOff(e.distance ?? 0, 'px'),
                    )}
                  </span>
                )}
                <button type="button" className="ghost" onClick={() => onPick(e.token)}>
                  {e.token}
                </button>
                <span className="acc-text">{l.line(e.line)}</span>
              </span>
            </li>
          ))}
      </ul>
      {suggested.length > 0 && <p className="finding__hint">{l.suggested}</p>}
    </div>
  )
}

function TokenRowView({
  row,
  at,
  note,
  selected,
  onSelect,
}: {
  row: IndexRow
  at: Record<string, string>
  note?: string | undefined
  selected: boolean
  onSelect: () => void
}) {
  const v = valueIn(row.values, at)
  return (
    <div
      role="option"
      tabIndex={-1}
      aria-selected={selected}
      id={`token-${row.id}`}
      className={`row${selected ? ' is-selected' : ''}`}
      onClick={onSelect}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
    >
      {v?.swatch ? (
        <span className="icon icon--swatch" aria-hidden="true">
          <span style={{ background: v.swatch }} />
        </span>
      ) : (
        <span className="icon icon--neutral" aria-hidden="true">
          {row.alias ? '↪' : '·'}
        </span>
      )}
      <span className={`row__title${row.deprecated ? ' is-deprecated' : ''}`}>{row.id}</span>
      <span className="row__subtitle">{v?.text}</span>
      {note && (
        <span className="row__acc">
          <span className="acc-text">{note}</span>
        </span>
      )}
    </div>
  )
}

function TokenCardView({
  id,
  row,
  ask,
  graph,
  at,
  defaults,
  source,
  onPick,
  onCopied,
}: {
  id: string
  row: IndexRow
  ask: ReturnType<typeof useLookup>
  graph: TokenGraph
  at: Record<string, string>
  defaults: Record<string, string>
  source: SideInput
  onPick: (id: string) => void
  onCopied: () => void
}) {
  const t = useT()
  const lang = useLang()
  const c = t.lookup.card
  const [card, setCard] = useState<TokenCard | null>(null)
  useEffect(() => {
    let live = true
    ask({ kind: 'token', token: id }).then((r) => {
      if (live && r.ok && r.kind === 'token') setCard(r.card)
    })
    return () => {
      live = false
    }
  }, [ask, id])
  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    onCopied()
  }
  const tok = card?.token.id === id ? card : null
  const deprecated = tok?.token.deprecated
  const value = valueIn(row.values, at)
  // Values in the default context first, then the other themes in the order they are declared.
  const isDefault = (when: When) => Object.entries(when ?? {}).every(([k, x]) => defaults[k] === x)
  const values = tok
    ? [...tok.values].sort((a, b) => Number(isDefault(b.when)) - Number(isDefault(a.when)))
    : []

  return (
    <div className="detail__body">
      <h3 className="detail__title">{id}</h3>
      {tok?.token.description && <p className="detail__lead">{tok.token.description}</p>}
      {deprecated && (
        <p className="verdict__note verdict__note--warning">{c.deprecated(deprecated.replacement)}</p>
      )}
      {value?.swatch && (
        <div className="previews">
          <figure className="preview">
            <div className="preview__swatch" style={{ background: value.swatch }} />
            <figcaption>
              <code>{value.text}</code>
            </figcaption>
          </figure>
        </div>
      )}
      <div className="lookup__copy">
        <button type="button" className="ghost" onClick={() => copy(`var(${row.css})`)}>
          {c.copyCss}
        </button>
        <button type="button" className="ghost" onClick={() => copy(`{${row.id}}`)}>
          {c.copyRef}
        </button>
      </div>
      <dl className="meta">
        <div>
          <dt>{c.inCss}</dt>
          <dd>
            <code>var({row.css})</code>
          </dd>
        </div>
        {tok && (
          <div>
            <dt>{c.values}</dt>
            <dd>
              <ul className="lookup__values">
                {values.map((v) => (
                  <li key={JSON.stringify(v.when)}>
                    {v.swatch && <span className="lookup__dot" style={{ background: v.swatch }} />}
                    <span className="muted">
                      {Object.entries(v.when ?? {})
                        .map(([k, x]) => `${k}: ${x}`)
                        .join(', ') || c.everywhere}
                    </span>{' '}
                    <code>{v.text}</code>
                    {v.via.length > 0 && (
                      <span className="muted">
                        {' '}
                        {c.from}{' '}
                        {v.via.map((x, i) => (
                          <span key={x}>
                            {i > 0 && ' ← '}
                            <button
                              type="button"
                              className="inline-link lookup__ref"
                              onClick={() => onPick(x)}
                            >
                              {x}
                            </button>
                          </span>
                        ))}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        {tok && (
          <div>
            <dt>{c.file}</dt>
            <dd>
              <code>{tok.token.origin.file}</code>
            </dd>
          </div>
        )}
      </dl>
      {tok && (
        <section className="affected">
          <h4>{tok.users.length ? c.usedBy(tok.users.length, tok.allUsers) : c.unused}</h4>
          {graph.refs.some(
            ([from, to, when]) =>
              (from === id || to === id) &&
              Object.entries(when ?? {}).every(([k, x]) => at[k] === undefined || at[k] === x),
          ) && (
            <>
              <p className="graph-hint">{c.graphHint}</p>
              <GraphView id={id} graph={graph} context={at} changed={NO_CHANGES} onPick={onPick} />
            </>
          )}
        </section>
      )}
      {tok && tok.sameValue.length > 0 && (
        <section className="affected">
          <h4>{c.sameValue}</h4>
          <ul>
            {tok.sameValue.slice(0, 20).map((x) => (
              <li key={x}>
                <button type="button" className="inline-link lookup__ref" onClick={() => onPick(x)}>
                  {x}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {source.kind === 'npm' && (
        <p>
          <a
            className="inline-link"
            href={`${localePath(lang, '/tools/diff')}?pkg=${source.pkg}&from=&to=${source.version}`}
          >
            {c.compare}
          </a>
        </p>
      )}
    </div>
  )
}
