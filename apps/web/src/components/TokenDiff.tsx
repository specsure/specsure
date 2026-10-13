import { useCallback, useEffect, useRef, useState } from 'react'
import type { Lang } from '../i18n'
import { LangProvider, useT } from '../i18n/react'
import { EXAMPLE } from '../lib/example'
import type { Progress, RunRequest, RunResponse, SideInput, Stage } from '../lib/types'
import { MAX_FRAGMENT, packFiles, readUrl, unpackFiles, writeUrl } from '../lib/url'
import { Keys, MOD, type Result, Results } from './Results'
import { SidePicker } from './SidePicker'

const emptyNpm: SideInput = { kind: 'npm', pkg: '', version: '' }

const ready = (s: SideInput): boolean =>
  s.kind === 'npm' ? !!s.pkg && !!s.version : s.kind === 'github' ? !!s.repo : s.files.length > 0

/** The GitHub ref defaults to the default branch. */
const normalize = (s: SideInput): SideInput => (s.kind === 'github' && !s.ref ? { ...s, ref: 'HEAD' } : s)

export default function TokenDiff({ lang = 'en' }: { lang?: Lang }) {
  return (
    <LangProvider lang={lang}>
      <App />
    </LangProvider>
  )
}

function App() {
  const t = useT()
  const [base, setBase] = useState<SideInput>(emptyNpm)
  const [head, setHead] = useState<SideInput>(emptyNpm)
  const [include, setInclude] = useState('')
  const [githubToken, setGithubToken] = useState('')
  const [context, setContext] = useState<Record<string, string>>({})
  const [running, setRunning] = useState<Stage | 'start' | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<{ side?: 'base' | 'head'; message: string } | null>(null)
  const [fragment, setFragment] = useState<string | null>(null)
  /** The inputs of the comparison on screen; the address is built from these, not from the fields. */
  const [ran, setRan] = useState<RunRequest | null>(null)
  const worker = useRef<Worker | null>(null)
  const runId = useRef(0)
  const pending = useRef<RunRequest | null>(null)
  const autoRun = useRef(false)

  // Worker: scanning and diffing thousands of tokens must not freeze the page.
  useEffect(() => {
    const w = new Worker(new URL('../lib/worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<RunResponse | Progress>) => {
      const r = e.data
      if (r.id !== runId.current) return
      if ('progress' in r) return setRunning(r.progress)
      setRunning(null)
      if (r.ok) {
        setError(null)
        setRan(pending.current)
        setResult({
          changeset: r.changeset,
          types: new Map(r.types),
          base: r.base,
          head: r.head,
          findings: r.findings,
          graph: r.graph,
          ms: r.ms,
        })
      } else {
        setResult(null)
        const message = r.hint === 'private' ? `${r.error}. ${t.inputs.privateHint}` : r.error
        setError(r.side ? { side: r.side, message } : { message })
      }
    }
    w.onerror = (e) => {
      setRunning(null)
      setError({ message: e.message || t.inputs.failed })
    }
    worker.current = w
    return () => w.terminate()
  }, [t])

  // State from the address: `?pkg=…&from=…&to=…`, `?base=…&head=…`, files in `#d=…`, `?example`.
  useEffect(() => {
    const url = new URL(location.href)
    const s = readUrl(url)
    setInclude(s.include)
    setContext(s.context)
    if (s.base) setBase(s.base)
    if (s.head) setHead(s.head)
    // `?example`: the built-in example, as linked from the home page.
    if (url.searchParams.has('example')) {
      setBase({ kind: 'files', files: EXAMPLE.base })
      setHead({ kind: 'files', files: EXAMPLE.head })
      autoRun.current = true
      setTick((t) => t + 1)
      return
    }
    unpackFiles(url.hash)
      .then((packed) => {
        if (packed?.base) setBase({ kind: 'files', files: packed.base })
        if (packed?.head) setHead({ kind: 'files', files: packed.head })
        if ((s.base || packed?.base) && (s.head || packed?.head)) autoRun.current = true
      })
      .catch(() => {
        if (s.base && s.head) autoRun.current = true
      })
      .finally(() => setTick((t) => t + 1))
  }, [])
  const [tick, setTick] = useState(0)

  const run = useCallback(
    (b = base, h = head) => {
      if (!worker.current || !ready(b) || !ready(h)) return
      const req: RunRequest = { id: ++runId.current, base: normalize(b), head: normalize(h), include }
      if (githubToken) req.githubToken = githubToken
      pending.current = req
      setRunning('start')
      setError(null)
      worker.current.postMessage(req)
    },
    [base, head, include, githubToken],
  )

  // ⌘↵ compares from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        run()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [run])

  useEffect(() => {
    if (tick && autoRun.current) {
      autoRun.current = false
      run()
    }
  }, [tick, run])

  // Keep the address in sync with the last comparison, so the page can be shared or reloaded.
  useEffect(() => {
    if (!ran) return
    let live = true
    const { base: b, head: h, include: inc } = ran
    const files: { base?: typeof EXAMPLE.base; head?: typeof EXAMPLE.head } = {}
    if (b.kind === 'files') files.base = b.files
    if (h.kind === 'files') files.head = h.files
    const write = (frag: string) => {
      if (!live) return
      const state: Parameters<typeof writeUrl>[1] = { include: inc, context }
      if (b.kind !== 'files') state.base = b
      if (h.kind !== 'files') state.head = h
      history.replaceState(null, '', writeUrl(location.pathname, state, frag))
      setFragment(frag)
    }
    if (files.base || files.head)
      packFiles(files).then(
        (f) => write(f.length <= MAX_FRAGMENT ? f : ''),
        () => write(''),
      )
    else write('')
    return () => {
      live = false
    }
  }, [ran, context])

  const hasFiles = ran?.base.kind === 'files' || ran?.head.kind === 'files'
  const canShare = !!result && (!hasFiles || !!fragment)

  const onBase = (next: SideInput) => {
    // Comparing two versions of one package is the common case: mirror the package name.
    if (
      next.kind === 'npm' &&
      head.kind === 'npm' &&
      (head.pkg === '' || (base.kind === 'npm' && head.pkg === base.pkg)) &&
      next.pkg !== head.pkg
    )
      setHead({ kind: 'npm', pkg: next.pkg, version: '' })
    setBase(next)
  }

  const swap = () => {
    setBase(head)
    setHead(base)
  }

  const example = () => {
    const b: SideInput = { kind: 'files', files: EXAMPLE.base }
    const h: SideInput = { kind: 'files', files: EXAMPLE.head }
    setBase(b)
    setHead(h)
    setInclude('')
    run(b, h)
  }

  return (
    <div className="token-diff">
      <form
        className={`window inputs${running ? ' is-loading' : ''}`}
        onSubmit={(e) => {
          e.preventDefault()
          run()
        }}
      >
        <SidePicker
          side="base"
          value={base}
          onChange={onBase}
          error={error?.side === 'base' ? error.message : undefined}
          info={result?.base}
          githubToken={githubToken}
          onGithubToken={setGithubToken}
        />
        <SidePicker
          side="head"
          value={head}
          onChange={setHead}
          error={error?.side === 'head' ? error.message : undefined}
          info={result?.head}
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
          <span className="actionbar__status">
            {error && !error.side ? (
              <span className="source__error">{error.message}</span>
            ) : running ? (
              t.inputs.progress[running]
            ) : null}
          </span>
          <button type="button" className="ghost" onClick={example}>
            {t.inputs.example}
          </button>
          <button type="button" className="ghost" onClick={swap}>
            {t.inputs.swap}
          </button>
          <span className="actionbar__sep" />
          <button
            type="submit"
            className="ghost ghost--strong"
            disabled={!ready(base) || !ready(head) || !!running}
          >
            {t.inputs.compare} <Keys keys={[MOD, '↵']} />
          </button>
        </footer>
      </form>

      {result && (
        <Results
          result={result}
          context={context}
          onContext={setContext}
          share={canShare ? () => navigator.clipboard.writeText(location.href) : undefined}
          shareNote={canShare ? undefined : t.inputs.shareTooBig}
        />
      )}
    </div>
  )
}
