import { useRef, useState } from 'react'
import { useT } from '../i18n/react'
import { codeFromDrop, codeFromInput } from '../lib/files'
import type { CodeInput, CodeReport, DroppedFile } from '../lib/types'
import { GitHubFields } from './SidePicker'

interface Props {
  value: CodeInput
  onChange: (value: CodeInput) => void
  /** What the last comparison read from it. */
  report?: CodeReport | undefined
  error?: string | undefined
  /** Token for private GitHub repositories, shared with the token sides. */
  githubToken?: string
  onGithubToken?: (token: string) => void
}

/** `TSX 8 · CSS 3 · Vue 1`: what was read, by kind, most first. */
export function kindsOf(files: DroppedFile[]): string {
  const counts = new Map<string, number>()
  for (const f of files) {
    const ext = /\.(\w+)$/.exec(f.path)?.[1]?.toLowerCase() ?? ''
    const kind =
      ext === 'vue'
        ? 'Vue'
        : ext === 'svelte'
          ? 'Svelte'
          : ext === 'astro'
            ? 'Astro'
            : ext.replace(/^m|^c(?=[jt]s$)/, '').toUpperCase()
    counts.set(kind, (counts.get(kind) ?? 0) + 1)
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k, n]) => `${k} ${n}`)
    .join(' · ')
}

const KINDS: Array<CodeInput['kind']> = ['files', 'github']

/** The optional row of the input window: the app that uses the tokens, as a folder or a repository. */
export function CodeField({ value, onChange, report, error, githubToken = '', onGithubToken }: Props) {
  const t = useT()
  const y = t.yourCode
  const [over, setOver] = useState(false)
  const [tokenOpen, setTokenOpen] = useState(false)
  const dir = useRef<HTMLInputElement>(null)
  const files = value.kind === 'files' ? value.files : []
  const setFiles = (list: DroppedFile[]) => onChange({ kind: 'files', files: list })

  const read = report
    ? [
        value.kind === 'github' && report.label ? report.label : '',
        report.limited ? y.limited(report.files, report.limited) : y.read(report.files),
        report.skipped.length ? y.skipped(report.skipped.length) : '',
      ].filter(Boolean)
    : []
  const meta = error ? (
    <span className="source__error">{error}</span>
  ) : value.kind === 'files' && files.length ? (
    `${report ? read.join(' · ') : y.read(files.length)}: ${kindsOf(files)}`
  ) : read.length ? (
    read.join(' · ')
  ) : null

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a drop target; the folder button is the keyboard path
    <div
      className={`source source--code${over ? ' source--over' : ''}${error ? ' source--error' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
      }}
      onDrop={async (e) => {
        e.preventDefault()
        setOver(false)
        const list = await codeFromDrop(e.dataTransfer)
        if (list.length) setFiles(list)
      }}
    >
      <div className="source__row">
        <span className="source__label">{y.title}</span>
        <div className="seg" role="tablist" aria-label={t.inputs.sourceAria}>
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={value.kind === k}
              className={value.kind === k ? 'is-on' : ''}
              onClick={() => {
                if (k === value.kind) return
                onChange(k === 'files' ? { kind: 'files', files: [] } : { kind: 'github', repo: '', ref: '' })
              }}
            >
              {y.kinds[k]}
            </button>
          ))}
        </div>
        {value.kind === 'github' ? (
          <>
            <GitHubFields value={value} onChange={onChange} placeholder="owner/repo/src" />
            {onGithubToken && (
              <button
                type="button"
                className="ghost"
                aria-expanded={tokenOpen}
                title={t.inputs.tokenTitle}
                onClick={() => setTokenOpen((o) => !o)}
              >
                {githubToken ? t.inputs.tokenSet : t.inputs.token}
              </button>
            )}
          </>
        ) : (
          <div className="source__files" title={y.formats}>
            {files.length === 0 ? (
              <span className="muted">{y.drop}</span>
            ) : (
              <span className="source__names" title={files.map((f) => f.path).join('\n')}>
                {files.length === 1 ? files[0]!.path : t.inputs.andMore(files[0]!.path, files.length - 1)}
              </span>
            )}
            <span className="source__file-actions">
              <button type="button" className="ghost" onClick={() => dir.current?.click()}>
                {y.folder}
              </button>
              {files.length > 0 && (
                <button type="button" className="ghost" onClick={() => setFiles([])} aria-label={y.clearAria}>
                  {y.clear}
                </button>
              )}
            </span>
            <input
              ref={dir}
              type="file"
              hidden
              // @ts-expect-error: non-standard but supported by every current browser
              webkitdirectory=""
              onChange={async (e) => setFiles(await codeFromInput(e.target.files))}
            />
          </div>
        )}
      </div>
      {value.kind === 'github' && onGithubToken && (tokenOpen || (!!error && !githubToken)) && (
        <div className="source__token">
          <input
            className="source__input"
            type="password"
            aria-label={t.inputs.tokenAria}
            value={githubToken}
            placeholder={t.inputs.tokenPlaceholder}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => onGithubToken(e.target.value.trim())}
          />
          <span className="muted small">{t.inputs.tokenNote}</span>
        </div>
      )}
      {meta && <div className="source__meta">{meta}</div>}
    </div>
  )
}
