import { type NpmVersions, npmVersions, parseRemoteSpec } from '@dsgraph/sources'
import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n/react'
import { filesFromDrop, filesFromInput } from '../lib/files'
import type { DroppedFile, SideInfo, SideInput } from '../lib/types'

type Kind = SideInput['kind']

const KINDS: Kind[] = ['npm', 'github', 'files']

const isStable = (v: string) => !v.includes('-')

/** Versions to compare by default: the latest and the stable release before it. */
export function defaultVersions(v: NpmVersions): { base: string; head: string } {
  const head = v.tags.latest ?? v.versions[0] ?? 'latest'
  const i = v.versions.indexOf(head)
  const base = v.versions.slice(i + 1).find(isStable) ?? v.versions[i + 1] ?? head
  return { base, head }
}

const versionCache = new Map<string, Promise<NpmVersions>>()
const versionsOf = (pkg: string) => {
  let p = versionCache.get(pkg)
  if (!p) {
    p = npmVersions(pkg)
    p.catch(() => versionCache.delete(pkg))
    versionCache.set(pkg, p)
  }
  return p
}

function useVersions(pkg: string) {
  const [state, setState] = useState<{ pkg: string; data?: NpmVersions; error?: string }>({ pkg: '' })
  useEffect(() => {
    const name = pkg.trim()
    if (!/^(@[\w.-]+\/)?[\w.-]+$/.test(name)) {
      setState({ pkg: name })
      return
    }
    let live = true
    const t = setTimeout(() => {
      versionsOf(name).then(
        (data) => live && setState({ pkg: name, data }),
        (e: Error) => live && setState({ pkg: name, error: e.message }),
      )
    }, 350)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [pkg])
  return state.pkg === pkg.trim() ? state : { pkg }
}

interface Props {
  side: 'base' | 'head'
  value: SideInput
  onChange: (v: SideInput) => void
  error?: string | undefined
  info?: SideInfo | undefined
  /** Token for private GitHub repositories, shared by both sides. */
  githubToken?: string
  onGithubToken?: (token: string) => void
}

/** One source row of the input window. Dropping files anywhere on it switches it to files. */
export function SidePicker({ side, value, onChange, error, info, githubToken = '', onGithubToken }: Props) {
  const t = useT()
  const [over, setOver] = useState(false)
  const [tokenOpen, setTokenOpen] = useState(false)
  const setKind = (kind: Kind) => {
    if (kind === value.kind) return
    if (kind === 'npm') onChange({ kind: 'npm', pkg: '', version: '' })
    else if (kind === 'github') onChange({ kind: 'github', repo: '', ref: '' })
    else onChange({ kind: 'files', files: [] })
  }
  const versions = useVersions(value.kind === 'npm' ? value.pkg : '')
  const meta = error ? (
    <span className="source__error">{error}</span>
  ) : value.kind === 'npm' && versions.error ? (
    <span className="source__error">{versions.error}</span>
  ) : info ? (
    <span title={info.files.join('\n')}>
      {t.inputs.tokens(info.tokens)} ·{' '}
      {info.files.length === 1 ? info.files[0] : t.inputs.files(info.files.length)}
      {info.modifiers.map((m) => ` · ${m.name}: ${m.contexts.join(', ')}`).join('')}
    </span>
  ) : null

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a drop target; the inputs inside are the keyboard path
    <div
      className={`source${over ? ' source--over' : ''}${error ? ' source--error' : ''}`}
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
        const files = await filesFromDrop(e.dataTransfer)
        if (files.length) onChange({ kind: 'files', files })
      }}
    >
      <div className="source__row">
        <span className="source__label">{side === 'base' ? t.inputs.before : t.inputs.after}</span>
        <div className="seg" role="tablist" aria-label={t.inputs.sourceAria}>
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={value.kind === k}
              className={value.kind === k ? 'is-on' : ''}
              onClick={() => setKind(k)}
            >
              {t.inputs.kinds[k]}
            </button>
          ))}
        </div>
        {value.kind === 'npm' && (
          <NpmFields side={side} value={value} onChange={onChange} versions={versions} />
        )}
        {value.kind === 'github' && <GitHubFields value={value} onChange={onChange} />}
        {value.kind === 'github' && onGithubToken && (
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
        {value.kind === 'files' && <FilesField files={value.files} onChange={onChange} />}
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

function NpmFields({
  side,
  value,
  onChange,
  versions,
}: {
  side: 'base' | 'head'
  value: Extract<SideInput, { kind: 'npm' }>
  onChange: (v: SideInput) => void
  versions: ReturnType<typeof useVersions>
}) {
  const t = useT()
  const data = versions.data
  // Pick sensible versions once the list arrives and none is chosen yet.
  useEffect(() => {
    if (data && !value.version) onChange({ ...value, version: defaultVersions(data)[side] })
  }, [data, value, side, onChange])
  const options = data
    ? [...new Set([...(data.versions.includes(value.version) ? [] : [value.version]), ...data.versions])]
    : []
  return (
    <>
      <input
        className="source__input"
        aria-label={t.inputs.pkgAria}
        value={value.pkg}
        placeholder={t.inputs.pkgPlaceholder}
        spellCheck={false}
        autoCapitalize="off"
        onChange={(e) => onChange({ kind: 'npm', pkg: e.target.value.trim(), version: '' })}
      />
      {data ? (
        <select
          className="accessory"
          aria-label={t.inputs.versionAria}
          value={value.version}
          onChange={(e) => onChange({ ...value, version: e.target.value })}
        >
          {options.filter(Boolean).map((v) => (
            <option key={v} value={v}>
              {v}
              {data.tags.latest === v ? `  ${t.inputs.latest}` : ''}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="accessory"
          aria-label={t.inputs.versionAria}
          value={value.version}
          placeholder={value.pkg && !versions.error ? '…' : t.inputs.versionPlaceholder}
          spellCheck={false}
          onChange={(e) => onChange({ ...value, version: e.target.value.trim() })}
        />
      )}
    </>
  )
}

function GitHubFields({
  value,
  onChange,
}: {
  value: Extract<SideInput, { kind: 'github' }>
  onChange: (v: SideInput) => void
}) {
  const t = useT()
  const shown = value.repo ? `${value.repo}${value.root ? `/${value.root}` : ''}` : ''
  const [text, setText] = useState(shown)
  useEffect(() => setText(shown), [shown])
  const commit = (repoPath: string) => {
    const r = parseRemoteSpec(
      `github:${repoPath.replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '')}`,
    )
    if (r?.kind === 'github') {
      const next: SideInput = { kind: 'github', repo: r.repo, ref: value.ref }
      if (r.root) next.root = r.root
      onChange(next)
    }
  }
  return (
    <>
      <input
        className="source__input"
        aria-label={t.inputs.repoAria}
        value={text}
        placeholder="owner/repo/tokens"
        spellCheck={false}
        autoCapitalize="off"
        onChange={(e) => {
          setText(e.target.value)
          commit(e.target.value.trim())
        }}
      />
      <input
        className="accessory"
        aria-label={t.inputs.refAria}
        value={value.ref}
        placeholder="main"
        spellCheck={false}
        onChange={(e) => onChange({ ...value, ref: e.target.value.trim() })}
      />
    </>
  )
}

function FilesField({ files, onChange }: { files: DroppedFile[]; onChange: (v: SideInput) => void }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const dirInput = useRef<HTMLInputElement>(null)
  const t = useT()
  const set = (list: DroppedFile[]) => onChange({ kind: 'files', files: list })
  return (
    <div className="source__files">
      {files.length === 0 ? (
        <span className="muted">{t.inputs.drop}</span>
      ) : (
        <span className="source__names" title={files.map((f) => f.path).join('\n')}>
          {files.length === 1 ? files[0]!.path : t.inputs.andMore(files[0]!.path, files.length - 1)}
        </span>
      )}
      <span className="source__file-actions">
        <button type="button" className="ghost" onClick={() => fileInput.current?.click()}>
          {t.inputs.filesButton}
        </button>
        <button type="button" className="ghost" onClick={() => dirInput.current?.click()}>
          {t.inputs.folderButton}
        </button>
        {files.length > 0 && (
          <button type="button" className="ghost" onClick={() => set([])} aria-label={t.inputs.clearAria}>
            {t.inputs.clear}
          </button>
        )}
      </span>
      <input
        ref={fileInput}
        type="file"
        multiple
        accept=".json,.jsonc,.tokens,.css"
        hidden
        onChange={async (e) => set(await filesFromInput(e.target.files))}
      />
      <input
        ref={dirInput}
        type="file"
        hidden
        // @ts-expect-error: non-standard but supported by every current browser
        webkitdirectory=""
        onChange={async (e) => set(await filesFromInput(e.target.files))}
      />
    </div>
  )
}
