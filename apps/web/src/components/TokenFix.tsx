import type { Finding, When } from '@dsgraph/core'
import { groupFindings } from '@dsgraph/report'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Lang } from '../i18n'
import { localePath } from '../i18n'
import { LangProvider, useLang, useT } from '../i18n/react'
import { looksLikeCode } from '../lib/code-text'
import { deltaWords } from '../lib/explain'
import { takeHandover } from '../lib/handover'
import { LOOKUP_EXAMPLE } from '../lib/lookup-example'
import type {
  DemoAnswer,
  IndexRow,
  LookupRequest,
  LookupResponse,
  LookupSummary,
  Overview,
  OverviewToken,
  ProjectAnswer,
  SnippetAnswer,
  TokenCard,
  ValueAnswer,
} from '../lib/lookup-types'
import { readLookupUrl, writeLookupUrl } from '../lib/lookup-url'
import type { CodeInput, SideInput, TokenGraph } from '../lib/types'
import { MAX_FRAGMENT, packFiles, unpackFiles } from '../lib/url'
import { CodeField } from './CodeField'
import { GraphView } from './GraphView'
import { Keys, MOD } from './Results'
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

export default function TokenFix({ lang = 'en' }: { lang?: Lang }) {
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
  /** The app's code handed over from Token Diff: the Code tab opens with it and checks it. */
  const [handedCode, setHandedCode] = useState<CodeInput | undefined>()
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
    // From Token Diff: the new version and the app's code, left in this tab's storage.
    const handed = url.searchParams.has('handover') ? takeHandover() : undefined
    if (handed) {
      setSource(handed.source)
      setInclude(handed.include)
      if (handed.code) setHandedCode(handed.code)
      autoOpen.current = true
      setTick((x) => x + 1)
      return
    }
    if (url.searchParams.has('example')) {
      setSource({ kind: 'files', files: LOOKUP_EXAMPLE })
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
    const s: SideInput = { kind: 'files', files: LOOKUP_EXAMPLE }
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
          findings={findings}
          ask={ask}
          context={context}
          onContext={setContext}
          query={query}
          onQuery={setQuery}
          token={token}
          onToken={setToken}
          share={canShare ? () => navigator.clipboard.writeText(location.href) : undefined}
          handedCode={handedCode}
        />
      )}
    </div>
  )
}

interface BrowserProps {
  loaded: Loaded
  /** Checks on the system, once they have run. */
  findings: Finding[] | null
  ask: ReturnType<typeof useLookup>
  context: Record<string, string>
  onContext: (c: Record<string, string>) => void
  query: string
  onQuery: (q: string) => void
  token: string | undefined
  onToken: (id: string | undefined) => void
  share: (() => Promise<void>) | undefined
  /** Code handed over from Token Diff, checked as soon as the system is open. */
  handedCode?: CodeInput | undefined
}

/** One shown row: a token, and for a value search, how close it is. */
interface Shown {
  row: IndexRow
  note?: string
}

function Browser({
  loaded,
  findings,
  ask,
  context,
  onContext,
  query,
  onQuery,
  token,
  onToken,
  share,
  handedCode,
}: BrowserProps) {
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
  const [overview, setOverview] = useState<Overview | null>(null)
  /** Every token as a list; otherwise an empty search shows the overview. A shared token link opens the list. */
  const [view, setView] = useState<'overview' | 'all' | 'code'>(
    handedCode ? 'code' : token ? 'all' : 'overview',
  )
  const catalog = view === 'all'
  const setCatalog = (on: boolean) => setView(on ? 'all' : 'overview')
  const [project, setProject] = useState<CodeInput>(handedCode ?? { kind: 'files', files: [] })
  const [githubToken, setGithubToken] = useState('')
  const openToken = (id: string) => {
    setCatalog(true)
    onToken(id)
  }
  // The example is built once per system, from its own values.
  useEffect(() => {
    let live = true
    setDemo(null)
    if (!index.length) return
    setOverview(null)
    ask({ kind: 'overview' }).then((r) => {
      if (live && r.ok && r.kind === 'overview') setOverview(r.overview)
    })
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
      <p className="lookup__head">
        <code>{summary.label}</code>
        <span className="muted">
          {' · '}
          {l.summary(d.tokens, d.files.length)}
          {' · '}
          {d.modes.length ? d.modes.map((m) => l.modes(m.name, m.contexts)).join(' · ') : l.noModes}
          {d.errors ? ` · ${l.errors(d.errors)}` : ''}
        </span>
      </p>

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
                onChange={(e) => {
                  setType(e.target.value)
                  if (e.target.value) setCatalog(true)
                }}
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

        {!query.trim() && (
          <div className="lookup__tabs">
            <div className="seg" role="tablist" aria-label={l.overview.tabsAria}>
              <button
                type="button"
                role="tab"
                aria-selected={view === 'overview'}
                className={view === 'overview' ? 'is-on' : ''}
                onClick={() => {
                  setCatalog(false)
                  setType('')
                }}
              >
                {l.overview.tab}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={catalog}
                className={catalog ? 'is-on' : ''}
                onClick={() => setCatalog(true)}
              >
                {l.overview.all(index.length)}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === 'code'}
                className={view === 'code' ? 'is-on' : ''}
                onClick={() => setView('code')}
              >
                {l.code.tab}
              </button>
            </div>
          </div>
        )}
        {!query.trim() && view === 'code' ? (
          <ProjectPanel
            ask={ask}
            value={project}
            onChange={setProject}
            githubToken={githubToken}
            onGithubToken={setGithubToken}
            onPick={openToken}
            onCopied={(text) => flash(text)}
            auto={!!handedCode}
          />
        ) : !query.trim() && !catalog ? (
          <div className="lookup__overview">
            {overview ? <OverviewView overview={overview} findings={findings} onPick={openToken} /> : null}
            {demo && (
              <DemoView
                demo={demo}
                onUse={() => {
                  onQuery(demo.input)
                  search.current?.focus()
                }}
              />
            )}
          </div>
        ) : isCode ? (
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
          <>
            {answer?.suggestion && (
              <div className="lookup__block lookup__block--tight">
                <Proposal suggestion={answer.suggestion} value={answer.result.value} onCopied={flash} />
              </div>
            )}
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
          </>
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

/** A task for a coding agent: every replacement with its places, the values without a token, the variables to fix. */
function agentTask(p: ProjectAnswer, l: ReturnType<typeof useT>['lookup']['code']): string {
  const at = (sites: ProjectAnswer['replace'][number]['sites']) =>
    sites.map((x) => `${x.file}:${x.line}`).join(', ')
  const out = [l.task.head, '']
  if (p.replace.length) {
    out.push(l.task.replace)
    for (const g of p.replace)
      out.push(`- \`${g.value}\` → \`${g.replacement}\` (${g.token}): ${at(g.sites)}`)
    out.push('')
  }
  if (p.missing.length) {
    out.push(l.task.missing)
    for (const g of p.missing) out.push(`- \`${g.value}\` → \`${g.replacement}\`?: ${at(g.sites)}`)
    out.push('')
  }
  if (p.variables.length) {
    out.push(l.task.variables)
    for (const v of p.variables) {
      const to = v.suggestion ?? v.replacement
      out.push(`- \`${v.name}\`${to ? ` → \`${to}\`` : ''}: ${at(v.sites)}`)
    }
  }
  return out.join('\n').trim()
}

function Sites({ sites, total }: { sites: ProjectAnswer['replace'][number]['sites']; total: number }) {
  const l = useT().lookup.code
  return (
    <ul className="lookup__sites">
      {sites.map((x) => (
        <li key={`${x.file}:${x.line}:${x.text}`}>
          <code className="muted">
            {x.file}:{x.line}
          </code>{' '}
          <code>{x.text}</code>
        </li>
      ))}
      {total > sites.length && <li className="muted">{l.more(total - sites.length)}</li>}
    </ul>
  )
}

/** The Code tab: the project that uses the system, checked against it. */
function ProjectPanel({
  ask,
  value,
  onChange,
  githubToken,
  onGithubToken,
  onPick,
  onCopied,
  auto = false,
}: {
  ask: ReturnType<typeof useLookup>
  value: CodeInput
  onChange: (v: CodeInput) => void
  githubToken: string
  onGithubToken: (t: string) => void
  onPick: (id: string) => void
  onCopied: (status: string) => void
  /** Check at once: the code came with the system. */
  auto?: boolean
}) {
  const t = useT()
  const l = t.lookup.code
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [p, setP] = useState<ProjectAnswer | null>(null)
  const ready = value.kind === 'files' ? value.files.length > 0 : !!value.repo
  const run = async () => {
    if (!ready) return
    setRunning(true)
    setError(null)
    const input: CodeInput = value.kind === 'github' && !value.ref ? { ...value, ref: 'HEAD' } : value
    const r = await ask({ kind: 'project', input, ...(githubToken ? { githubToken } : {}) })
    setRunning(false)
    if (!r.ok)
      setError(
        r.hint === 'private'
          ? `${r.error}. ${t.inputs.privateHint}`
          : r.hint === 'reload'
            ? t.inputs.reloadHint
            : r.error,
      )
    else if (r.kind === 'project') setP(r.project)
  }
  const started = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once, for code handed over with the system
  useEffect(() => {
    if (auto && !started.current) {
      started.current = true
      run()
    }
  }, [auto])
  const how = (g: ProjectAnswer['missing'][number]) =>
    g.deltaE !== undefined
      ? `${deltaWords(g.deltaE, t)} · ΔE ${g.deltaE}`
      : t.lookup.pxOff(g.distance ?? 0, 'px')
  const share = p?.coverage.share
  return (
    <div className="lookup__overview">
      <section className="lookup__block">
        <p className="muted">{l.lead}</p>
        <div className="lookup__project">
          <CodeField
            value={value}
            onChange={onChange}
            error={error ?? undefined}
            githubToken={githubToken}
            onGithubToken={onGithubToken}
          />
          <div className="lookup__project-actions">
            <span className="muted small">{running ? l.progress : p ? l.read(p.files) : ''}</span>
            <button type="button" className="ghost ghost--strong" disabled={!ready || running} onClick={run}>
              {l.check}
            </button>
          </div>
        </div>
      </section>
      {p && (
        <>
          <section className="lookup__block">
            <div className="lookup__meter">
              <span className="lookup__meter-label">{l.onTokens}</span>
              <strong>{share === null || share === undefined ? '—' : `${Math.round(share * 100)}%`}</strong>
              <span className="lookup__bar">
                <span style={{ width: `${Math.round((share ?? 0) * 100)}%` }} />
              </span>
            </div>
            <p className="muted">
              {l.colors(p.coverage.color.fromTokens, p.coverage.color.byHand)} ·{' '}
              {l.sizes(p.coverage.size.fromTokens, p.coverage.size.byHand)}
            </p>
            {(p.replace.length > 0 || p.missing.length > 0 || p.variables.length > 0) && (
              <button
                type="button"
                className="ghost ghost--strong"
                onClick={async () => {
                  await navigator.clipboard.writeText(agentTask(p, l))
                  onCopied(l.agentCopied)
                }}
              >
                {l.agent}
              </button>
            )}
          </section>
          {p.replace.length === 0 && p.missing.length === 0 && p.variables.length === 0 && (
            <div className="empty">{l.clean}</div>
          )}
          {p.replace.length > 0 && (
            <section className="lookup__block">
              <h3>{l.replaceTitle}</h3>
              <p className="muted">{l.replaceLead}</p>
              <ul className="lookup__groups">
                {p.replace.map((g) => (
                  <li key={`${g.value}${g.token}`}>
                    <details>
                      <summary className="row">
                        {g.swatch ? (
                          <span className="icon icon--swatch" aria-hidden="true">
                            <span style={{ background: g.swatch }} />
                          </span>
                        ) : (
                          <span className="icon icon--neutral" aria-hidden="true">
                            ↔
                          </span>
                        )}
                        <span className="row__title">
                          <span className="muted">{g.value} → </span>
                          {g.replacement}
                        </span>
                        <span className="row__acc">
                          <span className="acc-text">{l.places(g.count, g.files)}</span>
                        </span>
                      </summary>
                      <p className="lookup__group-note">
                        <button
                          type="button"
                          className="inline-link lookup__ref"
                          onClick={() => onPick(g.token)}
                        >
                          {g.token}
                        </button>
                      </p>
                      <Sites sites={g.sites} total={g.count} />
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {p.missing.length > 0 && (
            <section className="lookup__block">
              <h3>{l.missingTitle}</h3>
              <p className="muted">{l.missingLead}</p>
              <ul className="lookup__groups">
                {p.missing.map((g) => (
                  <li key={g.value}>
                    <details>
                      <summary className="row">
                        <span className="icon icon--warning" aria-hidden="true">
                          ≈
                        </span>
                        <span className="row__title">{g.value}</span>
                        <span className="row__acc">
                          <span className="acc-text">{l.places(g.count, g.files)}</span>
                        </span>
                      </summary>
                      <p className="lookup__group-note">
                        {l.closest(how(g))}{' '}
                        <button
                          type="button"
                          className="inline-link lookup__ref"
                          onClick={() => onPick(g.token)}
                        >
                          {g.token}
                        </button>
                        {!g.suggestion && g.group && g.count > 1 ? (
                          <span className="muted"> · {l.belongs(g.group)}</span>
                        ) : null}
                      </p>
                      {g.suggestion && (
                        <Proposal
                          suggestion={g.suggestion}
                          value={g.value}
                          places={l.places(g.count, g.files)}
                          onCopied={onCopied}
                        />
                      )}
                      <Sites sites={g.sites} total={g.count} />
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {p.variables.length > 0 && (
            <section className="lookup__block">
              <h3>{l.variablesTitle}</h3>
              <ul className="lookup__groups">
                {p.variables.map((v) => (
                  <li key={v.kind + v.name}>
                    <details>
                      <summary className="row">
                        <span
                          className={`icon icon--${v.kind === 'unknown' ? 'danger' : 'warning'}`}
                          aria-hidden="true"
                        >
                          {v.kind === 'unknown' ? '?' : '!'}
                        </span>
                        <span className="row__title">{v.name}</span>
                        <span className="row__subtitle">
                          {v.kind === 'unknown'
                            ? v.suggestion
                              ? l.typo(v.suggestion)
                              : l.unknown
                            : l.deprecated(v.replacement)}
                        </span>
                        <span className="row__acc">
                          <span className="acc-text">{v.count}</span>
                        </span>
                      </summary>
                      <Sites sites={v.sites} total={v.count} />
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}

/** Errors and warnings worth fixing, and hand-written values among the modes. */
const IMPROVE = (f: Finding) => f.severity !== 'info' || f.rule === 'context/literal-value'

/** What to fix in the system: the checks, grouped, each with its tokens to open. */
function ImproveView({ findings, onPick }: { findings: Finding[]; onPick: (id: string) => void }) {
  const t = useT()
  const l = t.lookup.overview
  const groups = useMemo(() => groupFindings(findings.filter(IMPROVE)), [findings])
  if (!groups.length) return null
  return (
    <section className="lookup__block">
      <h3>{l.improveTitle}</h3>
      <p className="muted">{l.improveLead(groups.reduce((n, g) => n + g.findings.length, 0))}</p>
      <ul className="lookup__improve">
        {groups.map((g) => {
          const ids = [...new Set(g.findings.flatMap((f) => f.nodes.slice(0, 1)))]
          return (
            <li key={`${g.severity}${g.rule}${g.pattern}`}>
              <span
                className={`icon icon--${g.severity === 'error' ? 'danger' : g.severity}`}
                aria-hidden="true"
              >
                {g.severity === 'error' ? '×' : g.severity === 'warning' ? '!' : 'i'}
              </span>
              <div>
                <p className="lookup__improve-title">
                  {t.checks.titles[g.rule] ?? (g.findings.length === 1 ? g.findings[0]!.message : g.pattern)}
                  {g.findings.length > 1 && <span className="count">{g.findings.length}</span>}
                </p>
                {t.checks.help[g.rule] && <p className="muted small">{t.checks.help[g.rule]}</p>}
                {ids.length > 0 && (
                  <div className="lookup__chips">
                    {ids.slice(0, 8).map((id) => (
                      <button key={id} type="button" className="lookup__chip" onClick={() => onPick(id)}>
                        <code>{id}</code>
                      </button>
                    ))}
                    {ids.length > 8 && <span className="muted small">{l.more(ids.length - 8)}</span>}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** A name for a new token from the system's own scale, with the proposal to copy for its team. */
function Proposal({
  suggestion: sg,
  value,
  places,
  onCopied,
}: {
  suggestion: { name: string; between: string[]; scale: string }
  value: string
  places?: string
  onCopied: (status: string) => void
}) {
  const l = useT().lookup.code
  const [a = '', b = ''] = sg.between
  return (
    <div className="lookup__proposal">
      <p>
        {l.suggest} <code>{sg.name}</code> <span className="muted">{l.suggestBetween(a, b)}</span>
      </p>
      <p className="muted small">{l.suggestNote}</p>
      <button
        type="button"
        className="ghost"
        onClick={async () => {
          await navigator.clipboard.writeText(l.proposal(sg.name, value, sg.scale, a, b, places))
          onCopied(l.proposalCopied)
        }}
      >
        {l.copyProposal}
      </button>
    </div>
  )
}

function TokenChip({ token, onPick }: { token: OverviewToken; onPick: (id: string) => void }) {
  return (
    <button type="button" className="lookup__chip" onClick={() => onPick(token.id)} title={token.text}>
      {token.swatch && <span className="lookup__dot" style={{ background: token.swatch }} />}
      <code>{token.id}</code>
    </button>
  )
}

function UseCard({
  title,
  total,
  tokens,
  onPick,
}: {
  title: string
  total: number
  tokens: OverviewToken[]
  onPick: (id: string) => void
}) {
  const l = useT().lookup.overview
  return (
    <div className="lookup__use">
      <h4>
        {title} <span className="count">{total}</span>
      </h4>
      <div className="lookup__chips">
        {tokens.map((x) => (
          <TokenChip key={x.id} token={x} onPick={onPick} />
        ))}
        {total > tokens.length && <span className="muted small">{l.more(total - tokens.length)}</span>}
      </div>
    </div>
  )
}

/**
 * The rule of a scale, shown on its own steps: a value halfway between two neighbours with room
 * between them (`14px` between 12 and 16) is the one people write by hand.
 */
function betweenNote(steps: number[], l: ReturnType<typeof useT>['lookup']['overview']): string {
  // The pair nearest the sizes people type most (12–16px) makes the clearest example.
  const pairs = steps
    .slice(1)
    .map((b, i) => [steps[i]!, b] as const)
    .filter(([a, b]) => b - a >= 4 && Number.isInteger(a) && Number.isInteger(b))
    .sort((x, y) => Math.abs(x[0] - 12) - Math.abs(y[0] - 12))
  const pair = pairs[0]
  return pair ? l.between(Math.round((pair[0] + pair[1]) / 2), pair[0], pair[1]) : l.betweenPlain
}

/** How the open system is meant to be used: where the same value means different tokens, and what is for what. */
function OverviewView({
  overview: o,
  findings,
  onPick,
}: {
  overview: Overview
  findings: Finding[] | null
  onPick: (id: string) => void
}) {
  const t = useT()
  const l = t.lookup.overview
  const states = t.lookup.states as Record<string, string>
  const scales = [
    { key: 'space', title: l.space, rows: o.space },
    { key: 'radius', title: l.radius, rows: o.radius },
  ].filter((x) => x.rows.length > 1)
  return (
    <>
      {o.traps.length > 0 && (
        <section className="lookup__block">
          <h3>{l.trapsTitle}</h3>
          <p className="muted">{l.trapsLead(o.trapCount)}</p>
          <ul className="lookup__traps">
            {o.traps.map((trap) => (
              <li key={trap.value}>
                <span className="lookup__trap-value">
                  {trap.swatch && <span className="lookup__swatch" style={{ background: trap.swatch }} />}
                  <code>{trap.value}</code>
                  <span className="muted small">{l.held(trap.count)}</span>
                </span>
                <span className="lookup__picks">
                  {trap.picks.map((p) => (
                    <span key={p.token} className="lookup__pick">
                      <span className="muted">
                        {p.state ? (l.forState[p.state] ?? p.state) : l.for[p.use]}
                      </span>
                      <button
                        type="button"
                        className="inline-link lookup__ref"
                        onClick={() => onPick(p.token)}
                      >
                        {p.token}
                      </button>
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {findings && <ImproveView findings={findings} onPick={onPick} />}
      {(o.uses.length > 0 || o.states.length > 0) && (
        <section className="lookup__block">
          <h3>{l.usesTitle}</h3>
          <p className="muted">{l.usesLead}</p>
          <div className="lookup__uses">
            {o.uses.map((u) => (
              <UseCard key={u.use} title={l.uses[u.use]} total={u.total} tokens={u.tokens} onPick={onPick} />
            ))}
            {o.states.map((u) => (
              <UseCard
                key={u.state}
                title={states[u.state] ?? u.state}
                total={u.total}
                tokens={u.tokens}
                onPick={onPick}
              />
            ))}
          </div>
        </section>
      )}
      {scales.length > 0 && (
        <section className="lookup__block">
          <p className="muted">
            {betweenNote(
              scales[0]!.rows.map((x) => x.px),
              l,
            )}
          </p>
          <div className="lookup__uses">
            {scales.map((sc) => {
              const max = Math.max(...sc.rows.map((x) => x.px))
              return (
                <div key={sc.key} className="lookup__use">
                  <h4>{sc.title}</h4>
                  <ul className="lookup__scale">
                    {sc.rows.map((x) => (
                      <li key={x.id}>
                        <button type="button" className="lookup__scale-row" onClick={() => onPick(x.id)}>
                          <code>{x.id}</code>
                          <span className="lookup__bar">
                            <span style={{ width: `${Math.max(3, (x.px / max) * 100)}%` }} />
                          </span>
                          <span className="muted">{x.text}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </>
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
